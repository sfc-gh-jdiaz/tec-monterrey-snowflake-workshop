'use client';

import { Cargando, Kpi, Panel, ViewHeader } from '@/components/bi';
import { BarraFiltros, Chips, Deslizador } from '@/components/filtros';
import { DeckMap, EscalaCambio, Leyenda, VISTA_MEXICO, colorCambio, hexToRgb, type Vista } from '@/components/map/deck-map';
import { COLOR_REGION, COLOR_TEMA, mdp, n, num, pct, useData, type Row } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { PickingInfo } from '@deck.gl/core';
import { H3HexagonLayer, TripsLayer } from '@deck.gl/geo-layers';
import { ArcLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { AlertTriangle, Box, Flame, Globe2, Hexagon, MapPin, MessageSquareWarning, Radar, Route, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type CapaId = 'arcos' | 'hex' | 'calor' | 'burbujas' | 'cobertura' | 'quejas';

const CAPAS: { id: CapaId; label: string; icon: typeof Route; desc: string }[] = [
  { id: 'arcos', label: 'Arcos de abasto', icon: Route, desc: 'CEDIS → ciudad, color por estado de la ruta' },
  { id: 'hex', label: 'Hexágonos H3 3D', icon: Hexagon, desc: 'H3 resolución 7 · altura = venta oct · color = cambio Bebidas' },
  { id: 'calor', label: 'Calor de caída', icon: Flame, desc: 'Pesos de Bebidas perdidos por tienda' },
  { id: 'burbujas', label: 'Burbujas por ciudad', icon: MapPin, desc: 'Tamaño = tiendas · color = cambio' },
  { id: 'cobertura', label: 'Radio de cobertura', icon: Radar, desc: 'Anillos de 150 / 300 / 500 km por CEDIS' },
  { id: 'quejas', label: 'Quejas de clientes', icon: MessageSquareWarning, desc: 'Comentarios de octubre por tema' },
];

const estado = (c: number) => (c < -20 ? 'quiebre' : c < -5 ? 'riesgo' : 'ok');
const COLOR_ESTADO = { ok: [16, 185, 129], riesgo: [245, 158, 11], quiebre: [239, 68, 68] } as const;
const ETIQUETA_ESTADO = { ok: 'En tiempo', riesgo: 'En riesgo', quiebre: 'En quiebre' };

/** Puntos de una curva entre dos coordenadas para el recorrido animado. */
function curva(a: [number, number], b: [number, number], pasos = 60): [number, number][] {
  const out: [number, number][] = [];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    const lift = Math.sin(Math.PI * t) * 0.18;
    out.push([a[0] + dx * t - dy * lift, a[1] + dy * t + dx * lift]);
  }
  return out;
}

function anillo(lon: number, lat: number, km: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * 2 * Math.PI;
    pts.push([lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]);
  }
  return pts;
}

export function useCapasRed() {
  const ciudades = useData('ciudades');
  const cedis = useData('cedis');
  const hex = useData('hexagonos');
  const tiendas = useData('tiendas');
  const quejas = useData('quejas');
  const red = useData('red_abasto');
  return { ciudades, cedis, hex, tiendas, quejas, red };
}

