/**
 * POST /api/agente  { messages: [{ role, content: [{ type: 'text', text }] }], rol?: string }
 *
 * Reenvía la conversación a TEC_DEMO.AGENTES.AGENTE_COMERCIAL (Cortex Agents REST, agent:run)
 * y devuelve el stream SSE tal cual para que el navegador lo pinte en vivo.
 *
 * El agente corre con caller's rights: como el usuario que abrió la app, con su rol por defecto.
 * Así RAP_REGION y MASK_PII se aplican dentro de Snowflake a cada consulta que haga el agente;
 * el `rol` del selector de la demo solo agrega una indicación para acotar más la respuesta.
 */

import { regionesEfectivas } from '@/lib/acceso';
import { prepararMensajes } from '@/lib/agente';
import { AGENTE, DB } from '@/lib/constants';
import { errorResponse } from '@/lib/errores';
import { callersRightsActive } from '@/lib/run-as';
import { asCaller, snowflake } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

const AGENT_PATH = `/api/v2/databases/${DB}/schemas/${AGENTE.esquema}/agents/${AGENTE.nombre}:run`;

export async function POST(request: Request) {
  let body: { messages?: unknown; rol?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const messages = prepararMensajes(body.messages);
  if (!messages) return Response.json({ error: 'Falta la pregunta' }, { status: 400 });

  try {
    // Si el selector de la demo ve menos regiones que el usuario, se le pide al agente acotar la respuesta.
    // Es solo presentación: lo que el agente PUEDE leer ya lo limita RAP_REGION para el usuario real.
    const { regiones, visibles } = await regionesEfectivas(typeof body.rol === 'string' ? body.rol : null);
    if (regiones.length < visibles.length) {
      const last = messages[messages.length - 1];
      last.content = [
        {
          type: 'text',
          text: `${last.content[0].text}\n\n(Contexto: responde solo con datos de ${regiones.length ? regiones.join(', ') : 'ninguna región'}.)`,
        },
      ];
    }

    const client = callersRightsActive() ? await asCaller() : snowflake;
    const res = await client.fetch(AGENT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages }),
      timeoutMs: 3 * 60_000,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      return errorResponse('agente', `HTTP ${res.status}: ${text.slice(0, 500)}`, 502, 'El agente no pudo responder');
    }
    return new Response(res.body as ReadableStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  } catch (e) {
    return errorResponse('agente', e, 502, 'El agente no pudo responder');
  }
}
