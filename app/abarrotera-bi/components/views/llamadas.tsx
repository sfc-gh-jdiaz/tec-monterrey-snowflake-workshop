'use client';

import { Cargando, Kpi, Panel, ViewHeader } from '@/components/bi';
import { BarraFiltros, Busqueda, Chips, useFiltros } from '@/components/filtros';
import { COLOR_REGION, n, num, useApp, useData, type Row } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Headphones, Loader2, PhoneCall, Truck, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Motivos que asigna AI_CLASSIFY en 03c_call_center (mismos colores que los temas de Voz del cliente cuando coinciden). */
export const COLOR_MOTIVO: Record<string, string> = {
  'Desabasto de producto': '#ef4444',
  'Entrega y logística': '#f59e0b',
  'Sistemas y pagos': '#3b82f6',
  'Cadena de frío': '#06b6d4',
  'Calidad y caducidad': '#8b5cf6',
  'Precios y facturación': '#ec4899',
  'Insumos de operación': '#10b981',
};
const SENT: Record<string, { t: string; c: string; color: string }> = {
  negative: { t: 'Negativo', c: 'bg-rose-100 text-rose-700', color: '#e11d48' },
  mixed: { t: 'Mixto', c: 'bg-amber-100 text-amber-700', color: '#d97706' },
  neutral: { t: 'Neutral', c: 'bg-slate-100 text-slate-600', color: '#64748b' },
  positive: { t: 'Positivo', c: 'bg-emerald-100 text-emerald-700', color: '#059669' },
  unknown: { t: 'Sin dato', c: 'bg-slate-50 text-slate-400', color: '#94a3b8' },
};
const URG: Record<string, { c: string; color: string }> = {
  Alta: { c: 'bg-rose-600 text-white', color: '#e11d48' },
  Media: { c: 'bg-amber-500 text-white', color: '#f59e0b' },
  Baja: { c: 'bg-slate-400 text-white', color: '#94a3b8' },
};

type F = 'region' | 'categoria' | 'urgencia' | 'logistica';
type Turno = { inicio: number; fin: number; hablante: string; texto: string };

const fecha = (v: unknown) =>
  new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Sent({ v, label }: { v: unknown; label?: string }) {
  const s = SENT[String(v)] ?? SENT.unknown;
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', s.c)}>
      {label ? `${label}: ` : ''}
      {s.t}
    </span>
  );
}

