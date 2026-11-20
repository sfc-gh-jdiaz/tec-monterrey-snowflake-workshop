/** Validación de la conversación que la app reenvía al Agente Comercial. */

/** Límites de la conversación que se reenvía al agente. */
export const MAX_MENSAJES = 20;
export const MAX_CARACTERES = 4000;

export type Msg = { role: 'user' | 'assistant'; content: { type: 'text'; text: string }[] };

/** Valida y recorta la conversación; null si no hay una pregunta válida al final. */
export function prepararMensajes(raw: unknown): Msg[] | null {
  if (!Array.isArray(raw)) return null;
  const messages: Msg[] = raw
    .filter(
      (m): m is Msg =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content?.[0]?.text === 'string' && m.content[0].text.trim() !== '',
    )
    .slice(-MAX_MENSAJES)
    .map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content[0].text.slice(0, MAX_CARACTERES) }] }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return null;
  return messages;
}
