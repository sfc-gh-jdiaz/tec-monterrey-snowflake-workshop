-- 02_dynamic_tables.sql · generado desde notebooks/02_dynamic_tables.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 02 · Dynamic Tables
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.ANALITICA;

-- [antes]
SHOW DYNAMIC TABLES IN SCHEMA TEC_DEMO.ANALITICA;

-- ======================================================================
-- Motor
-- ======================================================================

-- [dt_ventas_enriquecidas]
/* TARGET_LAG
   Lab / trial: '1 day' (los datos del kit están congelados; cada refresh despierta el warehouse y 1 min = ~1,440 refrescos/día).
   Demo en vivo del instructor (acto 1, "datos vivos"): sección "Demo: datos vivos" al final del notebook.
   CREATE OR ALTER: actualiza una versión anterior sin perder políticas ni permisos (columnas nuevas al final). */
CREATE OR ALTER DYNAMIC TABLE VENTAS_ENRIQUECIDAS TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT v.venta_id, v.fecha, DATE_TRUNC('month', v.fecha) AS mes,
       t.tienda_id, t.nombre AS tienda, t.region, t.estado, t.canal, t.contacto, t.telefono, t.email,
       p.categoria, p.sku, p.marca, v.cantidad, v.precio_unitario,
       v.cantidad * v.precio_unitario AS venta_neta,
       v.cantidad * (v.precio_unitario - v.costo_unitario) AS margen_bruto,
       v.promo_id IS NOT NULL AS en_promocion, v.forma_pago,
       t.ciudad, t.latitud, t.longitud  -- para la capa geográfica (TIENDAS_GEO)
FROM TEC_DEMO.RAW.VENTAS v JOIN TEC_DEMO.RAW.TIENDAS t USING (tienda_id) JOIN TEC_DEMO.RAW.PRODUCTOS p USING (producto_id);

-- [dt_ventas_mensuales]
-- Solo agregados aditivos (SUM/COUNT): refresco incremental y métricas correctas al re-agregar en la Semantic View
CREATE OR ALTER DYNAMIC TABLE VENTAS_MENSUALES TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT mes, region, estado, categoria, canal, marca, en_promocion,
       SUM(venta_neta) venta_neta, SUM(margen_bruto) margen_bruto, SUM(cantidad) unidades,
       COUNT(*) transacciones
FROM VENTAS_ENRIQUECIDAS GROUP BY ALL;

-- [dt_inventario]
-- SOLO numeradores y denominadores (aditivos): cualquier tasa se calcula SUM(numerador)/SUM(denominador) al consultar.
-- Guardar la tasa ya calculada invita a promediarla (promedio de razones = cifra incorrecta al re-agregar).
-- CREATE OR ALTER: si la tabla ya existe con otra definición la actualiza y CONSERVA sus políticas y permisos.
CREATE OR ALTER DYNAMIC TABLE INVENTARIO_MENSUAL TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT DATE_TRUNC('month', fecha) mes, region, categoria,
       SUM(unidades_disponibles) unidades_disponibles, SUM(demanda_diaria) demanda_total,
       SUM(IFF(en_quiebre,1,0)) dias_sku_quiebre, COUNT(*) dias_sku
FROM TEC_DEMO.RAW.INVENTARIO_DIARIO GROUP BY ALL;

-- [dt_inventario_semanal]
-- Agregados chicos para el tracker de la app: semanal por región/categoría (~500 filas) y días de quiebre por SKU y mes.
-- Así la app no recorre los 4.4 millones de filas de RAW.INVENTARIO_DIARIO en cada consulta.
CREATE OR ALTER DYNAMIC TABLE INVENTARIO_SEMANAL TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT DATE_TRUNC('week', fecha) semana, region, categoria,
       SUM(IFF(en_quiebre,1,0)) dias_sku_quiebre, COUNT(*) dias_sku,
       SUM(GREATEST(demanda_diaria - unidades_disponibles, 0)) unidades_faltantes
FROM TEC_DEMO.RAW.INVENTARIO_DIARIO GROUP BY ALL;

CREATE OR ALTER DYNAMIC TABLE QUIEBRE_SKU_MENSUAL TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT DATE_TRUNC('month', fecha) mes, region, categoria, producto_id, SUM(IFF(en_quiebre,1,0)) dias_quiebre
FROM TEC_DEMO.RAW.INVENTARIO_DIARIO GROUP BY ALL;

