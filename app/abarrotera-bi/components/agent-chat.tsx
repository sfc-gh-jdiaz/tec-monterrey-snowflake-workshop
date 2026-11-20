'use client';

import { useApp } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { Bot, ChevronDown, Code2, Loader2, Send, Sparkles, User } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Tabla = { sql?: string; columns: string[]; rows: unknown[][] };
type Grafica = { tipo: 'bar' | 'line'; x: string; y: string; data: Record<string, unknown>[]; titulo?: string };
type Msg = {
  role: 'user' | 'assistant';
  text: string;
  status?: string;
  thinking?: string;
  tablas?: Tabla[];
  graficas?: Grafica[];
  sugeridas?: string[];
  error?: string;
  done?: boolean;
};

export const PREGUNTAS_SUGERIDAS = [
  '¿Cuánto cayó la venta de Bebidas en el Bajío de septiembre a octubre 2026?',
  '¿Cuál fue la tasa de quiebre de Bebidas por región en octubre 2026?',
  '¿Qué dicen los tenderos del Bajío sobre el abasto?',
  '¿Desde qué CEDIS conviene reasignar inventario a León y cuánto tarda el camión?',
  '¿Cuánto debimos vender en octubre según el pronóstico y cuánto está en riesgo en noviembre?',
  '¿Qué proveedores tuvieron el peor fill rate en octubre?',
  '¿Qué dice el procedimiento de abasto sobre reasignar inventario ante un quiebre?',
];

