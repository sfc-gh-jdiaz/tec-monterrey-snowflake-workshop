'use client';

import { Cargando, Kpi, Panel, ViewHeader } from '@/components/bi';
import { COLOR_REGION, mdp, mesCorto, n, pct, useData } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { BadgeDollarSign, LineChart as LineIcon, ShieldAlert, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, ErrorBar, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function Pronostico() {
  const diario = useData('pronostico_diario');
  const mensual = useData('pronostico_mensual');
  const regiones = [...new Set((mensual.data?.rows ?? []).map((r) => String(r.region)))];
  const [sel, setSel] = useState<string>('Bajío');
  const RANGOS: Record<string, string> = { '2026-06-01': 'Jun – nov', '2026-08-01': 'Ago – nov', '2026-09-15': 'Mediados sep – nov', '2026-10-01': 'Oct – nov' };
  const [desde, setDesde] = useState('2026-08-01');
  const region = regiones.includes(sel) ? sel : (regiones[0] ?? 'Bajío');

  const serie = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const r of diario.data?.rows ?? []) {
      if (r.region !== region || String(r.dia).slice(0, 10) < desde) continue;
      const k = String(r.dia).slice(0, 10);
      const o = m.get(k) ?? { dia: k };
      if (r.real !== null && r.real !== undefined) o.real = n(r.real) / 1e3;
      if (r.esperada !== null && r.esperada !== undefined) {
        o.esperada = n(r.esperada) / 1e3;
        o.banda = [n(r.baja) / 1e3, n(r.alta) / 1e3];
      }
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
  }, [diario.data, region, desde]);

  const mes = (mensual.data?.rows ?? []).filter((r) => r.region === region);
  const oct = mes.find((r) => String(r.mes).startsWith('2026-10')) ?? {};
  const nov = mes.find((r) => String(r.mes).startsWith('2026-11')) ?? {};
  const brecha = n(oct.venta_real) / n(oct.venta_esperada) - 1;

  return (
    <div>
      <ViewHeader
        icon={LineIcon}
        title="Pronóstico de Bebidas"
        subtitle="Modelo SNOWFLAKE.ML.FORECAST entrenado con la historia hasta septiembre. Si la venta real cae fuera de la banda de confianza, no es estacionalidad: algo se rompió."
        pregunta={`¿Cuánto debimos vender de Bebidas en ${region} en octubre y noviembre 2026 según el pronóstico, y cuánto está en riesgo si no reabastecemos?`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Periodo diario</span>
        {Object.entries(RANGOS).map(([d, l]) => (
          <button key={d} onClick={() => setDesde(d)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', desde === d ? 'border-indigo-500 bg-indigo-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
            {l}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-slate-200" />
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Región</span>
        {regiones.map((r) => (
          <button
            key={r}
            onClick={() => setSel(r)}
            className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition', region === r ? 'text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-50')}
            style={region === r ? { background: COLOR_REGION[r], borderColor: COLOR_REGION[r] } : {}}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Esperada octubre" value={n(oct.venta_esperada)} format={(v) => mdp(v)} icon={Target} hint={`banda ${mdp(oct.esperada_baja)} – ${mdp(oct.esperada_alta)}`} />
        <Kpi label="Real octubre" value={n(oct.venta_real)} format={(v) => mdp(v)} icon={LineIcon} tono={brecha < -0.1 ? 'rose' : 'emerald'} delta={{ text: pct(brecha), good: brecha >= -0.05 }} hint="vs esperada" />
        <Kpi label="Venta perdida octubre" value={Math.max(0, n(oct.venta_esperada) - n(oct.venta_real))} format={(v) => mdp(v)} icon={BadgeDollarSign} tono="rose" />
        <Kpi label="En riesgo noviembre" value={Math.max(0, n(nov.venta_esperada) - n(nov.venta_sin_accion))} format={(v) => mdp(v)} icon={ShieldAlert} tono="amber" hint="esperada − sin acción" />
      </div>

      <Panel title={`Venta diaria de Bebidas · ${region}`} subtitle="Miles de pesos · línea = real · punteada = pronóstico · sombra = banda de confianza 95%" className="mt-4">
        {diario.isPending ? (
          <Cargando alto={360} error={diario.error} />
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(0)}k`} />
              <Tooltip formatter={(v) => (Array.isArray(v) ? `$${Number(v[0]).toFixed(0)}k – $${Number(v[1]).toFixed(0)}k` : `$${Number(v).toFixed(0)}k`)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceArea x1="2026-10-01" x2="2026-10-31" fill="#fee2e2" fillOpacity={0.5} label={{ value: 'octubre', fontSize: 11, fill: '#b91c1c', position: 'insideTop' }} />
              <Area dataKey="banda" name="Banda de confianza" stroke="none" fill="#6366f1" fillOpacity={0.15} />
              <Line dataKey="esperada" name="Pronóstico" stroke="#6366f1" strokeDasharray="6 4" strokeWidth={2} dot={false} />
              <Line dataKey="real" name="Real" stroke={COLOR_REGION[region] ?? '#0ea5e9'} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Real vs esperado por mes" subtitle="Millones de pesos · noviembre muestra lo que pasaría sin reabastecer" className="mt-4">
        {mensual.isPending ? (
          <Cargando error={mensual.error} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={mes.map((r) => ({
                mes: mesCorto(r.mes),
                real: r.venta_real === null ? null : n(r.venta_real) / 1e6,
                esperada: n(r.venta_esperada) / 1e6,
                err: [n(r.venta_esperada) / 1e6 - n(r.esperada_baja) / 1e6, n(r.esperada_alta) / 1e6 - n(r.venta_esperada) / 1e6],
                sin_accion: r.venta_sin_accion === null ? null : n(r.venta_sin_accion) / 1e6,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}M`} />
              <Tooltip formatter={(v) => (v === null ? '—' : `$${Number(v).toFixed(2)} M`)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="esperada" name="Esperada" fill="#c7d2fe" radius={[4, 4, 0, 0]}>
                <ErrorBar dataKey="err" stroke="#6366f1" width={6} />
              </Bar>
              <Bar dataKey="real" name="Real" fill={COLOR_REGION[region] ?? '#0ea5e9'} radius={[4, 4, 0, 0]} />
              <Bar dataKey="sin_accion" name="Sin acción (nov)" fill="#fb923c" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}
