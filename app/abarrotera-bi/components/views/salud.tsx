'use client';

import { Cargando, Panel, Tabs, ViewHeader } from '@/components/bi';
import { BarraFiltros, Chips, Selector } from '@/components/filtros';
import { COLOR_REGION, mesCorto, n, num, pct, useData, type Row } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Velocímetro semicircular: verde/amarillo/rojo según la meta. */
function Gauge({
  label,
  value,
  min,
  max,
  fmt,
  meta,
  mejorAlto = true,
  sub,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  fmt: (v: number) => string;
  meta: number;
  mejorAlto?: boolean;
  sub: string;
}) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const ang = Math.PI * (1 - t);
  const bueno = mejorAlto ? value >= meta : value <= meta;
  const zonas = mejorAlto ? ['#ef4444', '#f59e0b', '#10b981'] : ['#10b981', '#f59e0b', '#ef4444'];
  const arc = (a0: number, a1: number) => {
    const p = (a: number, r: number) => [100 + r * Math.cos(Math.PI * (1 - a)), 100 - r * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0, 80);
    const [x1, y1] = p(a1, 80);
    return `M ${x0} ${y0} A 80 80 0 0 1 ${x1} ${y1}`;
  };
  return (
    <div className="flex flex-col items-center rounded-xl border bg-white p-4 shadow-sm">
      <svg viewBox="0 0 200 120" className="w-full max-w-[220px]">
        {zonas.map((c, i) => (
          <path key={i} d={arc(i / 3, (i + 1) / 3)} stroke={c} strokeWidth={16} fill="none" opacity={0.9} />
        ))}
        <line
          x1={100}
          y1={100}
          x2={100 + 66 * Math.cos(ang)}
          y2={100 - 66 * Math.sin(ang)}
          stroke="#0f172a"
          strokeWidth={4}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
        <circle cx={100} cy={100} r={7} fill="#0f172a" />
      </svg>
      <div className={cn('-mt-1 text-2xl font-bold tabular-nums', bueno ? 'text-emerald-600' : 'text-rose-600')}>{fmt(value)}</div>
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </div>
  );
}

function Atributo({ label, value, meta, fmt, mejorAlto = true, prev }: { label: string; value: number; meta: number; fmt: (v: number) => string; mejorAlto?: boolean; prev: number }) {
  const ok = mejorAlto ? value >= meta : value <= meta;
  const ratio = mejorAlto ? value / meta : meta / Math.max(value, 1e-9);
  const delta = value - prev;
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className={cn('rounded px-1.5 py-0.5 font-semibold', ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>{ok ? 'En meta' : 'Fuera de meta'}</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmt(value)}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all duration-700', ok ? 'bg-emerald-500' : 'bg-rose-500')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>Meta {fmt(meta)}</span>
        <span className={cn((mejorAlto ? delta >= 0 : delta <= 0) ? 'text-emerald-600' : 'text-rose-600')}>
          {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta))} vs sep
        </span>
      </div>
    </div>
  );
}