-- [dt_compras]
-- Solo aditivos. El retraso cuenta solo órdenes YA RECIBIDAS (una orden en tránsito no tiene retraso medible)
-- y una entrega adelantada cuenta como 0 días, no como retraso negativo que "compense" a otras.
-- (CREATE OR ALTER no reordena columnas: las agregadas en esta versión van al final)
CREATE OR ALTER DYNAMIC TABLE COMPRAS_MENSUALES TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT DATE_TRUNC('month', fecha_orden) mes, region, proveedor, categoria,
       COUNT(*) ordenes, SUM(unidades_pedidas) unidades_pedidas, SUM(unidades_recibidas) unidades_recibidas,
       SUM(GREATEST(DATEDIFF(day, fecha_prometida, fecha_recepcion), 0)) retraso_total_dias,
       SUM(IFF(fecha_recepcion<=fecha_prometida AND unidades_recibidas>=unidades_pedidas,1,0)) ordenes_perfectas,
       COUNT(fecha_recepcion) ordenes_recibidas
FROM TEC_DEMO.RAW.ORDENES_COMPRA GROUP BY ALL;

-- [dt_competencia]
-- Competencia y clima cambian poco: lag de 1 día.
-- Suma + conteo (no AVG): así el promedio es correcto al re-agregar por región, estado o trimestre.
-- Actividad del mes = la observada en más semanas (MAX_BY). MAX sobre texto devolvía la última en orden alfabético,
-- y MODE no se puede usar en una Dynamic Table con Row Access Policy (no admite change tracking).
-- (CREATE OR ALTER no reordena columnas: las agregadas en esta versión van al final)
CREATE OR ALTER DYNAMIC TABLE COMPETENCIA_MENSUAL TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
WITH c AS (
  SELECT DATE_TRUNC('month', semana) mes, region, estado, categoria, competidor, actividad_observada,
         COUNT(*) semanas, SUM(brecha_vs_propio) brecha_suma, COUNT(brecha_vs_propio) observaciones
  FROM TEC_DEMO.RAW.PRECIOS_COMPETENCIA GROUP BY ALL)
SELECT mes, region, estado, categoria, competidor,
       MAX_BY(actividad_observada, semanas) actividad_observada,
       SUM(brecha_suma) brecha_suma, SUM(observaciones) observaciones
FROM c GROUP BY ALL;

CREATE OR ALTER DYNAMIC TABLE CLIMA_MENSUAL TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT DATE_TRUNC('month', fecha) mes, region, estado,
       SUM(lluvia_mm) lluvia_total_mm, SUM(temp_max_c) temp_max_suma, COUNT(temp_max_c) dias_medidos
FROM TEC_DEMO.RAW.CLIMA GROUP BY ALL;

-- [dt_voz_cliente]
-- Voz del cliente gobernada: misma Row Access Policy que el resto (notebook 03) y sin email.
-- El agente la consulta vía la Semantic View, así cada persona ve solo los comentarios de su región.
-- comentario_id = HASH(comentario): llave numérica para unir con TEMAS_COMENTARIO sin comparar textos.
CREATE OR ALTER DYNAMIC TABLE VOZ_CLIENTE TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT feedback_id, fecha, DATE_TRUNC('month', fecha) mes, region, estado, canal, comentario, calificacion,
       HASH(comentario) comentario_id
FROM TEC_DEMO.RAW.FEEDBACK_CLIENTES;

-- [dt_tiendas_geo]
-- Capa geográfica: una fila por tienda × mes con coordenadas y celda H3 (resolución 7 ≈ 5 km², varias tiendas por hexágono)
-- Es la fuente de los mapas en 04b, de la app y del agente: puntos (lat/lon), hexágonos (h3_cell) y burbujas por ciudad.
-- Las coordenadas ya vienen en VENTAS_ENRIQUECIDAS: no hace falta volver a unir con RAW.TIENDAS.
CREATE OR ALTER DYNAMIC TABLE TIENDAS_GEO TARGET_LAG = '1 day' WAREHOUSE = TEC_WH AS
SELECT tienda_id, tienda, region, estado, ciudad, canal,
       latitud, longitud, H3_LATLNG_TO_CELL_STRING(latitud, longitud, 7) AS h3_cell,
       mes,
       SUM(venta_neta) AS venta_neta,
       SUM(IFF(categoria = 'Bebidas', venta_neta, 0)) AS venta_bebidas,
       SUM(IFF(categoria = 'Botanas', venta_neta, 0)) AS venta_botanas
FROM VENTAS_ENRIQUECIDAS
GROUP BY ALL;

-- ======================================================================
-- Después
-- ======================================================================

-- [despues]
SHOW DYNAMIC TABLES IN SCHEMA TEC_DEMO.ANALITICA;

-- [lectura]
SELECT region, ROUND(SUM(venta_neta)/1e6,1) venta_mdp FROM TEC_DEMO.ANALITICA.VENTAS_MENSUALES WHERE mes='2026-10-01' GROUP BY 1 ORDER BY 2 DESC;

-- ======================================================================
-- Demo: datos vivos (opcional, ~3 min)
-- ======================================================================