/** Markdown mínimo: títulos, viñetas, negritas y tablas con pipes. */
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  const inline = (s: string, k: number) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
      p.startsWith('**') ? (
        <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong>
      ) : p.startsWith('`') ? (
        <code key={`${k}-${i}`} className="rounded bg-slate-100 px-1 text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      ) : (
        p
      ),
    );
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim().startsWith('|')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) block.push(lines[i++]);
      i--;
      const cells = block.filter((b) => !/^\s*\|[\s:|-]+\|\s*$/.test(b)).map((b) => b.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      out.push(
        <div key={i} className="my-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>{cells[0]?.map((c, j) => <th key={j} className="border-b bg-slate-50 px-2 py-1 text-left font-semibold">{inline(c, j)}</th>)}</tr>
            </thead>
            <tbody>
              {cells.slice(1).map((r, ri) => (
                <tr key={ri} className="border-b last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1">
                      {inline(c, j)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^#{1,4}\s/.test(l)) out.push(<div key={i} className="mt-2 font-semibold text-slate-800">{inline(l.replace(/^#+\s/, ''), i)}</div>);
    else if (/^\s*[-*]\s/.test(l)) out.push(<div key={i} className="ml-3 flex gap-1.5"><span className="text-sky-500">•</span><span>{inline(l.replace(/^\s*[-*]\s/, ''), i)}</span></div>);
    else if (/^\s*\d+\.\s/.test(l)) out.push(<div key={i} className="ml-3">{inline(l.trim(), i)}</div>);
    else if (l.trim() === '') out.push(<div key={i} className="h-2" />);
    else out.push(<p key={i}>{inline(l, i)}</p>);
  }
  return <div className="space-y-0.5 text-sm leading-relaxed">{out}</div>;
}

function TablaResultado({ t }: { t: Tabla }) {
  const [sql, setSql] = useState(false);
  if (!t.rows.length && !t.sql) return null;
  return (
    <div className="mt-2 rounded-lg border bg-white">
      {t.rows.length > 0 && (
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-50">
              <tr>{t.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-semibold text-slate-600">{c}</th>)}</tr>
            </thead>
            <tbody>
              {t.rows.slice(0, 25).map((r, i) => (
                <tr key={i} className="border-t">
                  {r.map((v, j) => {
                    const num = typeof v === 'string' && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v) ? Number(v) : v;
                    return (
                      <td key={j} className="whitespace-nowrap px-2 py-1 tabular-nums">
                        {typeof num === 'number' ? num.toLocaleString('es-MX', { maximumFractionDigits: 2 }) : String(v ?? '')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {t.sql && (
        <button onClick={() => setSql((s) => !s)} className="flex w-full items-center gap-1 border-t px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50">
          <Code2 className="size-3" /> {sql ? 'Ocultar SQL' : 'Ver SQL generado'} <ChevronDown className={cn('ml-auto size-3 transition', sql && 'rotate-180')} />
        </button>
      )}
      {sql && <pre className="max-h-48 overflow-auto border-t bg-slate-950 p-2 text-[10px] text-sky-100">{t.sql}</pre>}
    </div>
  );
}

function GraficaResultado({ g }: { g: Grafica }) {
  const data = g.data.map((d) => ({ ...d, [g.y]: Number(d[g.y]) }));
  return (
    <div className="mt-2 rounded-lg border bg-white p-2">
      {g.titulo && <div className="mb-1 text-xs font-semibold text-slate-600">{g.titulo}</div>}
      <ResponsiveContainer width="100%" height={180}>
        {g.tipo === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={g.x} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line dataKey={g.y} stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={g.x} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey={g.y} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Convierte un spec de Vega-Lite del agente en una gráfica simple de Recharts. */
function desdeVega(specText: string): Grafica | null {
  try {
    const spec = JSON.parse(specText);
    const values = spec?.data?.values;
    const x = spec?.encoding?.x?.field;
    const y = spec?.encoding?.y?.field;
    if (!Array.isArray(values) || !x || !y) return null;
    const mark = typeof spec.mark === 'string' ? spec.mark : spec.mark?.type;
    return { tipo: mark === 'line' ? 'line' : 'bar', x, y, data: values, titulo: spec.title?.text ?? spec.title };
  } catch {
    return null;
  }
}

export type AgentChatHandle = { enviar: (q: string) => void };

export const AgentChat = forwardRef<AgentChatHandle, { compacto?: boolean }>(function AgentChat({ compacto }, ref) {
  const { rol } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const enviar = useCallback(
    async (q: string) => {
      const pregunta = q.trim();
      if (!pregunta || busy) return;
      setInput('');
      setBusy(true);
      const historia = [...msgs, { role: 'user' as const, text: pregunta }];
      setMsgs([...historia, { role: 'assistant', text: '', status: 'Pensando…' }]);
      const patch = (f: (m: Msg) => Msg) =>
        setMsgs((all) => {
          const copy = [...all];
          copy[copy.length - 1] = f({ ...copy[copy.length - 1] });
          return copy;
        });
      try {
        const res = await fetch('/api/agente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rol,
            messages: historia.filter((m) => m.text).map((m) => ({ role: m.role, content: [{ type: 'text', text: m.text }] })),
          }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let evento = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('event:')) evento = line.slice(6).trim();
            else if (line.startsWith('data:')) {
              let d: Record<string, unknown>;
              try {
                d = JSON.parse(line.slice(5));
              } catch {
                continue;
              }
              if (evento === 'response.text.delta') patch((m) => ({ ...m, text: m.text + String(d.text ?? ''), status: undefined }));
              else if (evento === 'response.status') patch((m) => ({ ...m, status: String(d.message ?? '') }));
              else if (evento === 'response.thinking.delta') patch((m) => ({ ...m, thinking: (m.thinking ?? '') + String(d.text ?? '') }));
              else if (evento === 'response.tool_result') {
                const content = (d.content as { json?: Record<string, unknown> }[] | undefined) ?? [];
                for (const c of content) {
                  const j = c.json;
                  const rs = j?.result_set as { data?: unknown[][]; resultSetMetaData?: { rowType?: { name: string }[] } } | undefined;
                  if (j?.sql || rs?.data) {
                    const t: Tabla = { sql: j?.sql as string | undefined, columns: rs?.resultSetMetaData?.rowType?.map((r) => r.name) ?? [], rows: rs?.data ?? [] };
                    patch((m) => ({ ...m, tablas: [...(m.tablas ?? []), t] }));
                  }
                }
              } else if (evento === 'response.chart') {
                const g = desdeVega(String(d.chart_spec ?? ''));
                if (g) patch((m) => ({ ...m, graficas: [...(m.graficas ?? []), g] }));
              } else if (evento === 'response.suggested_queries') {
                const s = (d.suggested_queries as { query: string }[] | undefined)?.map((x) => x.query) ?? [];
                patch((m) => ({ ...m, sugeridas: s }));
              } else if (evento === 'error') patch((m) => ({ ...m, error: String(d.message ?? 'Error del agente') }));
            }
          }
        }
        patch((m) => ({ ...m, status: undefined, done: true }));
      } catch (e) {
        patch((m) => ({ ...m, status: undefined, error: e instanceof Error ? e.message : String(e), done: true }));
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, rol],
  );

  useImperativeHandle(ref, () => ({ enviar }), [enviar]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg">
              <Sparkles className="size-6" />
            </div>
            <div className="font-semibold text-slate-800">AGENTE_COMERCIAL</div>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
              Cortex Agent sobre la Semantic View SV_COMERCIAL, el pronóstico, la voz del cliente y los procedimientos de abasto. Pregunta en español.
            </p>
            <div className={cn('mt-4 grid gap-2 text-left', !compacto && 'md:grid-cols-2')}>
              {PREGUNTAS_SUGERIDAS.slice(0, compacto ? 5 : 7).map((p) => (
                <button key={p} onClick={() => enviar(p)} className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
            <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-gradient-to-br from-sky-500 to-indigo-500 text-white')}>
              {m.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
            </div>
            <div className={cn('min-w-0 max-w-[88%] rounded-2xl px-3 py-2', m.role === 'user' ? 'bg-sky-600 text-white' : 'border bg-slate-50 text-slate-800')}>
              {m.role === 'user' ? (
                <div className="text-sm">{m.text}</div>
              ) : (
                <>
                  {m.status && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="size-3 animate-spin" /> {m.status}
                    </div>
                  )}
                  {m.thinking && !m.done && <div className="mt-1 line-clamp-3 text-[11px] italic text-slate-400">{m.thinking}</div>}
                  {m.text && <Markdown text={m.text} />}
                  {m.graficas?.map((g, j) => <GraficaResultado key={j} g={g} />)}
                  {m.tablas?.filter((t) => t.rows.length).slice(-2).map((t, j) => <TablaResultado key={j} t={t} />)}
                  {m.error && <div className="mt-1 text-xs text-rose-600">⚠ {m.error}</div>}
                  {m.done && m.sugeridas && m.sugeridas.length > 0 && i === msgs.length - 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.sugeridas.map((s) => (
                        <button key={s} onClick={() => enviar(s)} className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] text-sky-700 hover:bg-sky-50">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(input);
        }}
        className="flex gap-2 border-t bg-white p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale al agente…"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          disabled={busy}
        />
        <button disabled={busy || !input.trim()} className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  );
});
