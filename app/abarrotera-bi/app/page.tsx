'use client';

// La app entera corre en el navegador: deck.gl y el grafo necesitan WebGL / canvas.
import dynamic from 'next/dynamic';

const Shell = dynamic(() => import('@/components/shell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-[#061b36] text-sm text-sky-100">Cargando Abarrotera 360…</div>
  ),
});

export default function Home() {
  return <Shell />;
}
