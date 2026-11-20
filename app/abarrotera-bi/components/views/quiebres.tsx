'use client';

import { Cargando, Kpi, Panel, ViewHeader } from '@/components/bi';
import { BarraFiltros, Chips } from '@/components/filtros';
import { DeckMap, EscalaCambio, Leyenda, colorCambio } from '@/components/map/deck-map';
import { COLOR_REGION, COLOR_TEMA, mdp, mesCorto, n, num, pct, useData, type Row } from '@/lib/app-state';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { BadgeDollarSign, MessageSquareWarning, PackageX, Siren } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CATS = ['Bebidas', 'Botanas', 'Lácteos', 'Panificados', 'Limpieza', 'Cuidado personal'];

export function Quiebres() {
  const causas = useData('causas');
  const mensual = useData('quiebre_mensual');
  const matriz = useData('quiebre_region_cat');
  const hex = useData('hexagonos');
  const cedis = useData('cedis');
  const kpis = useData('kpis');
  const k = kpis.data?.rows[0] ?? {};

  const [regSel, setRegSel] = useState<string[]>([]);
  const [catSel, setCatSel] = useState<string[]>(['Bebidas']);
  const [temaSel, setTemaSel] = useState<string[]>([]);
  const pasa = (sel: string[], v: unknown) => sel.length === 0 || sel.includes(String(v));
  const tog = (set: (f: (x: string[]) => string[]) => void) => (v: string) => set((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]));
  const todasRegiones = [...new Set((matriz.data?.rows ?? []).map((r) => String(r.region)))];
  const regiones = todasRegiones.filter((r) => pasa(regSel, r));
  // La matriz siempre muestra las 6 categorías (es la comparación); solo filtra regiones
  const cats = CATS;

  const causasAgg = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (causas.data?.rows ?? []).filter((x) => pasa(regSel, x.region) && pasa(temaSel, x.tema) && x.sentimiento === 'negative'))
      m.set(String(r.tema), (m.get(String(r.tema)) ?? 0) + n(r.n));
    return [...m.entries()].map(([tema, negativos]) => ({ tema, negativos })).sort((a, b) => b.negativos - a.negativos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [causas.data, regSel, temaSel]);

  const mensualAgg = useMemo(() => {
    const m = new Map<string, { q: number; d: number; p: number }>();
    for (const r of (mensual.data?.rows ?? []).filter((x) => pasa(regSel, x.region) && pasa(catSel, x.categoria))) {
      const k = String(r.mes).slice(0, 10);
      const o = m.get(k) ?? { q: 0, d: 0, p: 0 };
      o.q += n(r.dias_quiebre); o.d += n(r.dias_sku); o.p += n(r.perdida);
      m.set(k, o);
    }
    return [...m.entries()].sort().map(([mes, o]) => ({ mes: mesCorto(mes), perdida: o.p / 1e6, quiebre: (o.q / o.d) * 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensual.data, regSel, catSel]);
  const celda = (region: string, cat: string) => (matriz.data?.rows ?? []).find((r) => r.region === region && r.categoria === cat);

  const frontera = useMemo(() => (hex.data?.rows ?? []).filter((r) => r.region === 'Bajío' || r.region === 'Centro'), [hex.data]);
  const cedisBC = (cedis.data?.rows ?? []).filter((c) => c.region === 'Bajío' || c.region === 'Centro');

  return (
    <div>
      <ViewHeader
        icon={PackageX}
        title="Quiebres y venta perdida"
        subtitle="El quiebre de stock explica la caída: qué lo causó según los clientes, cuánto cuesta cada mes y en qué región y categoría se concentra."
        pregunta="¿Cuál fue la tasa de quiebre de Bebidas por región en octubre 2026 y cuánta venta se perdió por eso?"
      />
      <BarraFiltros
        activos={(regSel.length ? 1 : 0) + (catSel.join() !== 'Bebidas' ? 1 : 0) + (temaSel.length ? 1 : 0)}
        onLimpiar={() => { setRegSel([]); setCatSel(['Bebidas']); setTemaSel([]); }}
      >
        <Chips label="Región" opciones={todasRegiones.map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={regSel} onToggle={tog(setRegSel)} onTodos={() => setRegSel([])} />
        <Chips label="Categoría" opciones={cats.map((c) => ({ id: c }))} seleccion={catSel} onToggle={tog(setCatSel)} onTodos={() => setCatSel([])} />
        <Chips label="Tema (causa raíz)" opciones={Object.entries(COLOR_TEMA).map(([id, color]) => ({ id, color }))} seleccion={temaSel} onToggle={tog(setTemaSel)} onTodos={() => setTemaSel([])} />
      </BarraFiltros>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Quiebre máx. Bebidas" value={n(k.quiebre_max) * 100} format={(v) => `${v.toFixed(1)}%`} icon={Siren} tono="rose" hint="región más afectada" />
        <Kpi label="Venta perdida (oct)" value={n(k.perdida)} format={(v) => mdp(v)} icon={BadgeDollarSign} tono="rose" />
        <Kpi label="Quejas por desabasto" value={n(k.quejas_desabasto)} format={(v) => num(v)} icon={MessageSquareWarning} tono="amber" />
        <Kpi label="Venta en riesgo (nov)" value={n(k.riesgo)} format={(v) => mdp(v)} icon={PackageX} tono="violet" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Causa raíz según los clientes" subtitle="Comentarios negativos de octubre por tema (IA: AI_CLASSIFY + AI_SENTIMENT)">
          {causas.isPending ? (
            <Cargando error={causas.error} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={causasAgg} layout="vertical" margin={{ left: 30, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="tema" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="negativos" name="Comentarios negativos" radius={[0, 6, 6, 0]}>
                  {causasAgg.map((r, i) => (
                    <Cell key={i} fill={COLOR_TEMA[String(r.tema)] ?? '#94a3b8'} />
                  ))}
                  <LabelList dataKey="negativos" position="right" style={{ fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Quiebre y venta perdida por mes" subtitle={`Barras = venta perdida contra pronóstico ($M, solo Bebidas tiene pronóstico) · línea = tasa de quiebre (%) · ${catSel.length ? catSel.join(', ') : 'todas las categorías'}`}>
          {mensual.isPending ? (
            <Cargando error={mensual.error} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={mensualAgg}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="p" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}M`} />
                <YAxis yAxisId="q" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v, name) => (name === 'Quiebre %' ? `${Number(v).toFixed(1)}%` : `$${Number(v).toFixed(2)} M`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="p" dataKey="perdida" name="Venta perdida" fill="#fda4af" radius={[4, 4, 0, 0]} />
                <Line yAxisId="q" dataKey="quiebre" name="Quiebre %" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Panel title="Tasa de quiebre por región y categoría" subtitle="Octubre 2026 · el rojo intenso es el problema">
          {matriz.isPending ? (
            <Cargando error={matriz.error} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th />
                    {cats.map((c) => (
                      <th key={c} className="px-1 text-center font-medium text-slate-500">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regiones.map((r) => (
                    <tr key={r}>
                      <td className="pr-2 font-semibold" style={{ color: COLOR_REGION[r] }}>
                        {r}
                      </td>
                      {cats.map((c) => {
                        const v = n(celda(r, c)?.quiebre);
                        const a = Math.min(1, v / 0.35);
                        return (
                          <td key={c} className="h-11 rounded-md text-center font-semibold tabular-nums" style={{ background: `rgba(239,68,68,${0.08 + a * 0.85})`, color: a > 0.5 ? 'white' : '#7f1d1d' }}>
                            {pct(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="La frontera del problema" subtitle="Hexágonos H3 del Bajío y el Centro · a pocos kilómetros, una región cae y la otra crece" dark>
          {hex.isPending ? (
            <Cargando alto={360} error={hex.error} />
          ) : (
            <DeckMap
              height={360}
              vista={{ longitude: -100.6, latitude: 20.4, zoom: 6.3 }}
              layers={[
                new H3HexagonLayer({
                  id: 'frontera',
                  data: frontera,
                  getHexagon: (d: Row) => String(d.h3_cell),
                  getFillColor: (d: Row) => colorCambio(n(d.cambio_beb), 235),
                  extruded: false,
                  stroked: true,
                  getLineColor: [255, 255, 255, 60],
                  lineWidthMinPixels: 0.3,
                  pickable: true,
                }),
                new ScatterplotLayer({
                  id: 'cedis-bc',
                  data: cedisBC,
                  getPosition: (d: Row) => [n(d.lon), n(d.lat)],
                  getRadius: 8,
                  radiusUnits: 'pixels',
                  getFillColor: [255, 255, 255],
                  stroked: true,
                  getLineColor: [0, 0, 0],
                  lineWidthMinPixels: 2,
                }),
                new TextLayer({
                  id: 'cedis-bc-t',
                  data: cedisBC,
                  getPosition: (d: Row) => [n(d.lon), n(d.lat)],
                  getText: (d: Row) => String(d.nombre),
                  getSize: 13,
                  getColor: [255, 255, 255],
                  getPixelOffset: [0, -18],
                  characterSet: 'auto',
      fontFamily: 'Inter, Helvetica, Arial, sans-serif',
                  outlineWidth: 3,
                  outlineColor: [0, 0, 0, 255],
                  fontSettings: { sdf: true },
                }),
              ]}
              tooltip={(i) => (i.object ? `<b>${(i.object as Row).region}</b> · ${num((i.object as Row).tiendas)} tiendas<br/>Bebidas: ${pct((i.object as Row).cambio_beb, 1, false)}` : null)}
            >
              <Leyenda>
                <EscalaCambio />
              </Leyenda>
            </DeckMap>
          )}
        </Panel>
      </div>
    </div>
  );
}
