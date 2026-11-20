import { CacheLRU, ttlDesdeEnv } from '@/lib/cache';
import { ROLES_QUERY } from '@/lib/queries';
import { snowflake } from '@/lib/snowflake';

type Acceso = Record<string, string[]>;

// Un cambio en ACCESO_REGION tarda hasta este TTL en verse en el selector (CACHE_ROLES_MIN, default 5).
// No afecta la seguridad: el tope lo decide RAP_REGION en cada petición (lib/acceso.ts).
const cache = new CacheLRU<Acceso>(1, ttlDesdeEnv('CACHE_ROLES_MIN', 5));

/** Rol → regiones, leído de TEC_DEMO.ANALITICA.ACCESO_REGION ('*' ya viene expandido con RAW.REGIONES). */
export async function accesos(): Promise<Acceso> {
  const hit = cache.get('acceso');
  if (hit) return hit;
  const { rows } = await snowflake.query<{ ROL: string; REGION: string }>(ROLES_QUERY);
  const acceso: Acceso = {};
  for (const r of rows) (acceso[r.ROL] ??= []).push(r.REGION);
  cache.set('acceso', acceso);
  return acceso;
}

/** Regiones visibles para un rol; un rol desconocido no ve nada. */
export async function regionesDe(rol: string | null): Promise<string[]> {
  const acceso = await accesos();
  return acceso[rol ?? 'DIRECTOR_COMERCIAL'] ?? [];
}
