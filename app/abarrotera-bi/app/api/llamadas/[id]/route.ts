/**
 * GET /api/llamadas/<id>?rol=
 *
 * Detalle de una llamada del call center (03c_call_center): turnos con su segundo, campos extraídos con IA y
 * un enlace temporal al audio. El enlace se genera con GET_PRESIGNED_URL sobre @TEC_DEMO.RAW.AUDIOS (stage
 * que ningún rol de negocio lee) y SOLO si la llamada es de una región que el usuario puede ver
 * (RAP_REGION con caller's rights; `rol` solo puede reducirlas, ver lib/acceso.ts). Caduca en 10 minutos.
 */

import { regionesEfectivas } from '@/lib/acceso';
import { ESQUEMA } from '@/lib/constants';
import { errorResponse } from '@/lib/errores';
import { snowflake } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

/** Segundos de vida del enlace al audio: alcanza para escuchar la llamada más larga (~6 min) con margen. */
export const AUDIO_TTL_SEG = 600;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,6}$/.test(id)) return Response.json({ error: 'Llamada no válida' }, { status: 400 });
  const rol = new URL(request.url).searchParams.get('rol');
  try {
    const { regiones } = await regionesEfectivas(rol);
    if (!regiones.length) return Response.json({ error: 'Llamada no encontrada' }, { status: 404 });

    const sql = `
SELECT llamada_id, fecha, region, estado, ciudad, tienda, agente, duracion_seg, categoria, urgencia, sentimiento,
       sentimiento_logistica, sentimiento_servicio, sentimiento_producto, producto_afectado, causa, compromiso, plazo,
       folio, resumen, segmentos,
       GET_PRESIGNED_URL(@${ESQUEMA.RAW}.AUDIOS, archivo, ${AUDIO_TTL_SEG}) AS audio_url
FROM ${ESQUEMA.ANALITICA}.LLAMADAS_360
WHERE llamada_id = ? AND region IN (${regiones.map(() => '?').join(', ')})`;
    const { rows } = await snowflake.query<Record<string, unknown>>(sql, { binds: [Number(id), ...regiones] });
    if (!rows.length) return Response.json({ error: 'Llamada no encontrada' }, { status: 404 });

    const r = Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k.toLowerCase(), v]));
    // VARIANT puede llegar como texto según el driver
    if (typeof r.segmentos === 'string') r.segmentos = JSON.parse(r.segmentos);
    return Response.json(r, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return errorResponse('llamadas/detalle', e);
  }
}
