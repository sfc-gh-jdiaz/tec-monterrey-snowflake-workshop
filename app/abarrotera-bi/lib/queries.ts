/**
 * Todas las consultas de la app. Cada una lee objetos reales de TEC_DEMO.
 *
 * `{R}` (o `{R:alias.columna}`) se reemplaza por el filtro de regiones del rol
 * elegido en el selector: `region IN (?, ?, ...)`. Así la app reproduce lo que la
 * Row Access Policy RAP_REGION haría para ese rol, leyendo la misma tabla
 * ACCESO_REGION que usa la política.
 */

import { CEDIS_FOCO, ESQUEMA, FECHAS, ORDEN_REGIONES } from '@/lib/constants';

const A = ESQUEMA.ANALITICA;
const RAW = ESQUEMA.RAW;
/** Literal SQL de una fecha de lib/constants (valores fijos del código, nunca datos del usuario) */
const f = (d: string) => `'${d}'`;
const OCT = f(FECHAS.mesAnalisis);
const SEP = f(FECHAS.mesPrevio);
const NOV = f(FECHAS.mesPronostico);

export const QUERIES: Record<string, string> = {
  // ---------- Resumen ----------
  kpis: `
WITH v AS (
  SELECT SUM(IFF(mes = ${OCT}, venta_neta, 0)) AS venta_oct,
         SUM(IFF(mes = ${SEP}, venta_neta, 0)) AS venta_sep,
         SUM(IFF(mes = ${OCT} AND categoria = 'Bebidas', venta_neta, 0)) AS beb_oct,
         SUM(IFF(mes = ${SEP} AND categoria = 'Bebidas', venta_neta, 0)) AS beb_sep,
         SUM(IFF(mes = ${OCT}, margen_bruto, 0)) AS margen_oct
  FROM ${A}.VENTAS_MENSUALES WHERE mes IN (${SEP}, ${OCT}) AND {R}),
p AS (
  SELECT SUM(IFF(mes = ${OCT}, venta_esperada - venta_real, 0)) AS perdida,
         SUM(IFF(mes = ${NOV}, venta_esperada - venta_sin_accion, 0)) AS riesgo
  FROM ${A}.PRONOSTICO_MENSUAL WHERE {R}),
i AS (
  SELECT SUM(dias_sku_quiebre) / NULLIF(SUM(dias_sku), 0) AS quiebre_beb,
         MAX(dias_sku_quiebre / NULLIF(dias_sku, 0)) AS quiebre_max
  FROM ${A}.INVENTARIO_MENSUAL WHERE mes = ${OCT} AND categoria = 'Bebidas' AND {R}),
c AS (
  SELECT SUM(unidades_recibidas) / NULLIF(SUM(unidades_pedidas), 0) AS fill_rate
  FROM ${A}.COMPRAS_MENSUALES WHERE mes = ${OCT} AND {R}),
q AS (
  SELECT COUNT_IF(t.tema = 'Desabasto de producto') AS quejas_desabasto, COUNT(*) AS comentarios
  FROM ${A}.VOZ_CLIENTE v JOIN ${A}.TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id
  WHERE v.mes = ${OCT} AND {R:v.region}),
t AS (SELECT COUNT(DISTINCT tienda_id) AS tiendas FROM ${A}.TIENDAS_GEO WHERE mes = ${OCT} AND {R})
SELECT v.*, p.*, i.*, c.*, q.*, t.* FROM v, p, i, c, q, t`,

  tendencia: `
SELECT mes, region, categoria, SUM(venta_neta) AS venta
FROM ${A}.VENTAS_MENSUALES WHERE mes >= ${f(FECHAS.inicioTendencia)} AND {R}
GROUP BY 1, 2, 3 ORDER BY 1`,

  // ---------- Mapas ----------
  ciudades: `
SELECT ciudad, estado, region, AVG(latitud) AS lat, AVG(longitud) AS lon,
       COUNT(DISTINCT tienda_id) AS tiendas,
       SUM(IFF(mes = ${OCT}, venta_neta, 0)) AS venta_oct,
       SUM(IFF(mes = ${OCT}, venta_bebidas, 0)) AS beb_oct,
       SUM(IFF(mes = ${SEP}, venta_bebidas, 0)) AS beb_sep,
       ROUND(100 * (SUM(IFF(mes = ${OCT}, venta_bebidas, 0)) / NULLIF(SUM(IFF(mes = ${SEP}, venta_bebidas, 0)), 0) - 1), 1) AS cambio_beb
FROM ${A}.TIENDAS_GEO WHERE mes IN (${SEP}, ${OCT}) AND {R}
GROUP BY 1, 2, 3`,

  // h3_cell ya viene calculado en TIENDAS_GEO (resolución 7, la misma que usan la Semantic View y el agente)
  hexagonos: `
SELECT h3_cell, MODE(region) AS region,
       COUNT(DISTINCT tienda_id) AS tiendas,
       SUM(IFF(mes = ${OCT}, venta_neta, 0)) AS venta_oct,
       ROUND(100 * (SUM(IFF(mes = ${OCT}, venta_bebidas, 0)) / NULLIF(SUM(IFF(mes = ${SEP}, venta_bebidas, 0)), 0) - 1), 1) AS cambio_beb
FROM ${A}.TIENDAS_GEO WHERE mes IN (${SEP}, ${OCT}) AND {R}
GROUP BY 1`,

  tiendas: `
SELECT ROUND(latitud, 3) AS lat, ROUND(longitud, 3) AS lon, region,
       GREATEST(SUM(IFF(mes = ${SEP}, venta_bebidas, 0)) - SUM(IFF(mes = ${OCT}, venta_bebidas, 0)), 0) AS caida
FROM ${A}.TIENDAS_GEO WHERE mes IN (${SEP}, ${OCT}) AND {R}
GROUP BY tienda_id, 1, 2, 3`,

  cedis: `
SELECT c.cedis_id, c.nombre, c.region, c.latitud::FLOAT AS lat, c.longitud::FLOAT AS lon,
       i.quiebre, i.dias_inventario, f.fill_rate, s.venta_oct
FROM ${RAW}.CEDIS c
LEFT JOIN (SELECT region, SUM(dias_sku_quiebre) / NULLIF(SUM(dias_sku), 0) AS quiebre,
                  SUM(unidades_disponibles) / NULLIF(SUM(demanda_total), 0) AS dias_inventario
           FROM ${A}.INVENTARIO_MENSUAL WHERE mes = ${OCT} AND categoria = 'Bebidas' GROUP BY 1) i ON i.region = c.region
LEFT JOIN (SELECT region, SUM(unidades_recibidas) / NULLIF(SUM(unidades_pedidas), 0) AS fill_rate
           FROM ${A}.COMPRAS_MENSUALES WHERE mes = ${OCT} GROUP BY 1) f ON f.region = c.region
LEFT JOIN (SELECT region, SUM(venta_neta) AS venta_oct FROM ${A}.VENTAS_MENSUALES WHERE mes = ${OCT} GROUP BY 1) s ON s.region = c.region
WHERE {R:c.region} ORDER BY c.cedis_id`,

  red_abasto: `
SELECT cedis_origen, region_origen, cedis_destino, region_destino, distancia_km, horas_camion,
       excedente_origen_unidades AS excedente, quiebre_origen_pct,
       lat_origen::FLOAT AS lat_o, lon_origen::FLOAT AS lon_o, lat_destino::FLOAT AS lat_d, lon_destino::FLOAT AS lon_d
FROM ${A}.RED_ABASTO WHERE cedis_destino = ${f(CEDIS_FOCO)} AND ({R:region_origen} OR {R:region_destino})
ORDER BY distancia_km`,

  quejas: `
WITH e AS (
  SELECT estado, SUM(latitud * peso) / SUM(peso) AS lat, SUM(longitud * peso) / SUM(peso) AS lon
  FROM ${RAW}.CIUDADES GROUP BY 1)
SELECT v.estado, v.region, t.tema, COUNT(*) AS n, COUNT_IF(t.sentimiento = 'negative') AS negativos,
       ANY_VALUE(v.comentario) AS ejemplo, ANY_VALUE(e.lat) AS lat, ANY_VALUE(e.lon) AS lon
FROM ${A}.VOZ_CLIENTE v
JOIN ${A}.TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id
JOIN e ON e.estado = v.estado
WHERE v.mes = ${OCT} AND {R:v.region}
GROUP BY 1, 2, 3`,

  // ---------- Flujo de valor (Sankey) ----------
  // Una fila por región en cada etapa: el navegador filtra por región/categoría y re-agrega.
  sankey: `
WITH ven AS (
  SELECT region, categoria, SUM(venta_neta) AS venta
  FROM ${A}.VENTAS_MENSUALES WHERE mes = ${OCT} AND {R} GROUP BY 1, 2),
com AS (
  SELECT region, categoria, proveedor,
         RATIO_TO_REPORT(SUM(unidades_recibidas)) OVER (PARTITION BY region, categoria) AS share
  FROM ${A}.COMPRAS_MENSUALES WHERE mes = ${OCT} AND {R} GROUP BY 1, 2, 3),
prov AS (
  SELECT com.region, com.categoria, com.proveedor, r.cedis, ven.venta * com.share AS valor
  FROM com JOIN ven USING (region, categoria) JOIN ${RAW}.REGIONES r ON r.region = com.region),
top_prov AS (SELECT proveedor FROM prov GROUP BY 1 QUALIFY ROW_NUMBER() OVER (ORDER BY SUM(valor) DESC) <= 10)
SELECT 'proveedor' AS etapa, p.region, p.categoria, IFF(t.proveedor IS NULL, 'Otros proveedores', p.proveedor) AS origen, p.cedis AS destino, SUM(p.valor) AS valor
FROM prov p LEFT JOIN top_prov t ON t.proveedor = p.proveedor GROUP BY 1, 2, 3, 4, 5
UNION ALL
SELECT 'cedis', ven.region, ven.categoria, r.cedis, ven.categoria, SUM(ven.venta) FROM ven JOIN ${RAW}.REGIONES r USING (region) GROUP BY 1, 2, 3, 4, 5
UNION ALL
SELECT 'venta', region, categoria, categoria, 'Venta realizada', SUM(venta) FROM ven GROUP BY 1, 2, 3, 4, 5
UNION ALL
SELECT 'perdida', p.region, p.categoria, r.cedis, 'Venta perdida (quiebre)', SUM(p.venta_esperada - p.venta_real)
FROM ${A}.PRONOSTICO_MENSUAL p JOIN ${RAW}.REGIONES r ON r.region = p.region
WHERE p.mes = ${OCT} AND {R:p.region} GROUP BY 1, 2, 3, 4, 5 HAVING SUM(p.venta_esperada - p.venta_real) > 0`,

  // ---------- Salud operativa ----------
  // Numeradores y denominadores por mes y región: los velocímetros se recalculan con el filtro de región.
  salud: `
WITH c AS (
  SELECT mes, region, SUM(unidades_recibidas) AS recibidas, SUM(unidades_pedidas) AS pedidas,
         SUM(ordenes_perfectas) AS perfectas, SUM(ordenes) AS ordenes, SUM(retraso_total_dias) AS retraso_total,
         SUM(ordenes_recibidas) AS ordenes_recibidas
  FROM ${A}.COMPRAS_MENSUALES WHERE mes >= ${f(FECHAS.inicioSalud)} AND {R} GROUP BY 1, 2),
i AS (
  SELECT mes, region, SUM(dias_sku_quiebre) AS dias_quiebre, SUM(dias_sku) AS dias_sku,
         SUM(unidades_disponibles) AS disponibles, SUM(demanda_total) AS demanda
  FROM ${A}.INVENTARIO_MENSUAL WHERE mes >= ${f(FECHAS.inicioSalud)} AND {R} GROUP BY 1, 2),
f AS (
  SELECT mes, region, SUM(ABS(venta_real - venta_esperada)) AS error_abs, SUM(venta_esperada) AS esperada
  FROM ${A}.PRONOSTICO_MENSUAL WHERE venta_real IS NOT NULL AND {R} GROUP BY 1, 2)
SELECT c.*, i.dias_quiebre, i.dias_sku, i.disponibles, i.demanda, f.error_abs, f.esperada
FROM c JOIN i USING (mes, region) LEFT JOIN f USING (mes, region) ORDER BY c.mes`,

  // Numeradores y denominadores: el navegador re-agrega por CEDIS sumando, no promediando tasas
  capacidad: `
SELECT r.cedis, i.region, i.categoria,
       SUM(i.unidades_disponibles) AS disponibles, SUM(i.demanda_total) AS demanda,
       SUM(i.dias_sku_quiebre) AS dias_quiebre, SUM(i.dias_sku) AS dias_sku,
       SUM(i.unidades_disponibles) / NULLIF(SUM(i.demanda_total), 0) AS cobertura_dias,
       SUM(i.dias_sku_quiebre) / NULLIF(SUM(i.dias_sku), 0) AS quiebre
FROM ${A}.INVENTARIO_MENSUAL i JOIN ${RAW}.REGIONES r USING (region)
WHERE i.mes = ${OCT} AND {R:i.region}
GROUP BY 1, 2, 3 ORDER BY cobertura_dias`,

  proveedores: `
SELECT proveedor, categoria, region, SUM(ordenes) AS ordenes, SUM(ordenes_recibidas) AS ordenes_recibidas,
       SUM(unidades_recibidas) AS recibidas, SUM(unidades_pedidas) AS pedidas, SUM(retraso_total_dias) AS retraso_total
FROM ${A}.COMPRAS_MENSUALES WHERE mes = ${OCT} AND {R}
GROUP BY 1, 2, 3`,

  // ---------- Quiebres y venta perdida ----------
  causas: `
SELECT v.region, t.tema, t.sentimiento, COUNT(*) AS n
FROM ${A}.VOZ_CLIENTE v JOIN ${A}.TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id
WHERE v.mes = ${OCT} AND {R:v.region} GROUP BY 1, 2, 3`,

  quiebre_mensual: `
WITH i AS (
  SELECT mes, region, categoria, SUM(dias_sku_quiebre) AS dias_quiebre, SUM(dias_sku) AS dias_sku
  FROM ${A}.INVENTARIO_MENSUAL WHERE mes >= ${f(FECHAS.inicioAnio)} AND {R} GROUP BY 1, 2, 3),
p AS (
  SELECT mes, region, categoria, SUM(GREATEST(venta_esperada - venta_real, 0)) AS perdida
  FROM ${A}.PRONOSTICO_MENSUAL WHERE venta_real IS NOT NULL AND {R} GROUP BY 1, 2, 3)
SELECT i.mes, i.region, i.categoria, i.dias_quiebre, i.dias_sku, COALESCE(p.perdida, 0) AS perdida
FROM i LEFT JOIN p USING (mes, region, categoria) ORDER BY 1`,

  quiebre_region_cat: `
SELECT region, categoria, SUM(dias_sku_quiebre) / NULLIF(SUM(dias_sku), 0) AS quiebre
FROM ${A}.INVENTARIO_MENSUAL WHERE mes = ${OCT} AND {R} GROUP BY 1, 2`,

  // ---------- Tracker semanal ----------
  semanal: `
SELECT semana, region, categoria,
       SUM(dias_sku_quiebre) AS dias_quiebre, SUM(dias_sku) AS dias_sku, SUM(unidades_faltantes) AS faltante
FROM ${A}.INVENTARIO_SEMANAL
WHERE semana >= ${f(FECHAS.inicioTracker)} AND {R}
GROUP BY 1, 2, 3 ORDER BY 1`,

  distribucion: `
WITH d AS (
  SELECT region, categoria, producto_id, SUM(dias_quiebre) AS dias
  FROM ${A}.QUIEBRE_SKU_MENSUAL
  WHERE mes = ${OCT} AND {R} GROUP BY 1, 2, 3)
SELECT CASE WHEN dias = 0 THEN '0 días' WHEN dias <= 3 THEN '1–3' WHEN dias <= 7 THEN '4–7'
            WHEN dias <= 14 THEN '8–14' ELSE '15+' END AS rango,
       MIN(dias) AS orden, region, categoria, COUNT(*) AS skus
FROM d GROUP BY 1, 3, 4 ORDER BY 2`,

  // ---------- Pronóstico ----------
  pronostico_diario: `
SELECT b.region, b.ts::DATE AS dia, b.venta AS real, NULL AS esperada, NULL AS baja, NULL AS alta
FROM ${A}.BEBIDAS_DIARIAS b WHERE b.ts >= ${f(FECHAS.inicioPronosticoDiario)} AND {R:b.region}
UNION ALL
SELECT p.region, p.ts::DATE, NULL, p.venta_esperada, p.lower_bound, p.upper_bound
FROM ${A}.PRONOSTICO_DIARIO p WHERE {R:p.region}
ORDER BY 2`,

  pronostico_mensual: `
SELECT region, mes, venta_real, venta_esperada, esperada_baja, esperada_alta, venta_sin_accion
FROM ${A}.PRONOSTICO_MENSUAL WHERE {R} ORDER BY region, mes`,

  // ---------- Voz del cliente ----------
  // Agregado por mes, región, estado, comentario y calificación (~8 mil filas): todos los filtros corren en el navegador.
  voz: `
SELECT v.mes, v.region, v.estado, v.comentario, t.tema, t.sentimiento, v.calificacion, COUNT(*) AS n
FROM ${A}.VOZ_CLIENTE v JOIN ${A}.TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id
WHERE v.mes >= ${f(FECHAS.inicioAnio)} AND {R:v.region}
GROUP BY ALL`,

  // ---------- Llamadas del call center (03c) ----------
  // 13 llamadas: la lista viaja completa y se filtra en el navegador. La transcripción y el audio se piden
  // por llamada en /api/llamadas/<id> (no aquí), para no mandar 50 KB de texto que nadie abrió.
  llamadas: `
SELECT llamada_id, fecha, mes, region, estado, ciudad, tienda, agente, duracion_seg, categoria, urgencia,
       sentimiento, sentimiento_logistica, sentimiento_servicio, sentimiento_producto, producto_afectado, causa, folio, resumen
FROM ${A}.LLAMADAS_360 WHERE {R} ORDER BY fecha DESC, llamada_id DESC`,

  // ---------- Grafo ----------
  grafo: `
SELECT 'cedis_ciudad' AS tipo, r.cedis AS origen, g.ciudad AS destino, g.region,
       COUNT(DISTINCT g.tienda_id) AS peso,
       ROUND(100 * (SUM(IFF(g.mes = ${OCT}, g.venta_bebidas, 0)) / NULLIF(SUM(IFF(g.mes = ${SEP}, g.venta_bebidas, 0)), 0) - 1), 1) AS cambio
FROM ${A}.TIENDAS_GEO g JOIN ${RAW}.REGIONES r ON r.region = g.region
WHERE g.mes IN (${SEP}, ${OCT}) AND {R:g.region} GROUP BY 1, 2, 3, 4
UNION ALL
SELECT 'proveedor_cedis', c.proveedor, r.cedis, c.region, SUM(c.unidades_recibidas), 100 * (SUM(c.unidades_recibidas) / NULLIF(SUM(c.unidades_pedidas), 0) - 1)
FROM ${A}.COMPRAS_MENSUALES c JOIN ${RAW}.REGIONES r ON r.region = c.region
WHERE c.mes = ${OCT} AND {R:c.region} GROUP BY 1, 2, 3, 4
UNION ALL
SELECT 'tema_cedis', t.tema, r.cedis, v.region, COUNT(*), 100 * COUNT_IF(t.sentimiento = 'negative') / COUNT(*)
FROM ${A}.VOZ_CLIENTE v JOIN ${A}.TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id JOIN ${RAW}.REGIONES r ON r.region = v.region
WHERE v.mes = ${OCT} AND {R:v.region} GROUP BY 1, 2, 3, 4`,
};

/** Orden de presentación; las regiones reales vienen de RAW.REGIONES (ver ROLES_QUERY) */
export const REGIONES = ORDEN_REGIONES;

/** Roles de la demo y las regiones que ve cada uno: '*' de ACCESO_REGION se expande con RAW.REGIONES. */
export const ROLES_QUERY = `
SELECT a.rol, r.region FROM ${A}.ACCESO_REGION a
JOIN ${RAW}.REGIONES r ON a.region = '*' OR a.region = r.region
ORDER BY a.rol`;

/** Sustituye {R} por region IN (?, ...) y repite los binds en cada aparición. */
export function compile(sql: string, regiones: string[]): { sql: string; binds: string[] } {
  const binds: string[] = [];
  const marks = regiones.map(() => '?').join(', ') || 'NULL';
  const text = sql.replace(/\{R(?::([\w.]+))?\}/g, (_m, col?: string) => {
    binds.push(...regiones);
    return `${col ?? 'region'} IN (${marks})`;
  });
  return { sql: text, binds };
}
