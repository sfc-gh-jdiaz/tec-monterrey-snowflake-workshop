'use client';

import { Cargando, Panel, ViewHeader } from '@/components/bi';
import { BarraFiltros, Chips } from '@/components/filtros';
import { COLOR_REGION, mdp, n, useData, type Row } from '@/lib/app-state';
import { sankey, sankeyJustify, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import { Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';

type Nodo = { name: string; etapa: number };
type Enlace = { source: number; target: number; value: number };

const COLOR_ETAPA = ['#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
const ROJO = '#ef4444';

export function Flujo() {
  const { data, isPending, error } = useData('sankey');
  const [hover, setHover] = useState<string | null>(null);
  const [regSel, setRegSel] = useState<string[]>([]);
  const [catSel, setCatSel] = useState<string[]>([]);
  const pasa = (sel: string[], v: unknown) => sel.length === 0 || sel.includes(String(v));
  const tog = (set: (f: (x: string[]) => string[]) => void) => (v: string) => set((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]));
  const todasRegiones = [...new Set((data?.rows ?? []).map((r) => String(r.region)))];
  const todasCats = [...new Set((data?.rows ?? []).map((r) => String(r.categoria)))].sort();

  // Filtra por región y categoría y re-agrega cada enlace (etapa, origen, destino)
  const filas = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of (data?.rows ?? []).filter((x) => pasa(regSel, x.region) && pasa(catSel, x.categoria))) {
      const k = `${r.etapa}|${r.origen}|${r.destino}`;
      const o = m.get(k) ?? { etapa: r.etapa, origen: r.origen, destino: r.destino, valor: 0 };
      o.valor = n(o.valor) + n(r.valor);
      m.set(k, o);
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, regSel, catSel]);

  const layout = useMemo(() => {
    const rows = filas;
    if (!rows.length) return null;
    const etapaDe: Record<string, number> = { proveedor: 0, cedis: 1, venta: 2, perdida: 1 };
    const nodos: Nodo[] = [];
    const idx = new Map<string, number>();
    const nodo = (name: string, etapa: number) => {
      if (!idx.has(name)) {
        idx.set(name, nodos.length);
        nodos.push({ name, etapa });
      }
      return idx.get(name)!;
    };
    const enlaces: Enlace[] = [];
    for (const r of rows) {
      const e = String(r.etapa);
      const o = nodo(String(r.origen), etapaDe[e]);
      const finalEtapa = e === 'proveedor' ? 1 : e === 'cedis' ? 2 : 3;
      const d = nodo(String(r.destino), finalEtapa);
      if (n(r.valor) > 0) enlaces.push({ source: o, target: d, value: n(r.valor) });
    }
    const gen = sankey<Nodo, Enlace>()
      .nodeWidth(16)
      .nodePadding(10)
      .nodeAlign(sankeyJustify)
      .extent([
        [10, 10],
        [1090, 560],
      ]);
    return gen({ nodes: nodos.map((d) => ({ ...d })), links: enlaces.map((d) => ({ ...d })) });
  }, [filas]);

  const perdida = filas.filter((r) => r.etapa === 'perdida').reduce((s, r) => s + n(r.valor), 0);
  const realizada = filas.filter((r) => r.etapa === 'venta').reduce((s, r) => s + n(r.valor), 0);

  const esPerdida = (name: string) => name.startsWith('Venta perdida');
  const colorNodo = (d: SankeyNode<Nodo, Enlace>) => (esPerdida(d.name) ? ROJO : COLOR_ETAPA[d.etapa] ?? '#64748b');

  return (
    <div>
      <ViewHeader
        icon={Workflow}
        title="Flujo de valor (abasto → venta)"
        subtitle="Cómo viaja el dinero de octubre: de los proveedores a los CEDIS, de ahí a cada categoría y a la venta. La rama roja es la venta que se perdió por falta de producto."
        pregunta="¿Cuánta venta se perdió en octubre por quiebre de stock y qué proveedores y CEDIS están involucrados?"
      />
      <BarraFiltros activos={(regSel.length ? 1 : 0) + (catSel.length ? 1 : 0)} onLimpiar={() => { setRegSel([]); setCatSel([]); }}>
        <Chips label="Región / CEDIS" opciones={todasRegiones.map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={regSel} onToggle={tog(setRegSel)} onTodos={() => setRegSel([])} />
        <Chips label="Categoría" opciones={todasCats.map((c) => ({ id: c }))} seleccion={catSel} onToggle={tog(setCatSel)} onTodos={() => setCatSel([])} />
      </BarraFiltros>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {[
          { t: 'PROVEEDOR', d: 'Valor abastecido por proveedor (asignado según sus unidades recibidas)', c: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
          { t: 'CEDIS', d: 'Centro de distribución que atiende la región', c: 'border-amber-200 bg-amber-50 text-amber-700' },
          { t: 'CATEGORÍA', d: 'Venta de octubre por categoría', c: 'border-violet-200 bg-violet-50 text-violet-700' },
          { t: 'RESULTADO', d: `Realizada ${mdp(realizada)} · perdida ${mdp(perdida)}`, c: 'border-rose-200 bg-rose-50 text-rose-700' },
        ].map((b) => (
          <div key={b.t} className={`rounded-lg border p-3 text-xs ${b.c}`}>
            <div className="font-bold tracking-wider">{b.t}</div>
            <div className="mt-0.5 opacity-80">{b.d}</div>
          </div>
        ))}
      </div>
      <Panel title="Mapa de flujo de valor · octubre 2026" subtitle="Millones de pesos · pasa el cursor sobre un nodo para resaltar su flujo">
        {isPending || !layout ? (
          <Cargando alto={560} error={error} />
        ) : (
          <svg viewBox="0 0 1100 570" className="w-full">
            <defs>
              {layout.links.map((l, i) => {
                const s = l.source as SankeyNode<Nodo, Enlace>;
                const t = l.target as SankeyNode<Nodo, Enlace>;
                return (
                  <linearGradient key={i} id={`lg-${i}`} gradientUnits="userSpaceOnUse" x1={s.x1} x2={t.x0}>
                    <stop offset="0%" stopColor={colorNodo(s)} />
                    <stop offset="100%" stopColor={colorNodo(t)} />
                  </linearGradient>
                );
              })}
            </defs>
            <g fill="none">
              {layout.links.map((l: SankeyLink<Nodo, Enlace>, i) => {
                const s = l.source as SankeyNode<Nodo, Enlace>;
                const t = l.target as SankeyNode<Nodo, Enlace>;
                const activo = !hover || hover === s.name || hover === t.name;
                return (
                  <path
                    key={i}
                    d={sankeyLinkHorizontal()(l) ?? undefined}
                    stroke={`url(#lg-${i})`}
                    strokeWidth={Math.max(1, l.width ?? 1)}
                    strokeOpacity={activo ? (esPerdida(t.name) ? 0.85 : 0.42) : 0.06}
                    className="transition-[stroke-opacity] duration-200"
                  >
                    <title>{`${s.name} → ${t.name}: ${mdp(l.value)}`}</title>
                  </path>
                );
              })}
            </g>
            {layout.nodes.map((d, i) => (
              <g key={i} onMouseEnter={() => setHover(d.name)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
                <rect x={d.x0} y={d.y0} width={(d.x1 ?? 0) - (d.x0 ?? 0)} height={Math.max(2, (d.y1 ?? 0) - (d.y0 ?? 0))} rx={3} fill={colorNodo(d)} />
                <text
                  x={(d.x0 ?? 0) < 550 ? (d.x1 ?? 0) + 6 : (d.x0 ?? 0) - 6}
                  y={((d.y0 ?? 0) + (d.y1 ?? 0)) / 2}
                  dy="0.35em"
                  textAnchor={(d.x0 ?? 0) < 550 ? 'start' : 'end'}
                  className="fill-slate-700 text-[11px] font-medium"
                >
                  {d.name} <tspan className="fill-slate-400">{mdp(d.value, 1)}</tspan>
                </text>
              </g>
            ))}
          </svg>
        )}
      </Panel>
    </div>
  );
}
