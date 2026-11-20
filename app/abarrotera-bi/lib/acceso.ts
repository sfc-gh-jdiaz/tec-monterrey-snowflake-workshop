/**
 * Qué regiones puede ver quien abrió la app. La decide Snowflake, no el navegador:
 *
 * 1. Con caller's rights (el usuario que abrió la app, con su rol por defecto) se pregunta qué regiones
 *    deja ver la Row Access Policy RAP_REGION. Ese es el TOPE.
 * 2. El selector de rol de la demo ("ver como GERENTE_BAJIO") solo puede REDUCIR ese tope, nunca ampliarlo:
 *    un gerente que mande rol=DIRECTOR_COMERCIAL sigue viendo solo su región.
 *
 * En `next dev` no hay caller's rights: la consulta corre con la conexión local (ver lib/run-as.ts).
 */

import { ESQUEMA } from '@/lib/constants';
import { REGIONES } from '@/lib/queries';
import { regionesDe } from '@/lib/roles';
import { withCaller } from '@/lib/run-as';

/** RAP_REGION filtra esta tabla por región: lo que regresa es lo que el usuario puede ver. */
export const VISIBLES_QUERY = `SELECT DISTINCT region AS REGION FROM ${ESQUEMA.ANALITICA}.VENTAS_MENSUALES`;

/** Regiones que RAP_REGION deja ver al usuario que abrió la app, en el orden de REGIONES. */
export async function regionesVisibles(): Promise<string[]> {
  const { regiones } = await withCaller(async (client) => {
    const { rows } = await client.query<{ REGION: string }>(VISIBLES_QUERY);
    return { regiones: rows.map((r) => r.REGION) };
  });
  return ordenar(regiones);
}

/** Intersección del rol elegido en el selector (si hay) con lo que el usuario realmente puede ver. */
export function recortar(visibles: string[], delRol: string[] | null): string[] {
  if (delRol === null) return visibles;
  const permitidas = new Set(delRol);
  return visibles.filter((r) => permitidas.has(r));
}

/** Regiones efectivas para esta petición: tope del usuario recortado por el rol del selector. */
export async function regionesEfectivas(rol: string | null): Promise<{ regiones: string[]; visibles: string[] }> {
  const visibles = await regionesVisibles();
  const regiones = recortar(visibles, rol ? await regionesDe(rol) : null);
  return { regiones, visibles };
}

function ordenar(regiones: string[]): string[] {
  const pos = (r: string) => {
    const i = REGIONES.indexOf(r);
    return i === -1 ? REGIONES.length : i;
  };
  return [...new Set(regiones)].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}
