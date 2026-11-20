'use client';

import { useApp } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { Loader2, Sparkles, type LucideIcon } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

/** Encabezado de vista: ícono, título, descripción y botón "Pregúntale al agente". */
export function ViewHeader({
  icon: Icon,
  title,
  subtitle,
  pregunta,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  pregunta: string;
}) {
  const { preguntar } = useApp();
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Icon className="size-6 text-sky-500" /> {title}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>
      </div>
      <button
        onClick={() => preguntar(pregunta)}
        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:shadow-lg hover:brightness-110"
      >
        <Sparkles className="size-4" /> Pregúntale al agente sobre esta vista
      </button>
    </div>
  );
}

const TONOS = {
  sky: 'from-sky-50 border-sky-100 text-sky-500',
  emerald: 'from-emerald-50 border-emerald-100 text-emerald-500',
  amber: 'from-amber-50 border-amber-100 text-amber-500',
  rose: 'from-rose-50 border-rose-100 text-rose-500',
  violet: 'from-violet-50 border-violet-100 text-violet-500',
};

/** Tarjeta KPI con número animado (cuenta hacia arriba). */
export function Kpi({
  label,
  value,
  format,
  hint,
  icon: Icon,
  tono = 'sky',
  delta,
}: {
  label: string;
  value: number | undefined;
  format: (v: number) => string;
  hint?: string;
  icon: LucideIcon;
  tono?: keyof typeof TONOS;
  delta?: { text: string; good: boolean };
}) {
  const shown = useCountUp(value);
  return (
    <div className={cn('relative overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4 shadow-sm', TONOS[tono])}>
      <Icon className="absolute right-3 top-3 size-9 opacity-25" />
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
        {value === undefined || !Number.isFinite(value) ? <span className="text-slate-300">—</span> : format(shown)}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {delta && (
          <span className={cn('rounded px-1.5 py-0.5 font-semibold', delta.good ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
            {delta.text}
          </span>
        )}
        {hint}
      </div>
    </div>
  );
}

function useCountUp(target: number | undefined, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === undefined || !Number.isFinite(target)) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Panel blanco con título y subtítulo (estilo de las tarjetas del BI). */
export function Panel({
  title,
  subtitle,
  children,
  className,
  right,
  dark,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section className={cn('rounded-xl border p-4 shadow-sm', dark ? 'border-slate-800 bg-slate-950 text-slate-100' : 'bg-white', className)}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className={cn('text-sm font-semibold', dark ? 'text-slate-100' : 'text-slate-800')}>{title}</h2>}
            {subtitle && <p className={cn('text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Cargando({ alto = 260, error }: { alto?: number; error?: unknown }) {
  return (
    <div className="flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400" style={{ height: alto }}>
      {error ? (
        <span className="px-4 text-rose-500">No se pudo cargar: {String((error as Error)?.message ?? error)}</span>
      ) : (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" /> Consultando Snowflake…
        </>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="mb-4 flex gap-1 border-b">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          className={cn(
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
            value === i.id ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
