/** Título de la app: barra lateral y pestaña del navegador */
export const APP_TITLE = 'Abarrotera 360';

/** Logo en /public (barra lateral y favicon) */
export const LOGO_SRC = '/icon.svg';

/** Objetos de Snowflake que usa la app (un solo lugar para cambiar base de datos o esquemas) */
export const DB = 'TEC_DEMO';
export const ESQUEMA = {
  ANALITICA: `${DB}.ANALITICA`,
  RAW: `${DB}.RAW`,
  AGENTES: `${DB}.AGENTES`,
} as const;
export const AGENTE = { esquema: 'AGENTES', nombre: 'AGENTE_COMERCIAL' } as const;

/**
 * Fechas de la historia del workshop (los mismos valores que TEC_DEMO.ANALITICA.PARAMETROS).
 * Los datos están congelados: nov-2024 a oct-2026, pronóstico hasta nov-2026.
 */
export const FECHAS = {
  mesAnalisis: '2026-10-01', // el mes de la caída
  mesPrevio: '2026-09-01',
  mesPronostico: '2026-11-01', // escenario "si no actuamos"
  inicioTendencia: '2025-11-01', // 12 meses de tendencia
  inicioSalud: '2026-05-01',
  inicioAnio: '2026-01-01',
  inicioTracker: '2026-07-06', // lunes: el tracker semanal arranca en semana completa
  inicioPronosticoDiario: '2026-06-01',
} as const;

/** CEDIS que se queda sin Bebidas en la historia (destino de la reasignación) */
export const CEDIS_FOCO = 'CEDIS León';

/** Orden de presentación de las regiones (la lista real sale de TEC_DEMO.RAW.REGIONES) */
export const ORDEN_REGIONES = ['Norte', 'Bajío', 'Centro', 'Sur', 'Sureste'];
