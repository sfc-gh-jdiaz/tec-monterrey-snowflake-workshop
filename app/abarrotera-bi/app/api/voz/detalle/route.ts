/**
 * GET /api/voz/detalle?rol=&id=&comentario=&texto=&estado=&mes=&cal=
 *
 * Comentarios individuales (feedback_id, fecha, estado, canal, calificación) para el panel de detalle
 * de Voz del cliente. Todos los valores van como binds y se limita a las regiones que el usuario puede ver
 * (RAP_REGION con caller's rights; `rol` solo puede reducirlas, ver lib/acceso.ts).
 */

import { regionesEfectivas } from '@/lib/acceso';
import { ESQUEMA } from '@/lib/constants';
import { errorResponse } from '@/lib/errores';
import { snowflake } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

const A = ESQUEMA.ANALITICA;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    const { regiones } = await regionesEfectivas(p.get('rol'));
    if (!regiones.length) return Response.json({ rows: [], total: 0 });

    const where: string[] = [`v.region IN (${regiones.map(() => '?').join(', ')})`];
    const binds: (string | number)[] = [...regiones];

    const id = p.get('id');
    if (id) {
      if (!/^#?\d{1,9}$/.test(id.trim())) return Response.json({ rows: [], total: 0 });
      where.push('v.feedback_id = ?');
      binds.push(Number(id.trim().replace('#', '')));
    }
    const comentario = p.get('comentario');
    if (comentario) {
      where.push('v.comentario = ?');
      binds.push(comentario);
    }
    const texto = p.get('texto')?.trim().slice(0, 100);
    if (texto) {
      // % y _ del usuario se buscan literalmente, no como comodines
      where.push("v.comentario ILIKE ? ESCAPE '\\\\'");
      binds.push(`%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    for (const [param, col] of [['estado', 'v.estado'], ['region', 'v.region'], ['sentimiento', 't.sentimiento'], ['tema', 't.tema']] as const) {
      const vals = p.getAll(param).filter(Boolean);
      if (vals.length) {
        where.push(`${col} IN (${vals.map(() => '?').join(', ')})`);
        binds.push(...vals);
      }
    }
    const meses = p.getAll('mes').filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m));
    if (meses.length) {
      where.push(`v.mes IN (${meses.map(() => '?').join(', ')})`);
      binds.push(...meses);
    }
    const cal = p.getAll('cal').map(Number).filter((c) => c >= 1 && c <= 5);
    if (cal.length) {
      where.push(`v.calificacion IN (${cal.map(() => '?').join(', ')})`);
      binds.push(...cal);
    }

    // 201 filas: si llegan 201 hay más de 200 (sin COUNT(*) OVER(), que obligaba a contar todo en cada petición)
    const sql = `
SELECT v.feedback_id, v.fecha, v.region, v.estado, v.canal, v.calificacion, t.tema, t.sentimiento, v.comentario
FROM ${A}.VOZ_CLIENTE v JOIN ${A}.TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id
WHERE ${where.join(' AND ')}
ORDER BY v.fecha DESC, v.feedback_id DESC
LIMIT 201`;
    const { rows } = await snowflake.query<Record<string, unknown>>(sql, { binds });
    const out = rows.slice(0, 200).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));
    return Response.json({ rows: out, total: out.length, hayMas: rows.length > 200 });
  } catch (e) {
    return errorResponse('voz/detalle', e);
  }
}
