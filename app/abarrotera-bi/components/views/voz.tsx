'use client';

import { Cargando, Kpi, Panel, ViewHeader } from '@/components/bi';
import { BarraFiltros, Busqueda, Chips, Selector, useFiltros } from '@/components/filtros';
import { COLOR_REGION, COLOR_TEMA, mesCorto, n, num, useApp, useData, type Row } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Hash, Loader2, MessageSquareWarning, MessagesSquare, Quote, Smile, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const SENT: Record<string, { t: string; c: string; color: string }> = {
  negative: { t: 'Negativo', c: 'bg-rose-100 text-rose-700', color: '#e11d48' },
  neutral: { t: 'Neutral', c: 'bg-slate-100 text-slate-600', color: '#64748b' },
  positive: { t: 'Positivo', c: 'bg-emerald-100 text-emerald-700', color: '#059669' },
};
const CAL = [
  { id: 'queja', label: '1–2 · queja', color: '#e11d48', test: (c: number) => c <= 2 },
  { id: 'neutra', label: '3', color: '#f59e0b', test: (c: number) => c === 3 },
  { id: 'buena', label: '4–5', color: '#059669', test: (c: number) => c >= 4 },
];
const PERIODOS: Record<string, { label: string; meses: string[] }> = {
  oct: { label: 'Octubre 2026', meses: ['2026-10-01'] },
  sep: { label: 'Septiembre 2026', meses: ['2026-09-01'] },
  sepoct: { label: 'Sep – oct 2026', meses: ['2026-09-01', '2026-10-01'] },
  q3: { label: 'Jul – oct 2026', meses: ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'] },
  anio: { label: 'Ene – oct 2026', meses: [] },
};

type F = 'sentimiento' | 'tema' | 'region' | 'cal';

export function Voz() {
  const { data, isPending, error } = useData('voz');
  const f = useFiltros<F>();
  const [periodo, setPeriodo] = useState('oct');
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<{ comentario?: string; id?: string } | null>(null);

  const rows = useMemo<Row[]>(() => (data?.rows ?? []).map((r) => ({ ...r, mes: String(r.mes).slice(0, 10), n: n(r.n), calificacion: n(r.calificacion) })), [data]);
  const estados = useMemo(() => [...new Set(rows.filter((r) => f.pasa('region', r.region)).map((r) => String(r.estado)))].sort(), [rows, f]);
  const regiones = useMemo(() => [...new Set(rows.map((r) => String(r.region)))], [rows]);

  const esId = /^#?\d+$/.test(busqueda.trim());
  const texto = esId ? '' : busqueda.trim().toLowerCase();

  // Todos los filtros excepto el periodo (para las series de tiempo)
  const pasaSinMes = (r: Row) =>
    f.pasa('sentimiento', r.sentimiento) &&
    f.pasa('tema', r.tema) &&
    f.pasa('region', r.region) &&
    (!estado || r.estado === estado) &&
    (!f.sel.cal?.length || CAL.some((c) => f.sel.cal!.includes(c.id) && c.test(n(r.calificacion)))) &&
    (!texto || String(r.comentario).toLowerCase().includes(texto));
  const meses = PERIODOS[periodo].meses;
  const pasa = (r: Row) => pasaSinMes(r) && (!meses.length || meses.includes(String(r.mes)));

  const filtradas = rows.filter(pasa);
  const total = filtradas.reduce((s, r) => s + n(r.n), 0);
  const totalPeriodo = rows.filter((r) => !meses.length || meses.includes(String(r.mes))).reduce((s, r) => s + n(r.n), 0);
  const negativos = filtradas.filter((r) => r.sentimiento === 'negative').reduce((s, r) => s + n(r.n), 0);
  const calProm = total ? filtradas.reduce((s, r) => s + n(r.calificacion) * n(r.n), 0) / total : NaN;
  const quejasDesabasto = filtradas.filter((r) => r.tema === 'Desabasto de producto' && n(r.calificacion) <= 2).reduce((s, r) => s + n(r.n), 0);

  const { serie, temas } = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows.filter(pasaSinMes)) {
      const o = m.get(String(r.mes)) ?? { mes: r.mes };
      o[String(r.tema)] = n(o[String(r.tema)] ?? 0) + n(r.n);
      m.set(String(r.mes), o);
    }
    return { serie: [...m.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes))), temas: Object.keys(COLOR_TEMA) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, f.sel, estado, texto]);

  const serieCal = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows.filter(pasaSinMes)) {
      const o = m.get(String(r.mes)) ?? { mes: r.mes };
      const k = String(r.region);
      o[`s_${k}`] = n(o[`s_${k}`] ?? 0) + n(r.calificacion) * n(r.n);
      o[`n_${k}`] = n(o[`n_${k}`] ?? 0) + n(r.n);
      o[k] = n(o[`s_${k}`]) / n(o[`n_${k}`]);
      m.set(String(r.mes), o);
    }
    return [...m.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, f.sel, estado, texto]);

  const citas = useMemo(() => {
    const m = new Map<string, { comentario: string; tema: string; sentimiento: string; veces: number; suma: number }>();
    for (const r of filtradas) {
      const k = String(r.comentario);
      const o = m.get(k) ?? { comentario: k, tema: String(r.tema), sentimiento: String(r.sentimiento), veces: 0, suma: 0 };
      o.veces += n(r.n);
      o.suma += n(r.calificacion) * n(r.n);
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => b.veces - a.veces);
  }, [filtradas]);

  const activos = f.activos + (estado ? 1 : 0) + (busqueda ? 1 : 0) + (periodo !== 'oct' ? 1 : 0);

  return (
    <div>
      <ViewHeader
        icon={MessagesSquare}
        title="Voz del cliente"
        subtitle="60,000 comentarios de tenderos clasificados por tema y sentimiento con funciones de IA de Snowflake (AI_CLASSIFY, AI_SENTIMENT). Filtra por sentimiento, tema, región, estado o calificación, o busca un comentario por su texto o su ID."
        pregunta="¿Qué dicen los tenderos del Bajío en octubre 2026? Resume las quejas principales con ejemplos."
      />

      <BarraFiltros
        activos={activos}
        onLimpiar={() => {
          f.limpiar();
          setEstado('');
          setBusqueda('');
          setPeriodo('oct');
        }}
        resumen={!isPending && <span>Mostrando <b className="text-slate-800">{num(total)}</b> de {num(totalPeriodo)} comentarios</span>}
      >
        <Chips label="Sentimiento" opciones={Object.entries(SENT).map(([id, s]) => ({ id, label: s.t, color: s.color }))} seleccion={f.sel.sentimiento} onToggle={(v) => f.toggle('sentimiento', v)} onTodos={() => f.set('sentimiento', [])} />
        <Chips label="Calificación" opciones={CAL} seleccion={f.sel.cal} onToggle={(v) => f.toggle('cal', v)} />
        <Selector label="Periodo" value={periodo} onChange={setPeriodo} opciones={Object.entries(PERIODOS).map(([id, p]) => ({ id, label: p.label }))} />
        <Chips label="Región" opciones={regiones.map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={f.sel.region} onToggle={(v) => { f.toggle('region', v); setEstado(''); }} />
        <Selector label="Estado" value={estado} onChange={setEstado} opciones={[{ id: '', label: 'Todos' }, ...estados.map((e) => ({ id: e }))]} />
        <Chips label="Tema" opciones={Object.entries(COLOR_TEMA).map(([id, color]) => ({ id, color }))} seleccion={f.sel.tema} onToggle={(v) => f.toggle('tema', v)} />
        <div className="flex items-center gap-2">
          <Busqueda value={busqueda} onChange={setBusqueda} placeholder="Buscar texto o ID de comentario (ej. #41237)" />
          {esId && (
            <button onClick={() => setDetalle({ id: busqueda.trim() })} className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700">
              <Hash className="size-3.5" /> Buscar ID
            </button>
          )}
        </div>
      </BarraFiltros>

      {isPending ? (
        <Cargando alto={300} error={error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Comentarios" value={total} format={(v) => num(v)} icon={MessagesSquare} hint={PERIODOS[periodo].label} />
            <Kpi label="Negativos" value={total ? (negativos / total) * 100 : NaN} format={(v) => `${v.toFixed(1)}%`} icon={MessageSquareWarning} tono="rose" hint={`${num(negativos)} comentarios`} />
            <Kpi label="Calificación promedio" value={calProm} format={(v) => `★ ${v.toFixed(2)}`} icon={Star} tono="amber" hint="escala 1–5" />
            <Kpi label="Quejas por desabasto" value={quejasDesabasto} format={(v) => num(v)} icon={Smile} tono="violet" hint="calificación 1–2" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel title="Comentarios por tema" subtitle="Número de comentarios por mes con los filtros aplicados (todo el año)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={mesCorto} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {temas.filter((t) => f.pasa('tema', t)).map((t) => (
                    <Bar key={t} dataKey={t} stackId="a" fill={COLOR_TEMA[t]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Calificación promedio por región" subtitle="Escala 1–5 · con los filtros aplicados">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={serieCal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fontSize: 11 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => Number(v).toFixed(2)} labelFormatter={mesCorto} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {regiones.filter((r) => f.pasa('region', r)).map((r) => (
                    <Line key={r} dataKey={r} stroke={COLOR_REGION[r]} strokeWidth={r === 'Bajío' ? 3 : 1.5} dot={false} type="monotone" connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <Panel title={`Lo que más se repite · ${PERIODOS[periodo].label}`} subtitle="Comentarios agrupados con los filtros aplicados · haz clic en una tarjeta para ver cada comentario con su ID" className="mt-4">
            {citas.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">Ningún comentario coincide con los filtros.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {citas.map((r) => {
                  const s = SENT[r.sentimiento] ?? SENT.neutral;
                  return (
                    <button
                      key={r.comentario}
                      onClick={() => setDetalle({ comentario: r.comentario })}
                      className="relative rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{ borderTop: `3px solid ${COLOR_TEMA[r.tema] ?? '#94a3b8'}` }}
                    >
                      <Quote className="absolute right-3 top-3 size-5 text-slate-200" />
                      <p className="pr-6 text-sm italic text-slate-700">“{r.comentario}”</p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded px-1.5 py-0.5 font-medium text-white" style={{ background: COLOR_TEMA[r.tema] ?? '#94a3b8' }}>
                          {r.tema}
                        </span>
                        <span className={cn('rounded px-1.5 py-0.5 font-medium', s.c)}>{s.t}</span>
                        <span className="ml-auto text-slate-400">
                          {num(r.veces)} veces · ★ {(r.suma / r.veces).toFixed(1)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </>
      )}

      {detalle && (
        <DetalleComentarios
          detalle={detalle}
          filtros={{ region: f.sel.region ?? [], estado, sentimiento: f.sel.sentimiento ?? [], tema: f.sel.tema ?? [], meses: detalle.id ? [] : meses, cal: f.sel.cal ?? [] }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

function DetalleComentarios({
  detalle,
  filtros,
  onClose,
}: {
  detalle: { comentario?: string; id?: string };
  filtros: { region: string[]; estado: string; sentimiento: string[]; tema: string[]; meses: string[]; cal: string[] };
  onClose: () => void;
}) {
  const { rol } = useApp();
  const qs = new URLSearchParams({ rol });
  if (detalle.id) qs.set('id', detalle.id.replace('#', ''));
  else {
    if (detalle.comentario) qs.set('comentario', detalle.comentario);
    filtros.region.forEach((r) => qs.append('region', r));
    if (filtros.estado) qs.set('estado', filtros.estado);
    filtros.meses.forEach((m) => qs.append('mes', m));
    for (const c of filtros.cal) for (const v of c === 'queja' ? [1, 2] : c === 'neutra' ? [3] : [4, 5]) qs.append('cal', String(v));
  }
  const { data, isPending, error } = useQuery<{ rows: Row[]; total: number; hayMas?: boolean }>({
    queryKey: ['voz-detalle', qs.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/voz/detalle?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      return j;
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="flex h-full w-[720px] max-w-full flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-800">{detalle.id ? `Comentario ${detalle.id.startsWith('#') ? detalle.id : '#' + detalle.id}` : 'Comentarios individuales'}</div>
            {detalle.comentario && <p className="mt-0.5 text-xs italic text-slate-500">“{detalle.comentario}”</p>}
            {data && <p className="mt-1 text-xs text-slate-500">{data.hayMas ? 'Más de 200 coincidencias · se muestran las 200 más recientes' : `${num(data.total)} coincidencias`}</p>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isPending ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">
              <Loader2 className="mr-2 size-4 animate-spin" /> Consultando Snowflake…
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-rose-600">No se pudo cargar: {String((error as Error).message)}</div>
          ) : !data?.rows.length ? (
            <div className="p-10 text-center text-sm text-slate-400">No hay comentarios con ese criterio (o tu rol no ve esa región).</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th>Fecha</th>
                  <th>Región</th>
                  <th>Estado</th>
                  <th>Canal</th>
                  <th className="text-center">★</th>
                  <th>Sentimiento</th>
                  {detalle.id && <th>Comentario</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const s = SENT[String(r.sentimiento)] ?? SENT.neutral;
                  return (
                    <tr key={String(r.feedback_id)} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-mono font-semibold text-sky-700">#{String(r.feedback_id)}</td>
                      <td className="tabular-nums">{String(r.fecha).slice(0, 10)}</td>
                      <td style={{ color: COLOR_REGION[String(r.region)] }} className="font-medium">{String(r.region)}</td>
                      <td>{String(r.estado)}</td>
                      <td className="text-slate-500">{String(r.canal)}</td>
                      <td className="text-center tabular-nums">{String(r.calificacion)}</td>
                      <td><span className={cn('rounded px-1.5 py-0.5 font-medium', s.c)}>{s.t}</span></td>
                      {detalle.id && <td className="italic text-slate-600">“{String(r.comentario)}” · {String(r.tema)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t px-5 py-2 text-[11px] text-slate-400">Solo regiones visibles para tu rol (TEC_DEMO.ANALITICA.ACCESO_REGION)</div>
      </div>
    </div>
  );
}