export function Salud() {
  const salud = useData('salud');
  const cap = useData('capacidad');
  const prov = useData('proveedores');
  const [tab, setTab] = useState<'kpis' | 'capacidad'>('kpis');

  const [regionesSel, setRegionesSel] = useState<string[]>([]);
  const [categoria, setCategoria] = useState('Bebidas');
  const pasaReg = (r: unknown) => regionesSel.length === 0 || regionesSel.includes(String(r));
  const regiones = [...new Set((salud.data?.rows ?? []).map((r) => String(r.region)))];

  // Re-agrega por mes con las regiones elegidas: SUM(numerador) / SUM(denominador)
  const rows = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of (salud.data?.rows ?? []).filter((x) => pasaReg(x.region))) {
      const k = String(r.mes).slice(0, 10);
      const o = m.get(k) ?? {};
      for (const c of ['recibidas', 'pedidas', 'perfectas', 'ordenes', 'ordenes_recibidas', 'retraso_total', 'dias_quiebre', 'dias_sku', 'disponibles', 'demanda', 'error_abs', 'esperada'])
        o[c] = (o[c] ?? 0) + (Number.isFinite(n(r[c])) ? n(r[c]) : 0);
      m.set(k, o);
    }
    return [...m.entries()].sort().map(([mes, o]) => ({
      mes,
      fill_rate: o.recibidas / o.pedidas,
      orden_perfecta: o.perfectas / o.ordenes,
      retraso: o.retraso_total / o.ordenes_recibidas,
      quiebre: o.dias_quiebre / o.dias_sku,
      dias_inventario: o.disponibles / o.demanda,
      precision_pron: o.esperada ? 1 - o.error_abs / o.esperada : NaN,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salud.data, regionesSel]);
  const oct: Row = rows.find((r) => r.mes.startsWith('2026-10')) ?? {};
  const sep: Row = rows.find((r) => r.mes.startsWith('2026-09')) ?? {};
  const capRows = (cap.data?.rows ?? []).filter((r) => pasaReg(r.region) && (categoria === '' || r.categoria === categoria));
  const capAgg = useMemo(() => {
    // Suma numeradores y denominadores por CEDIS (promediar las tasas de cada categoría daría una cifra incorrecta)
    const m = new Map<string, { cedis: string; region: string; disp: number; dem: number; dq: number; ds: number }>();
    for (const r of capRows) {
      const o = m.get(String(r.cedis)) ?? { cedis: String(r.cedis), region: String(r.region), disp: 0, dem: 0, dq: 0, ds: 0 };
      o.disp += n(r.disponibles); o.dem += n(r.demanda); o.dq += n(r.dias_quiebre); o.ds += n(r.dias_sku);
      m.set(String(r.cedis), o);
    }
    return [...m.values()].map((o) => ({ cedis: o.cedis, region: o.region, cobertura_dias: o.disp / o.dem, quiebre: o.dq / o.ds })).sort((a, b) => a.cobertura_dias - b.cobertura_dias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap.data, regionesSel, categoria]);
  const provAgg = useMemo(() => {
    const m = new Map<string, { proveedor: string; categoria: string; ordenes: number; recibidas_ord: number; rec: number; ped: number; ret: number }>();
    for (const r of (prov.data?.rows ?? []).filter((x) => pasaReg(x.region) && (categoria === '' || x.categoria === categoria))) {
      const k = `${r.proveedor}|${r.categoria}`;
      const o = m.get(k) ?? { proveedor: String(r.proveedor), categoria: String(r.categoria), ordenes: 0, recibidas_ord: 0, rec: 0, ped: 0, ret: 0 };
      o.ordenes += n(r.ordenes); o.recibidas_ord += n(r.ordenes_recibidas); o.rec += n(r.recibidas); o.ped += n(r.pedidas); o.ret += n(r.retraso_total);
      m.set(k, o);
    }
    return [...m.values()].map((o) => ({ ...o, fill_rate: o.rec / o.ped, retraso: o.ret / o.recibidas_ord })).sort((a, b) => a.fill_rate - b.fill_rate).slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prov.data, regionesSel, categoria]);
  const p = (v: number) => pct(v);

  return (
    <div>
      <ViewHeader
        icon={Activity}
        title="Salud operativa"
        subtitle="Atributos de desempeño de la cadena de suministro (estilo SCOR): confiabilidad, disponibilidad, agilidad y precisión del pronóstico. Octubre 2026 contra metas."
        pregunta="¿Cómo están el fill rate, el perfect order rate y el quiebre de stock por región en octubre 2026, y cuáles proveedores fallaron más?"
      />
      <BarraFiltros
        activos={(regionesSel.length ? 1 : 0) + (categoria !== 'Bebidas' ? 1 : 0)}
        onLimpiar={() => { setRegionesSel([]); setCategoria('Bebidas'); }}
        resumen={<span>{regionesSel.length ? regionesSel.join(', ') : 'Todas las regiones'}</span>}
      >
        <Chips label="Región" opciones={regiones.map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={regionesSel}
          onToggle={(r) => setRegionesSel((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))} onTodos={() => setRegionesSel([])} />
        <Selector label="Categoría (cobertura y proveedores)" value={categoria} onChange={setCategoria}
          opciones={[{ id: '', label: 'Todas' }, ...['Bebidas', 'Botanas', 'Lácteos', 'Panificados', 'Limpieza', 'Cuidado personal'].map((c) => ({ id: c }))]} />
      </BarraFiltros>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'kpis', label: 'Indicadores' },
          { id: 'capacidad', label: 'Cobertura de CEDIS y proveedores' },
        ]}
      />
      {salud.isPending ? (
        <Cargando alto={300} error={salud.error} />
      ) : tab === 'kpis' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Gauge label="Fill rate" value={n(oct.fill_rate)} min={0.8} max={1} meta={0.97} fmt={p} sub="Confiabilidad · recibido / pedido" />
            <Gauge label="Quiebre de stock" value={n(oct.quiebre)} min={0} max={0.1} meta={0.03} mejorAlto={false} fmt={p} sub="Disponibilidad · días-SKU sin stock" />
            <Gauge label="Días de inventario" value={n(oct.dias_inventario)} min={0} max={20} meta={10} fmt={(v) => `${v.toFixed(1)} d`} sub="Cobertura promedio" />
            <Gauge label="Precisión del pronóstico" value={n(oct.precision_pron)} min={0.6} max={1} meta={0.9} fmt={p} sub="1 − error absoluto %" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Atributo label="Perfect order rate" value={n(oct.orden_perfecta)} prev={n(sep.orden_perfecta)} meta={0.8} fmt={p} />
            <Atributo label="Fill rate" value={n(oct.fill_rate)} prev={n(sep.fill_rate)} meta={0.97} fmt={p} />
            <Atributo label="Retraso promedio" value={n(oct.retraso)} prev={n(sep.retraso)} meta={0.5} mejorAlto={false} fmt={(v) => `${v.toFixed(2)} d`} />
            <Atributo label="Quiebre de stock" value={n(oct.quiebre)} prev={n(sep.quiebre)} meta={0.03} mejorAlto={false} fmt={p} />
          </div>
          <Panel title="Evolución mensual" subtitle="Quiebre de stock (%) y fill rate (%)" className="mt-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows.map((r) => ({ mes: mesCorto(r.mes), quiebre_pct: n(r.quiebre) * 100, fill_pct: n(r.fill_rate) * 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="q" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <YAxis yAxisId="f" orientation="right" domain={[85, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Bar yAxisId="q" dataKey="quiebre_pct" name="Quiebre" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="f" dataKey="fill_pct" name="Fill rate" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Cobertura de inventario por CEDIS" subtitle="Días de inventario en octubre · línea roja = mínimo de 7 días">
            {cap.isPending ? (
              <Cargando error={cap.error} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={capAgg.map((r) => ({ cedis: String(r.cedis).replace('CEDIS ', ''), dias: n(r.cobertura_dias), quiebre: n(r.quiebre) }))} layout="vertical" margin={{ left: 20, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="cedis" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)} días`} />
                  <ReferenceLine x={7} stroke="#ef4444" strokeDasharray="5 4" label={{ value: 'mínimo 7 d', fontSize: 11, fill: '#ef4444', position: 'top' }} />
                  <Bar dataKey="dias" radius={[0, 6, 6, 0]}>
                    {capAgg.map((r, i) => (
                      <Cell key={i} fill={n(r.cobertura_dias) < 7 ? '#f97316' : '#38bdf8'} />
                    ))}
                    <LabelList dataKey="dias" position="right" formatter={(v: unknown) => `${Number(v).toFixed(1)} d`} style={{ fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {capAgg
              .filter((r) => n(r.cobertura_dias) < 7)
              .map((r) => (
                <div key={String(r.cedis)} className="mt-2 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  <span>
                    <b>Cuello de botella:</b> {String(r.cedis)} con {num(r.cobertura_dias, 1)} días de cobertura
                  </span>
                  <span className="font-bold">{pct(r.quiebre)} quiebre</span>
                </div>
              ))}
          </Panel>
          <Panel title="Proveedores con peor desempeño" subtitle="Octubre 2026 · fill rate más bajo">
            {prov.isPending ? (
              <Cargando error={prov.error} />
            ) : (
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1">Proveedor</th>
                    <th>Categoría</th>
                    <th className="text-right">Órdenes</th>
                    <th className="w-40">Fill rate</th>
                    <th className="text-right">Retraso</th>
                  </tr>
                </thead>
                <tbody>
                  {provAgg.map((r) => (
                    <tr key={`${r.proveedor}-${r.categoria}`} className="border-t">
                      <td className="py-1.5 font-medium text-slate-700">{String(r.proveedor)}</td>
                      <td className="text-slate-500">{String(r.categoria)}</td>
                      <td className="text-right tabular-nums">{num(r.ordenes)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                            <div className={cn('h-full rounded-full', n(r.fill_rate) < 0.95 ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${n(r.fill_rate) * 100}%` }} />
                          </div>
                          <span className="w-12 text-right tabular-nums">{pct(r.fill_rate)}</span>
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{num(r.retraso, 1)} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
