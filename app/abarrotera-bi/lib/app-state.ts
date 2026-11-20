'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

export type Vista =
  | 'resumen'
  | 'mapa'
  | 'flujo'
  | 'salud'
  | 'quiebres'
  | 'tracker'
  | 'pronostico'
  | 'voz'
  | 'llamadas'
  | 'grafo'
  | 'agente';

export type AppState = {
  rol: string;
  setRol: (r: string) => void;
  vista: Vista;
  setVista: (v: Vista) => void;
  /** Abre el panel del agente con una pregunta (se envía al instante). */
  preguntar: (q: string) => void;
};

export const AppCtx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp fuera de AppCtx');
  return ctx;
}

export type Row = Record<string, unknown>;

/** Lee /api/data/<name> para el rol activo. */
export function useData<T extends Row = Row>(name: string) {
  const { rol } = useApp();
  return useQuery<{ rows: T[]; regiones: string[] }>({
    queryKey: ['data', name, rol],
    queryFn: async () => {
      const r = await fetch(`/api/data/${name}?rol=${encodeURIComponent(rol)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      return j;
    },
    staleTime: 5 * 60_000,
  });
}

export const n = (v: unknown): number => (v === null || v === undefined || v === '' ? NaN : Number(v));

export const mdp = (v: unknown, d = 1) => {
  const x = n(v);
  return Number.isFinite(x) ? `$${(x / 1e6).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d })} M` : '—';
};

export const pct = (v: unknown, d = 1, ratio = true) => {
  const x = n(v);
  return Number.isFinite(x) ? `${(ratio ? x * 100 : x).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d })}%` : '—';
};

export const num = (v: unknown, d = 0) => {
  const x = n(v);
  return Number.isFinite(x) ? x.toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—';
};

export const mesCorto = (v: unknown) => {
  const s = String(v ?? '').slice(0, 10);
  const [y, m] = s.split('-');
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return m ? `${nombres[Number(m) - 1]} ${y.slice(2)}` : s;
};

export const COLOR_REGION: Record<string, string> = {
  Norte: '#3b82f6',
  Bajío: '#ef4444',
  Centro: '#10b981',
  Sur: '#f59e0b',
  Sureste: '#8b5cf6',
};

export const COLOR_TEMA: Record<string, string> = {
  'Desabasto de producto': '#ef4444',
  'Entrega y logística': '#f59e0b',
  'Atención y servicio': '#10b981',
  'Precio y competencia': '#8b5cf6',
  'Surtido y variedad': '#3b82f6',
  'Producto y promoción': '#06b6d4',
  'Crédito y pagos': '#ec4899',
};
