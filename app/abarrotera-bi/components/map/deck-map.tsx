'use client';

/**
 * Mapa base sin tiles de internet: deck.gl dibuja el océano (fondo), los países vecinos y los
 * 32 estados de México desde GeoJSON empaquetado en /public/geo. Las capas de datos se apilan encima.
 */

import { MapView, type Layer, type PickingInfo } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';

export type Vista = { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number };

export const VISTA_MEXICO: Vista = { longitude: -101.5, latitude: 23.4, zoom: 4.3, pitch: 0, bearing: 0 };

type FC = { type: 'FeatureCollection'; features: { properties: { name: string }; geometry: unknown }[] };

function useGeo(file: string) {
  return useQuery<FC>({
    queryKey: ['geo', file],
    queryFn: () => fetch(`/geo/${file}`).then((r) => r.json()),
    staleTime: Infinity,
  });
}

export const TEMAS_MAPA = {
  oscuro: { mar: [3, 7, 18], pais: [22, 30, 46], mexico: [18, 36, 64], borde: [56, 78, 110], estado: [40, 62, 96] },
  claro: { mar: [220, 235, 247], pais: [236, 233, 226], mexico: [248, 245, 238], borde: [180, 174, 162], estado: [205, 199, 188] },
} as const;

export function DeckMap({
  layers,
  vista = VISTA_MEXICO,
  height = 560,
  tooltip,
  tema = 'oscuro',
  children,
  resaltarEstados,
}: {
  layers: (Layer | null | false)[];
  vista?: Vista;
  height?: number | string;
  tooltip?: (info: PickingInfo) => string | null;
  tema?: keyof typeof TEMAS_MAPA;
  children?: React.ReactNode;
  /** Nombre de estado → color RGBA para pintar el relleno (p. ej. por región). */
  resaltarEstados?: (estado: string) => [number, number, number, number] | null;
}) {
  const paises = useGeo('paises.json');
  const estados = useGeo('mx-estados.json');
  const c = TEMAS_MAPA[tema];

  const base = useMemo(
    () => [
      paises.data &&
        new GeoJsonLayer({
          id: 'paises',
          data: { ...paises.data, features: paises.data.features.filter((f) => f.properties.name !== 'Mexico') } as never,
          filled: true,
          stroked: true,
          getFillColor: [...c.pais, 255],
          getLineColor: [...c.borde, 160],
          lineWidthMinPixels: 0.5,
        }),
      estados.data &&
        new GeoJsonLayer({
          id: 'estados',
          data: estados.data as never,
          filled: true,
          stroked: true,
          getFillColor: (f: { properties: { name: string } }) => resaltarEstados?.(f.properties.name) ?? [...c.mexico, 255],
          getLineColor: [...c.estado, 220],
          lineWidthMinPixels: 0.7,
          updateTriggers: { getFillColor: [resaltarEstados] },
        }),
    ],
    [paises.data, estados.data, c, resaltarEstados],
  );

  return (
    <div className="relative overflow-hidden rounded-lg" style={{ height, background: `rgb(${c.mar.join(',')})` }}>
      <DeckGL
        views={new MapView({ repeat: false })}
        initialViewState={vista}
        controller={{ dragRotate: true, touchRotate: true }}
        layers={[...base, ...layers].filter(Boolean) as Layer[]}
        getTooltip={(info) => {
          const t = tooltip?.(info);
          return t
            ? {
                html: t,
                style: {
                  background: 'rgba(15,23,42,0.95)',
                  color: '#f8fafc',
                  fontSize: '12px',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  border: '1px solid #334155',
                  maxWidth: '320px',
                },
              }
            : null;
        }}
      />
      {children}
    </div>
  );
}

/** Escala divergente rojo → amarillo → verde para un cambio en % (−45 … +15). */
export function colorCambio(v: number, alpha = 230): [number, number, number, number] {
  if (!Number.isFinite(v)) return [120, 120, 120, alpha];
  const stops: [number, [number, number, number]][] = [
    [-45, [165, 0, 38]],
    [-30, [215, 48, 39]],
    [-15, [244, 109, 67]],
    [-5, [254, 224, 139]],
    [0, [217, 239, 139]],
    [5, [102, 189, 99]],
    [15, [0, 104, 55]],
  ];
  const x = Math.max(-45, Math.min(15, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (x - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t, alpha] as [number, number, number, number];
    }
  }
  return [0, 104, 55, alpha];
}

export function hexToRgb(hex: string, alpha = 255): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha];
}

export function Leyenda({ children, className = 'bottom-3 left-3' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-lg border border-slate-700 bg-slate-900/85 px-3 py-2 text-[11px] text-slate-200 backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function EscalaCambio() {
  return (
    <div>
      <div className="mb-1 font-semibold">Cambio de Bebidas sep → oct</div>
      <div className="h-2 w-44 rounded" style={{ background: 'linear-gradient(90deg,#a50026,#d73027,#f46d43,#fee08b,#d9ef8b,#66bd63,#006837)' }} />
      <div className="mt-0.5 flex w-44 justify-between text-slate-400">
        <span>−45%</span>
        <span>0</span>
        <span>+15%</span>
      </div>
    </div>
  );
}
