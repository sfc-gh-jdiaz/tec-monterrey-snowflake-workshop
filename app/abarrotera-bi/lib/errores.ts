/**
 * Respuestas de error para las rutas de la API: el navegador recibe un mensaje genérico y un id
 * para buscar en los logs; el detalle (SQL, nombres de objetos, mensajes del driver) solo va al log.
 */

export function errorResponse(contexto: string, e: unknown, status = 500, mensaje = 'No se pudo completar la consulta'): Response {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.error(`[${requestId}] ${contexto}:`, e);
  return Response.json({ error: `${mensaje} (ref. ${requestId})`, requestId }, { status });
}