export function Llamadas() {
  const { data, isPending, error } = useData('llamadas');
  const f = useFiltros<F>();
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);

  const rows = useMemo<Row[]>(() => (data?.rows ?? []).map((r) => ({ ...r, duracion_seg: n(r.duracion_seg) })), [data]);
  const regiones = useMemo(() => [...new Set(rows.map((r) => String(r.region)))], [rows]);
  const texto = busqueda.trim().toLowerCase();

  const filtradas = rows.filter(
    (r) =>
      f.pasa('region', r.region) &&
      f.pasa('categoria', r.categoria) &&
      f.pasa('urgencia', r.urgencia) &&
      f.pasa('logistica', r.sentimiento_logistica) &&
      (!texto || [r.tienda, r.ciudad, r.resumen, r.causa, r.folio].some((x) => String(x ?? '').toLowerCase().includes(texto))),
  );
  const urgentes = filtradas.filter((r) => r.urgencia === 'Alta').length;
  const logNeg = filtradas.filter((r) => r.sentimiento_logistica === 'negative').length;
  const minutos = filtradas.reduce((s, r) => s + n(r.duracion_seg), 0) / 60;

  const porMotivo = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of filtradas) {
      const k = String(r.categoria);
      const o = m.get(k) ?? { categoria: k };
      o[String(r.region)] = n(o[String(r.region)] ?? 0) + 1;
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => String(a.categoria).localeCompare(String(b.categoria)));
  }, [filtradas]);

  return (
    <div>
      <ViewHeader
        icon={PhoneCall}
        title="Llamadas del call center"
        subtitle="13 llamadas grabadas de tiendas al call center (ago–oct 2026). Snowflake las transcribe por hablante (AI_TRANSCRIBE), las clasifica (AI_CLASSIFY), mide el sentimiento por aspecto (AI_SENTIMENT), extrae causa y compromiso (AI_EXTRACT) y las resume (AI_COMPLETE). Abre una llamada para escucharla y seguir la transcripción."
        pregunta="¿Qué reportaron por teléfono las tiendas del Bajío en octubre 2026 y coincide con los datos de proveedores?"
      />

      <BarraFiltros
        activos={f.activos + (busqueda ? 1 : 0)}
        onLimpiar={() => {
          f.limpiar();
          setBusqueda('');
        }}
        resumen={!isPending && <span>Mostrando <b className="text-slate-800">{filtradas.length}</b> de {rows.length} llamadas</span>}
      >
        <Chips label="Región" opciones={regiones.map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={f.sel.region} onToggle={(v) => f.toggle('region', v)} />
        <Chips label="Urgencia" opciones={Object.entries(URG).map(([id, u]) => ({ id, color: u.color }))} seleccion={f.sel.urgencia} onToggle={(v) => f.toggle('urgencia', v)} />
        <Chips
          label="Logística"
          opciones={['negative', 'mixed', 'neutral', 'positive'].map((id) => ({ id, label: SENT[id].t, color: SENT[id].color }))}
          seleccion={f.sel.logistica}
          onToggle={(v) => f.toggle('logistica', v)}
        />
        <Chips label="Motivo" opciones={Object.entries(COLOR_MOTIVO).map(([id, color]) => ({ id, color }))} seleccion={f.sel.categoria} onToggle={(v) => f.toggle('categoria', v)} />
        <Busqueda value={busqueda} onChange={setBusqueda} placeholder="Buscar tienda, ciudad, folio o causa" />
      </BarraFiltros>

      {isPending ? (
        <Cargando alto={300} error={error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Llamadas" value={filtradas.length} format={(v) => num(v)} icon={PhoneCall} hint="con los filtros aplicados" />
            <Kpi label="Urgencia alta" value={urgentes} format={(v) => num(v)} icon={AlertTriangle} tono="rose" hint="la tienda pierde ventas hoy" />
            <Kpi label="Logística negativa" value={logNeg} format={(v) => num(v)} icon={Truck} tono="amber" hint="AI_SENTIMENT por aspecto" />
            <Kpi label="Minutos de audio" value={minutos} format={(v) => num(v, 0)} icon={Headphones} tono="violet" hint="que nadie tuvo que escuchar" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Panel title="¿Por qué llaman?" subtitle="Motivo clasificado con IA, por región">
              <ResponsiveContainer width="100%" height={Math.max(220, porMotivo.length * 44)}>
                <BarChart data={porMotivo} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="categoria" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {regiones.filter((r) => f.pasa('region', r)).map((r) => (
                    <Bar key={r} dataKey={r} stackId="a" fill={COLOR_REGION[r]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Llamadas" subtitle="Haz clic en una llamada para escucharla con su transcripción">
              {filtradas.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">Ninguna llamada coincide con los filtros (o tu rol no ve esa región).</div>
              ) : (
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {filtradas.map((r) => (
                    <button
                      key={String(r.llamada_id)}
                      onClick={() => setAbierta(n(r.llamada_id))}
                      className="w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{ borderLeft: `4px solid ${COLOR_MOTIVO[String(r.categoria)] ?? '#94a3b8'}` }}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-sky-700">#{String(r.llamada_id).padStart(2, '0')}</span>
                        <span className="font-semibold text-slate-800">{String(r.tienda)}</span>
                        <span className="text-slate-400">·</span>
                        <span style={{ color: COLOR_REGION[String(r.region)] }} className="font-medium">
                          {String(r.ciudad)}, {String(r.region)}
                        </span>
                        <span className="ml-auto flex items-center gap-1 text-slate-400">
                          <Clock className="size-3" /> {fecha(r.fecha)} · {mmss(n(r.duracion_seg))}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{String(r.resumen)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: COLOR_MOTIVO[String(r.categoria)] ?? '#94a3b8' }}>
                          {String(r.categoria)}
                        </span>
                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', URG[String(r.urgencia)]?.c)}>Urgencia {String(r.urgencia)}</span>
                        <Sent v={r.sentimiento_logistica} label="Logística" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      {abierta !== null && <DetalleLlamada id={abierta} onClose={() => setAbierta(null)} />}
    </div>
  );
}

function DetalleLlamada({ id, onClose }: { id: number; onClose: () => void }) {
  const { rol } = useApp();
  const audio = useRef<HTMLAudioElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(-1);

  const { data, isPending, error } = useQuery<Row & { segmentos?: Turno[] }>({
    queryKey: ['llamada', id, rol],
    queryFn: async () => {
      const r = await fetch(`/api/llamadas/${id}?rol=${encodeURIComponent(rol)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      return j;
    },
    // El enlace al audio caduca en 10 min: no se reutiliza de caché
    staleTime: 0,
    gcTime: 0,
  });
  const turnos = useMemo(() => data?.segmentos ?? [], [data]);

  // Turno activo con el evento nativo timeupdate del <audio> (sin intervalos que muestreen currentTime)
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const alAvanzar = () => {
      const t = el.currentTime;
      let i = -1;
      for (let k = 0; k < turnos.length; k++) if (turnos[k].inicio <= t) i = k;
      setActual(i);
    };
    el.addEventListener('timeupdate', alAvanzar);
    el.addEventListener('seeked', alAvanzar);
    return () => {
      el.removeEventListener('timeupdate', alAvanzar);
      el.removeEventListener('seeked', alAvanzar);
    };
  }, [turnos, data?.audio_url]);

  useEffect(() => {
    if (actual < 0) return;
    lista.current?.querySelector<HTMLElement>(`[data-turno="${actual}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [actual]);

  const saltar = (t: Turno) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = t.inicio;
    void el.play();
  };

  const campos: [string, unknown][] = data
    ? [
        ['Producto afectado', data.producto_afectado],
        ['Causa mencionada', data.causa],
        ['Compromiso del agente', data.compromiso],
        ['Plazo', data.plazo],
        ['Folio', data.folio],
        ['Agente', data.agente],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="flex h-full w-[760px] max-w-full flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              Llamada #{String(id).padStart(2, '0')} {data ? `· ${String(data.tienda)}` : ''}
            </div>
            {data && (
              <p className="mt-0.5 text-xs text-slate-500">
                {String(data.ciudad)}, {String(data.estado)} · <span style={{ color: COLOR_REGION[String(data.region)] }}>{String(data.region)}</span> · {fecha(data.fecha)} ·{' '}
                {mmss(n(data.duracion_seg))}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>

        {isPending ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 size-4 animate-spin" /> Consultando Snowflake…
          </div>
        ) : error || !data ? (
          <div className="p-6 text-sm text-rose-600">No se pudo cargar la llamada: {String((error as Error | null)?.message ?? '')}</div>
        ) : (
          <>
            <div className="space-y-3 border-b px-5 py-4">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio ref={audio} src={String(data.audio_url)} controls preload="metadata" className="w-full" />
              <p className="text-sm text-slate-700">{String(data.resumen)}</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: COLOR_MOTIVO[String(data.categoria)] ?? '#94a3b8' }}>
                  {String(data.categoria)}
                </span>
                <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', URG[String(data.urgencia)]?.c)}>Urgencia {String(data.urgencia)}</span>
                <Sent v={data.sentimiento} label="General" />
                <Sent v={data.sentimiento_logistica} label="Logística" />
                <Sent v={data.sentimiento_servicio} label="Servicio" />
                <Sent v={data.sentimiento_producto} label="Producto" />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {campos.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
                    <dd className="text-slate-700">{v === null || v === undefined || v === '' ? '—' : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div ref={lista} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-3">
              {turnos.map((t, i) => (
                <button
                  key={i}
                  data-turno={i}
                  onClick={() => saltar(t)}
                  className={cn(
                    'flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-50',
                    i === actual && 'bg-sky-50 ring-1 ring-sky-200',
                  )}
                >
                  <span className="w-10 shrink-0 pt-0.5 font-mono text-[11px] text-slate-400">{mmss(t.inicio)}</span>
                  <span
                    className={cn(
                      'w-16 shrink-0 pt-0.5 text-[11px] font-semibold',
                      t.hablante === 'Agente' ? 'text-indigo-600' : t.hablante === 'Tienda' ? 'text-emerald-600' : 'text-slate-500',
                    )}
                  >
                    {t.hablante}
                  </span>
                  <span className="text-slate-700">{t.texto}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="border-t px-5 py-2 text-[11px] text-slate-400">
          Audio desde @TEC_DEMO.RAW.AUDIOS con enlace temporal de 10 min · solo regiones visibles para tu rol (RAP_REGION)
        </div>
      </div>
    </div>
  );
}
