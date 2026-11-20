'use client';

import { Cargando, Kpi, Panel, ViewHeader } from '@/components/bi';
import { BarraFiltros, Chips, Deslizador } from '@/components/filtros';
import { COLOR_REGION, n, num, pct, useData, type Row } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { CalendarClock, Gauge, PackageMinus, Radar, TimerReset } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CATEGORIAS = ['Bebidas', 'Botanas', 'Lácteos', 'Panificados', 'Limpieza', 'Cuidado personal'];
const semanaCorta = (v: unknown) => {
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

export function Tracker() {
  const semanal = useData('semanal');
  const dist = useData('distribucion');
  const [region, setRegion] = useState<string>('Todas');
  const [cats, setCats] = useState<string[]>(['Bebidas']);
  const [META, setMeta] = useState(5);
  const [desde, setDesde] = useState(0);
  const pasaCat = (c: unknown) => cats.length === 0 || cats.includes(String(c));

  const { serie: serieTodas, regiones } = useMemo(() => {
    const rows = (semanal.data?.rows ?? []).filter((r) => pasaCat(r.categoria));
    const regiones = [...new Set((semanal.data?.rows ?? []).map((r) => String(r.region)))];
    const m = new Map<string, Row>();
    for (const r of rows) {
      const k = String(r.semana).slice(0, 10);
      const o = m.get(k) ?? { semana: k };
      const g = String(r.region);
      o[`q_${g}`] = n(o[`q_${g}`] ?? 0) + n(r.dias_quiebre);
      o[`d_${g}`] = n(o[`d_${g}`] ?? 0) + n(r.dias_sku);
      o[g] = (n(o[`q_${g}`]) / n(o[`d_${g}`])) * 100;
      o[`f_${g}`] = n(o[`f_${g}`] ?? 0) + n(r.faltante);
      m.set(k, o);
    }
    const serie = [...m.values()].sort((a, b) => String(a.semana).localeCompare(String(b.semana)));
    return { serie, regiones };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanal.data, cats]);
  const serie = serieTodas.slice(desde);
  const ultima = serie[serie.length - 1] ?? {};
  const previa = serie[serie.length - 2] ?? {};

  const visibles = region === 'Todas' ? regiones : [region];
  const enAlerta = regiones.filter((r) => n(ultima[r]) > META);
  const faltante = visibles.reduce((s, r) => s + n(ultima[`f_${r}`]), 0);

  const distSerie = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of (dist.data?.rows ?? []).filter((x) => pasaCat(x.categoria))) {
      const o = m.get(String(r.rango)) ?? { rango: r.rango, orden: n(r.orden) };
      o[String(r.region)] = n(o[String(r.region)] ?? 0) + n(r.skus);
      o.orden = Math.min(n(o.orden), n(r.orden));
      m.set(String(r.rango), o);
    }
    return [...m.values()].sort((a, b) => n(a.orden) - n(b.orden));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dist.data, cats]);
  const etiquetaCat = cats.length === 0 ? 'todas las categorías' : cats.join(', ');

  return (
    <div>
      <ViewHeader
        icon={Radar}
        title="Tracker semanal de quiebres"
        subtitle="Seguimiento semana a semana del quiebre por CEDIS y categoría (RAW.INVENTARIO_DIARIO). La alerta ALERTA_QUIEBRE se dispara cuando una región pasa la meta (5% por defecto; ajústala en los filtros)."
        pregunta="¿Cómo evolucionó semana a semana el quiebre de Bebidas en el Bajío desde septiembre y cuándo empezó el problema?"
      />
      <BarraFiltros
        activos={(cats.join() !== 'Bebidas' ? 1 : 0) + (region !== 'Todas' ? 1 : 0) + (META !== 5 ? 1 : 0) + (desde ? 1 : 0)}
        onLimpiar={() => { setCats(['Bebidas']); setRegion('Todas'); setMeta(5); setDesde(0); }}
        resumen={<span>{etiquetaCat} · {serie.length} semanas</span>}
      >
        <Chips label="Categoría" opciones={CATEGORIAS.map((c) => ({ id: c }))} seleccion={cats} onToggle={(c) => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))} onTodos={() => setCats([])} />
        <Chips label="Región" opciones={regiones.map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={region === 'Todas' ? [] : [region]} onToggle={(r) => setRegion((x) => (x === r ? 'Todas' : r))} onTodos={() => setRegion('Todas')} />
        <Deslizador label="Meta" value={META} onChange={setMeta} min={1} max={20} fmt={(v) => `${v}%`} />
        <Deslizador label="Desde semana" value={desde} onChange={setDesde} min={0} max={Math.max(0, serieTodas.length - 4)} fmt={(v) => semanaCorta(serieTodas[v]?.semana)} />
      </BarraFiltros>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Regiones en alerta" value={enAlerta.length} format={(v) => num(v)} icon={Gauge} tono={enAlerta.length ? 'rose' : 'emerald'} hint={enAlerta.join(', ') || 'todas en meta'} />
        <Kpi label="Quiebre última semana" value={Math.max(...visibles.map((r) => n(ultima[r])).filter(Number.isFinite), 0)} format={(v) => `${v.toFixed(1)}%`} icon={TimerReset} tono="amber" hint="región más alta" />
        <Kpi label="Unidades faltantes" value={faltante} format={(v) => num(v)} icon={PackageMinus} tono="violet" hint={`demanda no surtida, última semana · ${etiquetaCat}`} />
        <Kpi label="Semanas monitoreadas" value={serie.length} format={(v) => num(v)} icon={CalendarClock} hint="desde julio 2026" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {regiones.map((r) => {
          const v = n(ultima[r]);
          const d = v - n(previa[r]);
          const nivel = v > META * 2 ? 'rojo' : v > META ? 'ambar' : 'verde';
          return (
            <button
              key={r}
              onClick={() => setRegion((x) => (x === r ? 'Todas' : r))}
              className={cn(
                'rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md',
                region === r && 'ring-2 ring-sky-400',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: COLOR_REGION[r] }}>
                  {r}
                </span>
                <span className="relative flex size-3">
                  {nivel !== 'verde' && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-70', nivel === 'rojo' ? 'bg-rose-400' : 'bg-amber-400')} />}
                  <span className={cn('relative inline-flex size-3 rounded-full', nivel === 'rojo' ? 'bg-rose-500' : nivel === 'ambar' ? 'bg-amber-500' : 'bg-emerald-500')} />
                </span>
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{pct(v, 1, false)}</div>
              <div className={cn('text-[11px]', d > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} pts vs semana previa
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Tasa semanal de quiebre" subtitle={`% de días-SKU sin stock · línea roja = meta ${META}% · ${region === 'Todas' ? 'todas las regiones' : region}`}>
          {semanal.isPending ? (
            <Cargando alto={320} error={semanal.error} />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={serie}>
                <defs>
                  {visibles.map((r) => (
                    <linearGradient key={r} id={`t-${r}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR_REGION[r]} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={COLOR_REGION[r]} stopOpacity={0.03} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="semana" tickFormatter={semanaCorta} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} labelFormatter={(l) => `Semana del ${semanaCorta(l)}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={META} stroke="#ef4444" strokeDasharray="6 4" label={{ value: `meta ${META}%`, fill: '#ef4444', fontSize: 11, position: 'insideTopRight' }} />
                {visibles.map((r) => (
                  <Area key={r} type="monotone" dataKey={r} stroke={COLOR_REGION[r]} strokeWidth={r === 'Bajío' ? 3 : 1.5} fill={`url(#t-${r})`} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Distribución de días en quiebre" subtitle={`SKUs por número de días sin stock en octubre · ${etiquetaCat}`}>
          {dist.isPending ? (
            <Cargando alto={320} error={dist.error} />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={distSerie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="rango" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {visibles.map((r) => (
                  <Bar key={r} dataKey={r} stackId="a" fill={COLOR_REGION[r]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}