export function MapaRed() {
  const { ciudades, cedis, hex, tiendas, quejas, red } = useCapasRed();
  const [activas, setActivas] = useState<Record<CapaId, boolean>>({
    arcos: true,
    hex: false,
    calor: false,
    burbujas: false,
    cobertura: false,
    quejas: false,
  });
  const [regSel, setRegSel] = useState<string[]>([]);
  const [estSel, setEstSel] = useState<string[]>([]);
  const [umbral, setUmbral] = useState(40);
  const [temaSel, setTemaSel] = useState<string[]>([]);
  const pasa = (sel: string[], v: unknown) => sel.length === 0 || sel.includes(String(v));
  const tog = (set: (f: (x: string[]) => string[]) => void) => (v: string) => set((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]));
  const pasaCambio = (v: unknown) => !Number.isFinite(n(v)) || n(v) <= umbral;
  const [vista, setVista] = useState<Vista>(VISTA_MEXICO);
  const [vistaKey, setVistaKey] = useState(0);
  const [t, setT] = useState(0);

  // Reloj para la animación del camión de reasignación.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setT((x) => (x + 0.6) % 100);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cedisPorRegion = useMemo(() => {
    const m: Record<string, Row> = {};
    for (const c of cedis.data?.rows ?? []) m[String(c.region)] = c;
    return m;
  }, [cedis.data]);

  const rutas = useMemo(
    () =>
      (ciudades.data?.rows ?? [])
        .map((c) => {
          const o = cedisPorRegion[String(c.region)];
          return o
            ? {
                ...c,
                cedis: String(o.nombre),
                from: [n(o.lon), n(o.lat)] as [number, number],
                to: [n(c.lon), n(c.lat)] as [number, number],
                estado: estado(n(c.cambio_beb)),
              }
            : null;
        })
        .filter(Boolean) as (Row & { cedis: string; from: [number, number]; to: [number, number]; estado: 'ok' | 'riesgo' | 'quiebre' })[],
    [ciudades.data, cedisPorRegion],
  );

  const rutasF = rutas.filter((r) => pasa(regSel, r.region) && pasa(estSel, r.estado) && pasaCambio(r.cambio_beb));
  const ciudadesF = (ciudades.data?.rows ?? []).filter((r) => pasa(regSel, r.region) && pasaCambio(r.cambio_beb));
  const hexF = (hex.data?.rows ?? []).filter((r) => pasa(regSel, r.region) && pasaCambio(r.cambio_beb));
  const tiendasF = (tiendas.data?.rows ?? []).filter((r) => pasa(regSel, r.region));
  const cedisF = (cedis.data?.rows ?? []).filter((r) => pasa(regSel, r.region));
  const mejor = red.data?.rows?.[0];
  const viaje = useMemo(
    () =>
      mejor
        ? [
            {
              path: curva([n(mejor.lon_o), n(mejor.lat_o)], [n(mejor.lon_d), n(mejor.lat_d)]),
              timestamps: Array.from({ length: 61 }, (_, i) => (i / 60) * 100),
            },
          ]
        : [],
    [mejor],
  );

  const quejasPts = useMemo(() => {
    const temas = Object.keys(COLOR_TEMA);
    return (quejas.data?.rows ?? []).map((q) => {
      const k = temas.indexOf(String(q.tema));
      const a = (k / temas.length) * 2 * Math.PI;
      return { ...q, pos: [n(q.lon) + 0.35 * Math.cos(a), n(q.lat) + 0.35 * Math.sin(a)] as [number, number] };
    });
  }, [quejas.data]);

  const layers = [
    activas.cobertura &&
      new ScatterplotLayer({
        id: 'cobertura-relleno',
        data: cedisF.flatMap((c) => [500, 300, 150].map((km) => ({ ...c, km }))),
        getPosition: (d: Row) => [n(d.lon), n(d.lat)],
        getRadius: (d: Row & { km: number }) => d.km * 1000,
        getFillColor: (d: Row & { km: number }) => [56, 189, 248, d.km === 150 ? 40 : d.km === 300 ? 22 : 12],
        stroked: true,
        getLineColor: [56, 189, 248, 160],
        lineWidthMinPixels: 1,
      }),
    activas.calor &&
      new HeatmapLayer({
        id: 'calor',
        data: tiendasF,
        getPosition: (d: Row) => [n(d.lon), n(d.lat)],
        getWeight: (d: Row) => n(d.caida),
        radiusPixels: 28,
        intensity: 1.4,
        threshold: 0.04,
        colorRange: [
          [255, 255, 178],
          [254, 217, 118],
          [254, 178, 76],
          [253, 141, 60],
          [240, 59, 32],
          [189, 0, 38],
        ],
      }),
    activas.hex &&
      new H3HexagonLayer({
        id: 'hex',
        data: hexF,
        getHexagon: (d: Row) => String(d.h3_cell),
        extruded: true,
        elevationScale: 1,
        // Resolución 7 (~5 km²): cada hexágono junta ~5 veces menos tiendas que la 5, por eso la escala es mayor
        getElevation: (d: Row) => n(d.venta_oct) / 50,
        getFillColor: (d: Row) => colorCambio(n(d.cambio_beb), 235),
        pickable: true,
        material: { ambient: 0.5, diffuse: 0.6, shininess: 40 },
      }),
    activas.arcos &&
      new ArcLayer({
        id: 'arcos',
        data: rutasF,
        getSourcePosition: (d: (typeof rutas)[number]) => d.from,
        getTargetPosition: (d: (typeof rutas)[number]) => d.to,
        getSourceColor: (d: (typeof rutas)[number]) => [...COLOR_ESTADO[d.estado], 90],
        getTargetColor: (d: (typeof rutas)[number]) => [...COLOR_ESTADO[d.estado], 240],
        getWidth: (d: (typeof rutas)[number]) => 1 + Math.sqrt(n(d.venta_oct) / 1e6) * 0.9,
        getHeight: 0.35,
        greatCircle: false,
        pickable: true,
      }),
    activas.arcos &&
      new ArcLayer({
        id: 'reasignacion',
        data: red.data?.rows ?? [],
        getSourcePosition: (d: Row) => [n(d.lon_o), n(d.lat_o)],
        getTargetPosition: (d: Row) => [n(d.lon_d), n(d.lat_d)],
        getSourceColor: (d: Row) => (d === mejor ? [56, 189, 248, 255] : [148, 163, 184, 110]),
        getTargetColor: (d: Row) => (d === mejor ? [56, 189, 248, 255] : [148, 163, 184, 110]),
        getWidth: (d: Row) => (d === mejor ? 4 : 1.5),
        getHeight: 0.6,
        pickable: true,
      }),
    activas.arcos &&
      new TripsLayer({
        id: 'camion',
        data: viaje,
        getPath: (d: { path: [number, number][] }) => d.path,
        getTimestamps: (d: { timestamps: number[] }) => d.timestamps,
        getColor: [125, 211, 252],
        widthMinPixels: 6,
        trailLength: 22,
        currentTime: t,
        capRounded: true,
        jointRounded: true,
      }),
    activas.burbujas &&
      new ScatterplotLayer({
        id: 'burbujas',
        data: ciudadesF,
        getPosition: (d: Row) => [n(d.lon), n(d.lat)],
        getRadius: (d: Row) => Math.sqrt(n(d.tiendas)) * 2600,
        getFillColor: (d: Row) => colorCambio(n(d.cambio_beb), 210),
        stroked: true,
        getLineColor: [255, 255, 255, 120],
        lineWidthMinPixels: 0.6,
        pickable: true,
      }),
    activas.quejas &&
      new ScatterplotLayer({
        id: 'quejas',
        data: quejasPts.filter((q) => pasa(regSel, (q as Row).region) && pasa(temaSel, (q as Row).tema)),
        getPosition: (d: (typeof quejasPts)[number]) => d.pos,
        getRadius: (d: Row) => Math.sqrt(n(d.n)) * 4500,
        getFillColor: (d: Row) => hexToRgb(COLOR_TEMA[String(d.tema)] ?? '#94a3b8', 200),
        stroked: true,
        getLineColor: [255, 255, 255, 90],
        lineWidthMinPixels: 0.5,
        pickable: true,
      }),
    new ScatterplotLayer({
      id: 'cedis',
      data: cedisF,
      getPosition: (d: Row) => [n(d.lon), n(d.lat)],
      getRadius: 9,
      radiusUnits: 'pixels',
      getFillColor: (d: Row) => (n(d.quiebre) > 0.1 ? [239, 68, 68, 255] : [255, 255, 255, 255]),
      stroked: true,
      getLineColor: [15, 23, 42, 255],
      lineWidthMinPixels: 2,
      pickable: true,
    }),
    new TextLayer({
      id: 'cedis-texto',
      data: cedisF,
      getPosition: (d: Row) => [n(d.lon), n(d.lat)],
      getText: (d: Row) => String(d.nombre).replace('CEDIS ', ''),
      getSize: 13,
      getColor: [241, 245, 249, 255],
      getPixelOffset: [0, -18],
      fontWeight: 700,
      characterSet: 'auto',
      fontFamily: 'Inter, Helvetica, Arial, sans-serif',
      outlineWidth: 3,
      outlineColor: [3, 7, 18, 255],
      fontSettings: { sdf: true },
    }),
  ];

  const tooltip = (info: PickingInfo): string | null => {
    const o = info.object as Row | undefined;
    if (!o) return null;
    switch (info.layer?.id) {
      case 'arcos':
        return `<b>${o.cedis} → ${o.ciudad}</b><br/>${o.estado === 'quiebre' ? '🔴' : o.estado === 'riesgo' ? '🟠' : '🟢'} ${ETIQUETA_ESTADO[o.estado as 'ok']}<br/>Venta oct: ${mdp(o.venta_oct)}<br/>Bebidas: ${pct(o.cambio_beb, 1, false)}`;
      case 'reasignacion':
        return `<b>${o.cedis_origen} → ${o.cedis_destino}</b><br/>${num(o.distancia_km)} km · ${num(o.horas_camion, 1)} h<br/>Excedente: ${num(o.excedente)} u`;
      case 'hex':
        return `<b>Hexágono ${o.h3_cell}</b><br/>${o.region} · ${num(o.tiendas)} tiendas<br/>Venta oct: ${mdp(o.venta_oct, 2)}<br/>Bebidas: ${pct(o.cambio_beb, 1, false)}`;
      case 'burbujas':
        return `<b>${o.ciudad}</b>, ${o.estado}<br/>${num(o.tiendas)} tiendas · ${o.region}<br/>Bebidas: ${pct(o.cambio_beb, 1, false)}`;
      case 'quejas':
        return `<b>${o.tema}</b> · ${o.estado}<br/>${num(o.n)} comentarios (${num(o.negativos)} negativos)<br/><i>“${o.ejemplo}”</i>`;
      case 'cedis':
        return `<b>${o.nombre}</b> (${o.region})<br/>Quiebre Bebidas: ${pct(o.quiebre)}<br/>Días de inventario: ${num(o.dias_inventario, 1)}<br/>Fill rate: ${pct(o.fill_rate)}`;
      default:
        return null;
    }
  };

  const enRiesgo = rutasF.filter((r) => r.estado !== 'ok');
  const cargando = ciudades.isPending || cedis.isPending;

  const irA = (v: Vista) => {
    setVista(v);
    setVistaKey((k) => k + 1);
  };

  return (
    <div>
      <ViewHeader
        icon={Globe2}
        title="Mapa de la red de abasto"
        subtitle="Cinco CEDIS abastecen 93 ciudades. Prende y apaga capas para ver dónde se rompió la cadena; arrastra con clic derecho para inclinar el mapa en 3D."
        pregunta="¿Qué rutas de abasto están en quiebre y desde qué CEDIS conviene reasignar inventario a León?"
      />
      <BarraFiltros
        activos={(regSel.length ? 1 : 0) + (estSel.length ? 1 : 0) + (umbral < 40 ? 1 : 0) + (temaSel.length ? 1 : 0)}
        onLimpiar={() => { setRegSel([]); setEstSel([]); setUmbral(40); setTemaSel([]); }}
        resumen={<span>{num(rutasF.length)} rutas · {num(ciudadesF.length)} ciudades</span>}
      >
        <Chips label="Región" opciones={Object.keys(COLOR_REGION).map((r) => ({ id: r, color: COLOR_REGION[r] }))} seleccion={regSel} onToggle={tog(setRegSel)} onTodos={() => setRegSel([])} />
        <Chips label="Estado de la ruta" opciones={(['ok', 'riesgo', 'quiebre'] as const).map((e) => ({ id: e, label: ETIQUETA_ESTADO[e], color: `rgb(${COLOR_ESTADO[e].join(',')})` }))} seleccion={estSel} onToggle={tog(setEstSel)} onTodos={() => setEstSel([])} />
        <Deslizador label="Cambio de Bebidas ≤" value={umbral} onChange={setUmbral} min={-45} max={40} fmt={(v) => (v >= 40 ? 'todo' : `${v}%`)} />
        {activas.quejas && <Chips label="Tema de queja" opciones={Object.entries(COLOR_TEMA).map(([id, color]) => ({ id, color }))} seleccion={temaSel} onToggle={tog(setTemaSel)} onTodos={() => setTemaSel([])} />}
      </BarraFiltros>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Nodos de la red" value={(cedis.data?.rows.length ?? 0) + (ciudades.data?.rows.length ?? 0)} format={(v) => num(v)} hint="5 CEDIS + ciudades" icon={Box} />
        <Kpi label="Rutas activas" value={rutasF.length || undefined} format={(v) => num(v)} hint="CEDIS → ciudad" icon={Truck} tono="violet" />
        <Kpi label="Rutas en riesgo o quiebre" value={enRiesgo.length} format={(v) => num(v)} hint="caída de Bebidas > 5%" icon={AlertTriangle} tono="amber" />
        <Kpi
          label="Venta en rutas en quiebre"
          value={rutasF.filter((r) => r.estado === 'quiebre').reduce((s, r) => s + n(r.venta_oct), 0) || undefined}
          format={(v) => mdp(v)}
          hint="venta de octubre"
          icon={Flame}
          tono="rose"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel dark className="p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {CAPAS.map((c) => (
              <button
                key={c.id}
                title={c.desc}
                onClick={() => setActivas((a) => ({ ...a, [c.id]: !a[c.id] }))}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                  activas[c.id] ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                )}
              >
                <c.icon className="size-3.5" /> {c.label}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              <button onClick={() => irA(VISTA_MEXICO)} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">
                México
              </button>
              <button
                onClick={() => irA({ longitude: -100.9, latitude: 20.6, zoom: 6.4, pitch: 50, bearing: -15 })}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Bajío 3D
              </button>
            </div>
          </div>
          {cargando ? (
            <Cargando alto={600} error={ciudades.error ?? cedis.error} />
          ) : (
            <DeckMap key={vistaKey} layers={layers} vista={vista} height={600} tooltip={tooltip}>
              <Leyenda>
                {activas.arcos && (
                  <div className="mb-1 flex gap-3">
                    {(['ok', 'riesgo', 'quiebre'] as const).map((e) => (
                      <span key={e} className="flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: `rgb(${COLOR_ESTADO[e].join(',')})` }} /> {ETIQUETA_ESTADO[e]}
                      </span>
                    ))}
                    <span className="flex items-center gap-1">
                      <span className="h-1 w-4 rounded bg-sky-300" /> Reasignación sugerida
                    </span>
                  </div>
                )}
                {(activas.hex || activas.burbujas) && <EscalaCambio />}
                {activas.calor && <div>Calor = pesos de Bebidas perdidos sep → oct</div>}
                {activas.quejas && (
                  <div className="mt-1 grid grid-cols-2 gap-x-3">
                    {Object.entries(COLOR_TEMA).map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: v }} /> {k}
                      </span>
                    ))}
                  </div>
                )}
              </Leyenda>
              {mejor && activas.arcos && (
                <Leyenda className="right-3 top-3">
                  <div className="font-semibold text-sky-300">Reasignación recomendada</div>
                  <div>
                    {String(mejor.cedis_origen)} → {String(mejor.cedis_destino)}
                  </div>
                  <div className="text-slate-400">
                    {num(mejor.distancia_km)} km · {num(mejor.horas_camion, 1)} h · excedente {num(mejor.excedente)} u
                  </div>
                </Leyenda>
              )}
            </DeckMap>
          )}
        </Panel>

        <Panel title="Rutas por valor" subtitle="Octubre 2026 · ordenadas por venta" className="max-h-[680px] overflow-hidden">
          <div className="max-h-[610px] space-y-1 overflow-y-auto pr-1">
            {[...rutasF]
              .sort((a, b) => n(b.venta_oct) - n(a.venta_oct))
              .map((r) => (
                <button
                  key={`${r.cedis}-${r.ciudad}`}
                  onClick={() => irA({ longitude: r.to[0], latitude: r.to[1], zoom: 7.2, pitch: 40 })}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: `rgb(${COLOR_ESTADO[r.estado].join(',')})` }} />
                    <span className="truncate">
                      <b className="text-slate-700">{r.cedis.replace('CEDIS ', '')}</b> → {String(r.ciudad)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block font-semibold text-slate-800">{mdp(r.venta_oct, 1)}</span>
                    <span className={cn('block', n(r.cambio_beb) < -5 ? 'text-rose-500' : 'text-emerald-600')}>{pct(r.cambio_beb, 1, false)}</span>
                  </span>
                </button>
              ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
