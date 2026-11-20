'use client';

import { Cargando, Kpi, Panel, Tabs, ViewHeader } from '@/components/bi';
import { BarraFiltros, Chips } from '@/components/filtros';
import { COLOR_REGION, n, num, pct, useData } from '@/lib/app-state';
import { Boxes, Building2, Factory, MessageCircle, Network } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
// La app se carga solo en el navegador (app/page.tsx usa ssr: false), así que el import directo es seguro.
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

type Nodo = { id: string; tipo: 'cedis' | 'ciudad' | 'proveedor' | 'tema'; val: number; color: string; detalle: string };
type Enlace = { source: string; target: string; color: string; width: number };

const COLOR = { cedis: '#3b82f6', ciudad: '#f59e0b', ciudadMal: '#ef4444', proveedor: '#10b981', tema: '#8b5cf6' };

export function Grafo() {
  const { data, isPending, error } = useData('grafo');
  const [filtro, setFiltro] = useState<'todo' | 'ciudades' | 'proveedores' | 'temas'>('todo');
  const [regSel, setRegSel] = useState<string[]>([]);
  const [soloRojo, setSoloRojo] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const fg = useRef<ForceGraphMethods | undefined>(undefined);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    const nodes = new Map<string, Nodo>();
    const links: Enlace[] = [];
    const rows = (data?.rows ?? []).filter((r) => regSel.length === 0 || regSel.includes(String(r.region)));
    const add = (id: string, tipo: Nodo['tipo'], val: number, color: string, detalle: string) => {
      const prev = nodes.get(id);
      if (prev) prev.val += val;
      else nodes.set(id, { id, tipo, val, color, detalle });
    };
    // Proveedores: solo los 15 de mayor volumen para que el grafo se lea.
    const provTotal = new Map<string, number>();
    for (const r of rows) if (r.tipo === 'proveedor_cedis') provTotal.set(String(r.origen), (provTotal.get(String(r.origen)) ?? 0) + n(r.peso));
    const topProv = new Set([...provTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k]) => k));

    for (const r of rows) {
      const tipo = String(r.tipo);
      if (tipo === 'cedis_ciudad' && (filtro === 'todo' || filtro === 'ciudades')) {
        const mal = n(r.cambio) < -20;
        add(String(r.origen), 'cedis', 0, COLOR.cedis, `CEDIS · ${r.region}`);
        add(String(r.destino), 'ciudad', Math.sqrt(n(r.peso)) / 3, mal ? COLOR.ciudadMal : COLOR.ciudad, `${num(r.peso)} tiendas · Bebidas ${pct(r.cambio, 1, false)}`);
        links.push({ source: String(r.origen), target: String(r.destino), color: mal ? 'rgba(239,68,68,0.55)' : 'rgba(148,163,184,0.35)', width: mal ? 1.6 : 0.6 });
      }
      if (tipo === 'proveedor_cedis' && topProv.has(String(r.origen)) && (filtro === 'todo' || filtro === 'proveedores')) {
        const malo = n(r.cambio) < -5;
        add(String(r.origen), 'proveedor', 2, COLOR.proveedor, `Proveedor · fill ${pct(100 + n(r.cambio), 1, false)} hacia ${r.destino}`);
        add(String(r.destino), 'cedis', 0, COLOR.cedis, `CEDIS · ${r.region}`);
        links.push({ source: String(r.origen), target: String(r.destino), color: malo ? 'rgba(239,68,68,0.6)' : 'rgba(16,185,129,0.35)', width: malo ? 2 : 0.8 });
      }
      if (tipo === 'tema_cedis' && (filtro === 'todo' || filtro === 'temas')) {
        add(String(r.origen), 'tema', Math.sqrt(n(r.peso)) / 4, COLOR.tema, `Tema de comentario`);
        add(String(r.destino), 'cedis', 0, COLOR.cedis, `CEDIS · ${r.region}`);
        const neg = n(r.cambio);
        links.push({ source: String(r.origen), target: String(r.destino), color: neg > 40 ? 'rgba(239,68,68,0.7)' : 'rgba(139,92,246,0.3)', width: Math.max(0.5, n(r.peso) / 120) });
      }
    }
    for (const nd of nodes.values()) if (nd.tipo === 'cedis') nd.val = 14;
    if (soloRojo) {
      const rojos = links.filter((l) => l.color.startsWith('rgba(239'));
      const usados = new Set(rojos.flatMap((l) => [l.source, l.target]));
      return { nodes: [...nodes.values()].filter((x) => usados.has(x.id)), links: rojos };
    }
    return { nodes: [...nodes.values()], links };
  }, [data, filtro, regSel, soloRojo]);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force('charge')?.strength(-160);
    g.d3Force('link')?.distance((l: { source: { tipo?: string } }) => (l.source?.tipo === 'cedis' ? 55 : 80));
    g.d3ReheatSimulation();
  }, [graph]);

  const cuenta = (t: Nodo['tipo']) => graph.nodes.filter((x) => x.tipo === t).length;

  return (
    <div>
      <ViewHeader
        icon={Network}
        title="Grafo de la red"
        subtitle="Proveedores, CEDIS, ciudades y temas de queja como una sola red. Los enlaces rojos muestran dónde se rompe: ciudades con caída > 20%, proveedores con bajo fill rate y temas con sentimiento negativo."
        pregunta="¿Qué proveedores abastecen al CEDIS León y cuáles tuvieron peor fill rate en octubre 2026?"
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Nodos" value={graph.nodes.length} format={(v) => num(v)} icon={Boxes} />
        <Kpi label="Ciudades" value={cuenta('ciudad')} format={(v) => num(v)} icon={Building2} tono="amber" />
        <Kpi label="Proveedores" value={cuenta('proveedor')} format={(v) => num(v)} icon={Factory} tono="emerald" hint="top 15 por volumen" />
        <Kpi label="Temas" value={cuenta('tema')} format={(v) => num(v)} icon={MessageCircle} tono="violet" />
      </div>
      <BarraFiltros activos={(regSel.length ? 1 : 0) + (soloRojo ? 1 : 0)} onLimpiar={() => { setRegSel([]); setSoloRojo(false); }}>
        <Chips label="Región" opciones={Object.keys(COLOR_REGION).map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={regSel}
          onToggle={(r) => setRegSel((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))} onTodos={() => setRegSel([])} />
        <Chips label="Enlaces" opciones={[{ id: 'rojo', label: 'Solo donde se rompe la red', color: '#ef4444' }]} seleccion={soloRojo ? ['rojo'] : []} onToggle={() => setSoloRojo((x) => !x)} />
      </BarraFiltros>
      <Tabs
        value={filtro}
        onChange={setFiltro}
        items={[
          { id: 'todo', label: 'Red completa' },
          { id: 'ciudades', label: 'CEDIS → ciudades' },
          { id: 'proveedores', label: 'Proveedores → CEDIS' },
          { id: 'temas', label: 'Quejas → CEDIS' },
        ]}
      />
      <Panel title="Relaciones de la cadena de suministro" subtitle="Arrastra los nodos, haz zoom con la rueda · el tamaño refleja volumen">
        <div ref={box} className="overflow-hidden rounded-lg bg-slate-50">
          {isPending ? (
            <Cargando alto={620} error={error} />
          ) : (
            <ForceGraph2D
              ref={fg}
              onEngineStop={() => fg.current?.zoomToFit(500, 40)}
              graphData={graph}
              width={w}
              height={620}
              backgroundColor="#f8fafc"
              nodeRelSize={4}
              nodeVal={(d: object) => (d as Nodo).val}
              nodeColor={(d: object) => (d as Nodo).color}
              nodeLabel={(d: object) => `<b>${(d as Nodo).id}</b><br/>${(d as Nodo).detalle}`}
              linkColor={(l: object) => (l as Enlace).color}
              linkWidth={(l: object) => (l as Enlace).width}
              linkDirectionalParticles={(l: object) => ((l as Enlace).color.startsWith('rgba(239') ? 2 : 0)}
              linkDirectionalParticleWidth={2.5}
              linkDirectionalParticleColor={() => '#ef4444'}
              cooldownTicks={140}
              nodeCanvasObjectMode={() => 'after'}
              nodeCanvasObject={(node: object, ctx: CanvasRenderingContext2D, scale: number) => {
                const d = node as Nodo & { x: number; y: number };
                if ((d.tipo === 'ciudad' || d.tipo === 'proveedor') && scale < 2.2) return;
                const size = d.tipo === 'cedis' ? 13 / scale : 10 / scale;
                ctx.font = `${d.tipo === 'cedis' ? 'bold ' : ''}${size}px sans-serif`;
                ctx.fillStyle = '#334155';
                ctx.textAlign = 'center';
                ctx.fillText(d.id, d.x, d.y + Math.sqrt(d.val) * 4 + size);
              }}
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
          {[
            ['CEDIS', COLOR.cedis],
            ['Ciudad', COLOR.ciudad],
            ['Ciudad con caída > 20%', COLOR.ciudadMal],
            ['Proveedor', COLOR.proveedor],
            ['Tema de queja', COLOR.tema],
          ].map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: c }} /> {l}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
