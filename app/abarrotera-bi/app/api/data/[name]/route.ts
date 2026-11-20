/**
 * GET /api/data/<consulta>?rol=GERENTE_BAJIO
 *
 * Ejecuta una consulta con nombre de lib/queries.ts filtrada a las regiones que el usuario puede ver
 * (decididas por RAP_REGION con caller's rights; `rol` solo puede reducirlas, ver lib/acceso.ts).
 * Las llaves de cada fila se devuelven en minúsculas.
 */

import { regionesEfectivas } from '@/lib/acceso';
import { CacheLRU, ttlDesdeEnv } from '@/lib/cache';
import { errorResponse } from '@/lib/errores';
import { QUERIES, compile } from '@/lib/queries';
import { snowflake } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

// ~20 consultas × combinaciones de regiones: 200 entradas sobran. TTL configurable con CACHE_DATOS_MIN (default 10).
const cache = new CacheLRU<unknown[]>(200, ttlDesdeEnv('CACHE_DATOS_MIN', 10));

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const sql = QUERIES[name];
  if (!Object.hasOwn(QUERIES, name)) return Response.json({ error: 'Consulta desconocida' }, { status: 404 });

  const rol = new URL(request.url).searchParams.get('rol');
  try {
    const { regiones } = await regionesEfectivas(rol);
    const key = `${name}|${regiones.join(',')}`;
    const hit = cache.get(key);
    if (hit) return Response.json({ rows: hit, regiones });

    const compiled = compile(sql, regiones);
    const { rows } = await snowflake.query<Record<string, unknown>>(compiled.sql, { binds: compiled.binds });
    const out = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));
    cache.set(key, out);
    return Response.json({ rows: out, regiones });
  } catch (e) {
    return errorResponse(`data/${name}`, e);
  }
}
