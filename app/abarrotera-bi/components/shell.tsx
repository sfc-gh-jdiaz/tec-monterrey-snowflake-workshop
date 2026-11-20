'use client';

import { AgentChat, type AgentChatHandle } from '@/components/agent-chat';
import { Agente } from '@/components/views/agente';
import { Flujo } from '@/components/views/flujo';
import { Grafo } from '@/components/views/grafo';
import { Llamadas } from '@/components/views/llamadas';
import { MapaRed } from '@/components/views/mapa';
import { Pronostico } from '@/components/views/pronostico';
import { Quiebres } from '@/components/views/quiebres';
import { Resumen } from '@/components/views/resumen';
import { Salud } from '@/components/views/salud';
import { Tracker } from '@/components/views/tracker';
import { Voz } from '@/components/views/voz';
import { AppCtx, COLOR_REGION, type Vista } from '@/lib/app-state';
import { APP_TITLE, LOGO_SRC } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  Globe2,
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  Network,
  PackageX,
  PhoneCall,
  Radar,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const NAV: { id: Vista; label: string; icon: typeof Globe2; grupo: string }[] = [
  { id: 'resumen', label: 'Resumen ejecutivo', icon: LayoutDashboard, grupo: 'Dirección' },
  { id: 'mapa', label: 'Mapa de red', icon: Globe2, grupo: 'Cadena de suministro' },
  { id: 'flujo', label: 'Flujo de valor', icon: Workflow, grupo: 'Cadena de suministro' },
  { id: 'salud', label: 'Salud operativa', icon: Activity, grupo: 'Cadena de suministro' },
  { id: 'grafo', label: 'Grafo de la red', icon: Network, grupo: 'Cadena de suministro' },
  { id: 'quiebres', label: 'Quiebres y venta perdida', icon: PackageX, grupo: 'Diagnóstico' },
  { id: 'tracker', label: 'Tracker semanal', icon: Radar, grupo: 'Diagnóstico' },
  { id: 'pronostico', label: 'Pronóstico', icon: LineChart, grupo: 'Diagnóstico' },
  { id: 'voz', label: 'Voz del cliente', icon: MessagesSquare, grupo: 'Diagnóstico' },
  { id: 'llamadas', label: 'Llamadas del call center', icon: PhoneCall, grupo: 'Diagnóstico' },
  { id: 'agente', label: 'Agente comercial', icon: Bot, grupo: 'IA' },
];

const ROL_LABEL: Record<string, string> = {
  DIRECTOR_COMERCIAL: 'Director comercial · todo el país',
  TEC_ADMIN: 'TEC_ADMIN · todo el país',
  GERENTE_NORTE: 'Gerente Norte',
  GERENTE_BAJIO: 'Gerente Bajío',
};

export default function Shell() {
  const [vista, setVista] = useState<Vista>('resumen');
  const [rol, setRol] = useState('DIRECTOR_COMERCIAL');
  const [drawer, setDrawer] = useState(false);
  const drawerChat = useRef<AgentChatHandle>(null);
  const mainChat = useRef<AgentChatHandle>(null);
  const pendiente = useRef<string | null>(null);

  const roles = useQuery<{ roles: Record<string, string[]>; visibles?: string[] }>({
    queryKey: ['roles'],
    queryFn: () => fetch('/api/roles').then((r) => r.json()),
    staleTime: Infinity,
  });

  const preguntar = useCallback(
    (q: string) => {
      if (vista === 'agente') {
        mainChat.current?.enviar(q);
        return;
      }
      setDrawer(true);
      pendiente.current = q;
    },
    [vista],
  );

  useEffect(() => {
    if (drawer && pendiente.current) {
      const q = pendiente.current;
      pendiente.current = null;
      setTimeout(() => drawerChat.current?.enviar(q), 50);
    }
  }, [drawer]);

  useEffect(() => {
    document.getElementById('contenido')?.scrollTo({ top: 0 });
  }, [vista]);

  // Lo que muestra el selector, recortado a lo que el usuario realmente puede ver (lo mismo que hace el servidor)
  const visibles = new Set(roles.data?.visibles ?? []);
  const regiones = (roles.data?.roles?.[rol] ?? []).filter((r) => visibles.has(r));
  const grupos = [...new Set(NAV.map((x) => x.grupo))];

  const VIEWS: Record<Vista, React.ReactNode> = {
    resumen: <Resumen />,
    mapa: <MapaRed />,
    flujo: <Flujo />,
    salud: <Salud />,
    quiebres: <Quiebres />,
    tracker: <Tracker />,
    pronostico: <Pronostico />,
    voz: <Voz />,
    llamadas: <Llamadas />,
    grafo: <Grafo />,
    agente: <Agente ref={mainChat} />,
  };

  return (
    <AppCtx.Provider value={{ rol, setRol, vista, setVista, preguntar }}>
      <div className="flex h-screen overflow-hidden bg-slate-100">
        <aside className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-[#0a2f5a] to-[#061b36] text-slate-200">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_SRC} alt="" className="size-9 rounded-lg" />
            <div>
              <div className="text-sm font-bold leading-tight text-white">{APP_TITLE}</div>
              <div className="text-[11px] text-sky-200/70">Abarrotera del Centro</div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {grupos.map((g) => (
              <div key={g} className="mb-3">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-200/50">{g}</div>
                {NAV.filter((x) => x.grupo === g).map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setVista(x.id)}
                    className={cn(
                      'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition',
                      vista === x.id ? 'bg-white text-[#0a2f5a] shadow font-semibold' : 'hover:bg-white/10',
                    )}
                  >
                    <x.icon className={cn('size-4', vista === x.id ? 'text-sky-500' : 'text-sky-200/70')} /> {x.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t border-white/10 p-4 text-[11px]">
            <div className="mb-2 font-semibold uppercase tracking-wider text-sky-200/50">Regiones visibles</div>
            <div className="flex flex-wrap gap-1.5">
              {regiones.map((r) => (
                <span key={r} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                  <span className="size-2 rounded-full" style={{ background: COLOR_REGION[r] }} /> {r}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b bg-white px-6 py-3">
            <div className="text-xs text-slate-500">
              Datos en vivo de <b className="text-slate-700">TEC_DEMO</b> · octubre 2026
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="size-4 text-emerald-500" /> Ver como
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  className="rounded-lg border bg-white px-2 py-1.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-200"
                >
                  {Object.keys(roles.data?.roles ?? { DIRECTOR_COMERCIAL: [] }).map((r) => (
                    <option key={r} value={r}>
                      {ROL_LABEL[r] ?? r}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => (vista === 'agente' ? null : setDrawer((d) => !d))}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:brightness-110"
              >
                <Sparkles className="size-4" /> Agente
              </button>
            </div>
          </header>
          <main id="contenido" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div key={`${vista}-${rol}`} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {VIEWS[vista]}
            </div>
          </main>
        </div>

        <div
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-full flex-col border-l bg-white shadow-2xl transition-transform duration-300',
            drawer && vista !== 'agente' ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-[#0a2f5a] to-indigo-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" /> Agente comercial
            </div>
            <button onClick={() => setDrawer(false)} className="rounded p-1 hover:bg-white/10">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AgentChat ref={drawerChat} compacto />
          </div>
        </div>
      </div>
    </AppCtx.Provider>
  );
}
