-- 04b_mapas.sql · generado desde notebooks/04b_mapas.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 04b · Mapas: la caída se ve desde el espacio
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.ANALITICA;

-- ======================================================================
-- Mapa 0 · Calentamiento: los CEDIS
-- ======================================================================

-- [cedis]
SELECT cedis_id, nombre, region, latitud, longitud FROM TEC_DEMO.RAW.CEDIS ORDER BY cedis_id;

-- ======================================================================
-- Mapa 1 · ¿Dónde cayó Bebidas? (sep → oct 2026, por ciudad)
-- ======================================================================

-- [mapa_ciudades]
WITH s AS (
  SELECT * FROM SEMANTIC_VIEW(TEC_DEMO.ANALITICA.SV_COMERCIAL
    METRICS geo.latitud_centro, geo.longitud_centro, geo.num_tiendas, geo.venta_bebidas_tienda
    DIMENSIONS geo.ciudad, geo.geo_estado, geo.geo_region, geo.geo_mes
    WHERE geo.geo_mes IN ('2026-09-01', '2026-10-01')))
SELECT ciudad, geo_estado AS estado, geo_region AS region,
       AVG(latitud_centro) AS latitud, AVG(longitud_centro) AS longitud, MAX(num_tiendas) AS tiendas,
       ROUND(100 * (SUM(IFF(geo_mes = '2026-10-01', venta_bebidas_tienda, 0))
                  / NULLIF(SUM(IFF(geo_mes = '2026-09-01', venta_bebidas_tienda, 0)), 0) - 1), 1) AS cambio_bebidas_pct
FROM s GROUP BY ciudad, geo_estado, geo_region
ORDER BY cambio_bebidas_pct;

-- ======================================================================
-- Mapa 2 · Densidad de venta en hexágonos H3
-- ======================================================================

-- [mapa_hex]
WITH h AS (
  SELECT * FROM SEMANTIC_VIEW(TEC_DEMO.ANALITICA.SV_COMERCIAL
    METRICS geo.venta_tienda, geo.num_tiendas
    DIMENSIONS geo.h3_cell, geo.geo_region
    WHERE geo.geo_mes = '2026-10-01'))
SELECT h3_cell, geo_region AS region, ROUND(venta_tienda / 1e6, 2) AS venta_mdp, num_tiendas AS tiendas,
       ST_ASGEOJSON(H3_CELL_TO_BOUNDARY(h3_cell))::STRING AS geojson
FROM h ORDER BY venta_mdp DESC LIMIT 2000;

-- ======================================================================
-- Mapa 3 · La frontera del problema (hexágonos, centro del país)
-- ======================================================================

-- [mapa_hex_cambio]
WITH h AS (
  SELECT * FROM SEMANTIC_VIEW(TEC_DEMO.ANALITICA.SV_COMERCIAL
    METRICS geo.venta_bebidas_tienda, geo.num_tiendas
    DIMENSIONS geo.h3_cell, geo.geo_region, geo.geo_mes
    WHERE geo.geo_mes IN ('2026-09-01', '2026-10-01') AND geo.geo_region IN ('Bajío', 'Centro')))
SELECT h3_cell, geo_region AS region, MAX(num_tiendas) AS tiendas,
       ROUND(100 * (SUM(IFF(geo_mes = '2026-10-01', venta_bebidas_tienda, 0))
                  / NULLIF(SUM(IFF(geo_mes = '2026-09-01', venta_bebidas_tienda, 0)), 0) - 1), 1) AS cambio_bebidas_pct,
       ST_ASGEOJSON(H3_CELL_TO_BOUNDARY(h3_cell))::STRING AS geojson
FROM h GROUP BY h3_cell, geo_region
HAVING MAX(num_tiendas) >= 10;

-- ======================================================================
-- Mapa 4 · El mismo mapa como GERENTE_NORTE
-- ======================================================================

-- [geo_por_rol]
EXECUTE USING POLICY_CONTEXT(CURRENT_ROLE => 'GERENTE_NORTE',
    SNOWFLAKE$SESSION_ACTIVATED_ROLES => ('GERENTE_NORTE'))
  AS SELECT region, COUNT(DISTINCT tienda_id) AS tiendas_visibles, ROUND(AVG(latitud), 2) AS lat_media
     FROM TEC_DEMO.ANALITICA.TIENDAS_GEO WHERE mes = '2026-10-01' GROUP BY region ORDER BY region;

-- [competidores_cerca]
-- Requiere el listing Overture Maps - Places (CARTO). Descomentar después de instalarlo.
-- WITH peores AS (
--   SELECT tienda_id, tienda, latitud, longitud FROM TEC_DEMO.ANALITICA.TIENDAS_GEO
--   WHERE region = 'Bajío' AND ciudad = 'León' AND mes = '2026-10-01' ORDER BY venta_bebidas LIMIT 20)
-- SELECT p.tienda, pl.names:primary::STRING AS competidor, pl.categories:primary::STRING AS categoria,
--        ST_Y(pl.geometry) AS latitud, ST_X(pl.geometry) AS longitud,
--        ROUND(ST_DISTANCE(pl.geometry, ST_MAKEPOINT(p.longitud, p.latitud))) AS distancia_m
-- FROM peores p JOIN OVERTURE_MAPS__PLACES.CARTO.PLACE pl
--   ON ST_DWITHIN(pl.geometry, ST_MAKEPOINT(p.longitud, p.latitud), 1000)
-- WHERE pl.categories:primary::STRING IN ('supermarket', 'convenience_store', 'grocery_store')
-- ORDER BY p.tienda, distancia_m LIMIT 200;
SELECT 'Opcional: instala Overture Maps - Places y descomenta' AS nota;
