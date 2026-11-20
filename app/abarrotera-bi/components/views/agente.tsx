'use client';

import { AgentChat, type AgentChatHandle } from '@/components/agent-chat';
import { Panel } from '@/components/bi';
import { DeckMap, Leyenda } from '@/components/map/deck-map';
import { mdp, n, num, pct, useApp, useData, type Row } from '@/lib/app-state';
import { ArcLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { Bot, ShieldCheck } from 'lucide-react';
import { forwardRef } from 'react';

export const Agente = forwardRef<AgentChatHandle>(function Agente(_props, ref) {
  const { rol } = useApp();
  const red = useData('red_abasto');
  const kpis = useData('kpis');
  const rutas = red.data?.rows ?? [];
  const mejor = rutas[0];
  const k = kpis.data?.rows[0] ?? {};

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Bot className="size-6 text-sky-500" /> Agente comercial
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Conversa con TEC_DEMO.AGENTES.AGENTE_COMERCIAL. Responde con datos de la Semantic View, el pronóstico, los comentarios y el manual de abasto (Cortex Search), y te muestra el SQL que generó.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="h-[calc(100vh-200px)] min-h-[560px] overflow-hidden rounded-xl border bg-white shadow-sm">
          <AgentChat ref={ref} />
        </div>
        <div className="space-y-4">
          <Panel title="Ruta recomendada" subtitle="RED_ABASTO · reasignación hacia CEDIS León" dark>
            <DeckMap
              height={260}
              vista={{ longitude: -98.5, latitude: 21.5, zoom: 4.2 }}
              layers={[
                new ArcLayer({
                  id: 'mini-arcos',
                  data: rutas,
                  getSourcePosition: (d: Row) => [n(d.lon_o), n(d.lat_o)],
                  getTargetPosition: (d: Row) => [n(d.lon_d), n(d.lat_d)],
                  getSourceColor: (d: Row) => (d === mejor ? [56, 189, 248, 255] : [148, 163, 184, 120]),
                  getTargetColor: (d: Row) => (d === mejor ? [56, 189, 248, 255] : [148, 163, 184, 120]),
                  getWidth: (d: Row) => (d === mejor ? 4 : 1.5),
                  pickable: true,
                }),
                new ScatterplotLayer({
                  id: 'mini-pts',
                  data: rutas.flatMap((r) => [
                    { nombre: r.cedis_origen, lon: r.lon_o, lat: r.lat_o },
                    { nombre: r.cedis_destino, lon: r.lon_d, lat: r.lat_d },
                  ]),
                  getPosition: (d: Row) => [n(d.lon), n(d.lat)],
                  getRadius: 6,
                  radiusUnits: 'pixels',
                  getFillColor: (d: Row) => (d.nombre === 'CEDIS León' ? [239, 68, 68] : [255, 255, 255]),
                }),
                new TextLayer({
                  id: 'mini-t',
                  data: rutas.map((r) => ({ nombre: String(r.cedis_origen).replace('CEDIS ', ''), lon: r.lon_o, lat: r.lat_o })).concat(mejor ? [{ nombre: 'León', lon: mejor.lon_d, lat: mejor.lat_d }] : []),
                  getPosition: (d: Row) => [n(d.lon), n(d.lat)],
                  getText: (d: Row) => String(d.nombre),
                  getSize: 11,
                  getColor: [241, 245, 249],
                  getPixelOffset: [0, -14],
                  characterSet: 'auto',
      fontFamily: 'Inter, Helvetica, Arial, sans-serif',
                  outlineWidth: 3,
                  outlineColor: [3, 7, 18, 255],
                  fontSettings: { sdf: true },
                }),
              ]}
              tooltip={(i) => (i.object && (i.object as Row).distancia_km ? `${(i.object as Row).cedis_origen}: ${num((i.object as Row).distancia_km)} km` : null)}
            >
              {mejor && (
                <Leyenda>
                  <b className="text-sky-300">{String(mejor.cedis_origen)}</b> · {num(mejor.distancia_km)} km · {num(mejor.horas_camion, 1)} h
                </Leyenda>
              )}
            </DeckMap>
          </Panel>
          <Panel title="Lo que el agente sabe" subtitle="Cifras clave de octubre 2026">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {[
                ['Bebidas sep→oct', pct(n(k.beb_oct) / n(k.beb_sep) - 1)],
                ['Venta perdida', mdp(k.perdida)],
                ['En riesgo nov', mdp(k.riesgo)],
                ['Quiebre máx.', pct(k.quiebre_max)],
              ].map(([a, b]) => (
                <div key={a} className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">{a}</dt>
                  <dd className="text-base font-bold text-slate-800">{b}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Viendo como <b>{rol}</b>. La Row Access Policy RAP_REGION decide qué regiones puedes ver con tu usuario de Snowflake; el selector solo reduce esa vista. El agente corre con tus permisos, así que la misma política se aplica a sus consultas.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
