'use client';

/**
 * Filtros reutilizables con el estilo del Tracker semanal: chips multi-selección,
 * selector, búsqueda y deslizador. El estado vive en cada vista (useFiltros).
 */

import { cn } from '@/lib/utils';
import { Filter, Search, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';

export type Opcion = { id: string; label?: string; color?: string };

/** Estado de filtros multi-selección: un Set vacío = "todos". */
export function useFiltros<K extends string>(inicial: Partial<Record<K, string[]>> = {}) {
  const [sel, setSel] = useState<Record<string, string[]>>(inicial as Record<string, string[]>);
  const toggle = useCallback((k: K, v: string) => {
    setSel((s) => {
      const cur = new Set(s[k] ?? []);
      if (cur.has(v)) cur.delete(v);
      else cur.add(v);
      return { ...s, [k]: [...cur] };
    });
  }, []);
  const set = useCallback((k: K, vals: string[]) => setSel((s) => ({ ...s, [k]: vals })), []);
  const limpiar = useCallback(() => setSel({}), []);
  /** true si el valor pasa el filtro k (sin selección = pasa todo). */
  const pasa = useCallback((k: K, v: unknown) => {
    const vals = sel[k];
    return !vals || vals.length === 0 || vals.includes(String(v));
  }, [sel]);
  const activos = useMemo(() => Object.values(sel).reduce((n, v) => n + (v?.length ? 1 : 0), 0), [sel]);
  return { sel: sel as Partial<Record<K, string[]>>, toggle, set, limpiar, pasa, activos };
}

export function Chips({
  label,
  opciones,
  seleccion = [],
  onToggle,
  onTodos,
}: {
  label: string;
  opciones: Opcion[];
  seleccion?: string[];
  onToggle: (id: string) => void;
  onTodos?: () => void;
}) {
  const todos = seleccion.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {onTodos && (
        <button
          onClick={onTodos}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
            todos ? 'border-slate-700 bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50',
          )}
        >
          Todos
        </button>
      )}
      {opciones.map((o) => {
        const on = seleccion.includes(o.id);
        return (
          <button
            key={o.id}
            onClick={() => onToggle(o.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
              on ? 'text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
            style={on ? { background: o.color ?? '#0ea5e9', borderColor: o.color ?? '#0ea5e9' } : {}}
          >
            {!on && o.color && <span className="size-2 rounded-full" style={{ background: o.color }} />}
            {o.label ?? o.id}
          </button>
        );
      })}
    </div>
  );
}

export function Selector({
  label,
  value,
  onChange,
  opciones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: Opcion[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-sky-200"
      >
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label ?? o.id}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Busqueda({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-72 rounded-lg border bg-white py-1.5 pl-8 pr-7 text-xs outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Deslizador({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  fmt,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  fmt: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-32 accent-sky-500" />
      <span className="w-12 font-semibold tabular-nums text-slate-700">{fmt(value)}</span>
    </label>
  );
}

/** Contenedor de la barra: título, contador de resultados y "Limpiar". */
export function BarraFiltros({
  children,
  activos,
  onLimpiar,
  resumen,
}: {
  children: React.ReactNode;
  activos: number;
  onLimpiar: () => void;
  resumen?: React.ReactNode;
}) {
  return (
    <div className="mb-4 rounded-xl border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Filter className="size-3.5 text-sky-500" /> Filtros
          {activos > 0 && <span className="rounded-full bg-sky-100 px-1.5 text-[10px] font-bold text-sky-700">{activos}</span>}
        </span>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {resumen}
          {activos > 0 && (
            <button onClick={onLimpiar} className="flex items-center gap-1 font-medium text-sky-600 hover:underline">
              <X className="size-3" /> Limpiar filtros
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{children}</div>
    </div>
  );
}
