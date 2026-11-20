'use client';

import { Cargando, Kpi, Panel, ViewHeader } from '@/components/bi';
import { BarraFiltros, Chips } from '@/components/filtros';
import { DeckMap, Leyenda, type Vista } from '@/components/map/deck-map';
import { COLOR_REGION, mdp, mesCorto, n, num, pct, useApp, useData, type Row, type Vista as V } from '@/lib/app-state';
import { ScatterplotLayer } from '@deck.gl/layers';
import { ArrowRight, BadgeDollarSign, CircleAlert, LayoutDashboard, MessageSquareWarning, PackageX, ShoppingCart, Store, TrendingDown, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const VISTA_CHICA: Vista = { longitude: -101.8, latitude: 22.8, zoom: 3.75 };

export function Resumen() {
  const kpis = useData('kpis');
  const tendencia = useData('tendencia');
  const ciudades = useData('ciudades');
  const { setVista } = useApp();
  const k = kpis.data?.rows[0] ?? {};

  const [catSel, setCatSel] = useState<string[]>(['Bebidas']);
  const [regSel, setRegSel] = useState<string[]>([]);
  const pasa = (sel: string[], v: unknown) => sel.length === 0 || sel.includes(String(v));
  const tog = (set: (f: (x: string[]) => string[]) => void) => (v: string) => set((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]));
  const todasCats = [...new Set((tendencia.data?.rows ?? []).map((r) => String(r.categoria)))].sort();

  const serie = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of tendencia.data?.rows ?? []) {
      if (!pasa(catSel, r.categoria) || !pasa(regSel, r.region)) continue;
      const key = String(r.mes).slice(0, 10);
      const row = m.get(key) ?? { mes: key };
      row[String(r.region)] = n(row[String(r.region)] ?? 0) + n(r.venta) / 1e6;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tendencia.data, catSel, regSel]);
  const todasRegiones = [...new Set((tendencia.data?.rows ?? []).map((r) => String(r.region)))];
  const regiones = todasRegiones.filter((r) => pasa(regSel, r));
  const etiquetaCat = catSel.length ? catSel.join(', ') : 'todas las categorías';

  const cambioBeb = n(k.beb_oct) / n(k.beb_sep) - 1;

  const burbujas = (campo: 'beb_sep' | 'beb_oct') =>
    new ScatterplotLayer({
      id: campo,
      data: (ciudades.data?.rows ?? []).filter((d) => pasa(regSel, d.region)),
      getPosition: (d: Row) => [n(d.lon), n(d.lat)],
      getRadius: (d: Row) => Math.sqrt(n(d[campo])) * 38,
      getFillColor: (d: Row) => {
        const h = COLOR_REGION[String(d.region)] ?? '#94a3b8';
        return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 190];
      },
      stroked: true,
      getLineColor: [255, 255, 255, 140],
      lineWidthMinPixels: 0.5,
      pickable: true,
    });

  const historia: { vista: V; titulo: string; texto: string; icon: typeof Truck }[] = [
    { vista: 'mapa', titulo: '1 · ¿Dónde?', texto: 'La caída se concentra en el Bajío, alrededor del CEDIS León.', icon: Truck },
    { vista: 'quiebres', titulo: '2 · ¿Por qué?', texto: 'Quiebre de stock de Bebidas: 34.6% en León contra ~3% en el resto.', icon: PackageX },
    { vista: 'voz', titulo: '3 · ¿Qué dicen los clientes?', texto: 'Las quejas por desabasto dominan los comentarios de octubre.', icon: MessageSquareWarning },
    { vista: 'pronostico', titulo: '4 · ¿Cuánto nos cuesta?', texto: 'Venta real contra pronóstico, y lo que está en riesgo en noviembre.', icon: BadgeDollarSign },
  ];

  return (
    <div>
      <ViewHeader
        icon={LayoutDashboard}
        title="Resumen ejecutivo"
        subtitle="Abarrotera del Centro · octubre 2026. La venta de Bebidas cayó y el problema tiene geografía: aquí está la historia completa en una pantalla."
        pregunta="Dame un resumen ejecutivo de octubre 2026: qué pasó con Bebidas, dónde, por qué y cuánto dinero está en juego."
      />
      {kpis.error && <Cargando alto={80} error={kpis.error} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Venta octubre" value={n(k.venta_oct)} format={(v) => mdp(v)} icon={ShoppingCart} delta={{ text: pct(n(k.venta_oct) / n(k.venta_sep) - 1), good: n(k.venta_oct) >= n(k.venta_sep) }} hint="vs septiembre" />
        <Kpi label="Bebidas sep → oct" value={cambioBeb * 100} format={(v) => `${v.toFixed(1)}%`} icon={TrendingDown} tono="rose" hint={`${mdp(k.beb_sep)} → ${mdp(k.beb_oct)}`} />
        <Kpi label="Venta perdida (oct)" value={n(k.perdida)} format={(v) => mdp(v)} icon={BadgeDollarSign} tono="rose" hint="esperada − real, pronóstico" />
        <Kpi label="En riesgo (nov)" value={n(k.riesgo)} format={(v) => mdp(v)} icon={CircleAlert} tono="amber" hint="si no se reabastece" />
        <Kpi label="Quiebre máx. Bebidas" value={n(k.quiebre_max) * 100} format={(v) => `${v.toFixed(1)}%`} icon={PackageX} tono="rose" hint={`promedio ${pct(k.quiebre_beb)}`} />
        <Kpi label="Fill rate proveedores" value={n(k.fill_rate) * 100} format={(v) => `${v.toFixed(1)}%`} icon={Truck} tono="emerald" hint="unidades recibidas / pedidas" />
        <Kpi label="Quejas por desabasto" value={n(k.quejas_desabasto)} format={(v) => num(v)} icon={MessageSquareWarning} tono="violet" hint={`de ${num(k.comentarios)} comentarios`} />
        <Kpi label="Tiendas" value={n(k.tiendas)} format={(v) => num(v)} icon={Store} hint="visibles para tu rol" />
      </div>

      <div className="mt-4">
        <BarraFiltros activos={(catSel.join() !== 'Bebidas' ? 1 : 0) + (regSel.length ? 1 : 0)} onLimpiar={() => { setCatSel(['Bebidas']); setRegSel([]); }}
          resumen={<span>Tendencia y mapas · {etiquetaCat}</span>}>
          <Chips label="Categoría" opciones={todasCats.map((c) => ({ id: c }))} seleccion={catSel} onToggle={tog(setCatSel)} onTodos={() => setCatSel([])} />
          <Chips label="Región" opciones={todasRegiones.map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={regSel} onToggle={tog(setRegSel)} onTodos={() => setRegSel([])} />
        </BarraFiltros>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title={`Venta por región · ${etiquetaCat}`} subtitle="Millones de pesos por mes">
          {tendencia.isPending ? (
            <Cargando alto={300} error={tendencia.error} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={serie}>
                <defs>
                  {regiones.map((r) => (
                    <linearGradient key={r} id={`g-${r}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR_REGION[r]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLOR_REGION[r]} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(0)}M`} />
                <Tooltip formatter={(v) => `$${Number(v).toFixed(2)} M`} labelFormatter={mesCorto} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {regiones.map((r) => (
                  <Area key={r} type="monotone" dataKey={r} stroke={COLOR_REGION[r]} strokeWidth={r === 'Bajío' ? 3 : 1.6} fill={`url(#g-${r})`} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Antes y después" subtitle="Venta de Bebidas por ciudad · tamaño = pesos vendidos">
          {ciudades.isPending ? (
            <Cargando alto={300} error={ciudades.error} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(['beb_sep', 'beb_oct'] as const).map((c) => (
                <DeckMap
                  key={c}
                  layers={[burbujas(c)]}
                  vista={VISTA_CHICA}
                  height={300}
                  tooltip={(i) => (i.object ? `<b>${(i.object as Row).ciudad}</b><br/>${mdp((i.object as Row)[c], 2)}` : null)}
                >
                  <Leyenda className="left-2 top-2">
                    <b>{c === 'beb_sep' ? 'Septiembre' : 'Octubre'}</b>
                  </Leyenda>
                </DeckMap>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {historia.map((h) => (
          <button key={h.vista} onClick={() => setVista(h.vista)} className="group rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
            <h.icon className="mb-2 size-5 text-sky-500" />
            <div className="text-sm font-semibold text-slate-800">{h.titulo}</div>
            <p className="mt-1 text-xs text-slate-500">{h.texto}</p>
            <span className="mt-2 flex items-center gap-1 text-xs font-medium text-sky-600">
              Ver <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
