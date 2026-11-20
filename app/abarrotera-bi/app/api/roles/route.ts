/** GET /api/roles: los roles de la demo, las regiones que ve cada uno y el tope del usuario que abrió la app. */

import { regionesVisibles } from '@/lib/acceso';
import { errorResponse } from '@/lib/errores';
import { accesos } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [roles, visibles] = await Promise.all([accesos(), regionesVisibles()]);
    return Response.json({ roles, visibles });
  } catch (e) {
    return errorResponse('roles', e);
  }
}
