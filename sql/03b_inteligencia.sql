-- 03b_inteligencia.sql · generado desde notebooks/03b_inteligencia.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 03b · Inteligencia: IA en texto, pronóstico y red de abasto
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda). Lo caro (IA en vivo, entrenamiento y pronóstico) usa IF NOT EXISTS: re-ejecutar
-- no repite ese costo; las tablas derivadas sí se recalculan (CREATE OR REPLACE) para reflejar los datos actuales.
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.ANALITICA;

-- Fechas de la historia en UN solo lugar (la app usa los mismos valores en lib/constants.ts)
CREATE OR REPLACE TABLE TEC_DEMO.ANALITICA.PARAMETROS (parametro STRING, valor DATE, descripcion STRING) AS
SELECT * FROM VALUES
  ('corte_entrenamiento', '2026-09-30'::DATE, 'Último día con el que se entrena el pronóstico (antes del quiebre)'),
  ('mes_analisis',        '2026-10-01'::DATE, 'Mes de la caída de Bebidas en el Bajío'),
  ('mes_pronostico',      '2026-11-01'::DATE, 'Mes del escenario "si no actuamos"'),
  ('inicio_pronostico',   '2026-05-01'::DATE, 'Primer mes de la comparación real vs esperado'),
  ('fecha_inventario',    '2026-10-31'::DATE, 'Foto de inventario para calcular excedentes de la red de abasto');
SET (corte_entrenamiento, mes_analisis, mes_pronostico, inicio_pronostico, fecha_inventario) = (
  SELECT MAX(IFF(parametro = 'corte_entrenamiento', valor, NULL)), MAX(IFF(parametro = 'mes_analisis', valor, NULL)),
         MAX(IFF(parametro = 'mes_pronostico', valor, NULL)), MAX(IFF(parametro = 'inicio_pronostico', valor, NULL)),
         MAX(IFF(parametro = 'fecha_inventario', valor, NULL))
  FROM TEC_DEMO.ANALITICA.PARAMETROS);

-- ======================================================================
-- Parte 1 · IA sobre 60 mil comentarios
-- ======================================================================

-- [temas_comentario]
-- 1) EN VIVO: la IA clasifica los 16 textos distintos (centavos de crédito)
CREATE TABLE IF NOT EXISTS TEMAS_COMENTARIO_EN_VIVO AS
SELECT comentario,
  AI_CLASSIFY(comentario, ['Desabasto de producto', 'Entrega y logística', 'Precio y competencia', 'Surtido y variedad',
                           'Atención y servicio', 'Crédito y pagos', 'Producto y promoción'],
              {'task_description': 'Clasifica el comentario de un tendero mexicano sobre su distribuidor de abarrotes'}):labels[0]::STRING AS tema,
  AI_SENTIMENT(comentario):categories[0]:sentiment::STRING AS sentimiento
FROM (SELECT DISTINCT comentario FROM TEC_DEMO.RAW.FEEDBACK_CLIENTES);

-- 2) OFICIAL: la misma clasificación congelada en el kit (un LLM puede variar entre cuentas; así todos ven las mismas cifras)
--    comentario_id = HASH(comentario): la misma llave que VOZ_CLIENTE, para unir por número y no por texto.
CREATE TABLE IF NOT EXISTS TEMAS_COMENTARIO (comentario STRING, tema STRING, sentimiento STRING, comentario_id NUMBER);
ALTER TABLE TEMAS_COMENTARIO ADD COLUMN IF NOT EXISTS comentario_id NUMBER;  -- instalaciones anteriores
CALL TEC_DEMO.RAW.CARGAR_CSV('TEMAS_COMENTARIO');  -- carpeta y huella: TEC_DEMO.RAW.HUELLA_CARGA
UPDATE TEMAS_COMENTARIO SET comentario_id = HASH(comentario) WHERE comentario_id IS NULL;

-- 3) ¿Coincide tu IA con la oficial?
SELECT o.tema AS tema_oficial, v.tema AS tema_en_vivo, o.sentimiento, IFF(o.tema = v.tema, '✓', '≠') AS coincide, o.comentario
FROM TEMAS_COMENTARIO o LEFT JOIN TEMAS_COMENTARIO_EN_VIVO v USING (comentario)
ORDER BY coincide DESC, tema_oficial;

-- [quejas_por_tema]
SELECT t.tema, COUNT(*) AS quejas, ROUND(AVG(v.calificacion), 2) AS calificacion_promedio
FROM VOZ_CLIENTE v JOIN TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id  -- llave numérica, no el texto
WHERE v.region = 'Bajío' AND v.mes = '2026-10-01' AND v.calificacion <= 2
GROUP BY t.tema ORDER BY quejas DESC;

-- [resumen_quejas]
-- AI_AGG lee TODAS las filas del grupo (no una muestra) y escribe un resumen. Respeta la Row Access Policy de VOZ_CLIENTE
SELECT AI_AGG(comentario, 'Eres analista comercial. Resume en 3 viñetas cortas, en español, qué problema reportan estos tenderos y qué piden. Cierra con una recomendación de una línea.') AS resumen
FROM VOZ_CLIENTE
WHERE region = 'Bajío' AND mes = '2026-10-01' AND calificacion <= 2;

-- [resumen_norte]
-- La IA solo resume lo que el rol puede ver: el gerente del Norte no obtiene nada del Bajío
EXECUTE USING POLICY_CONTEXT(CURRENT_ROLE => 'GERENTE_NORTE')
  AS SELECT COUNT(*) AS comentarios_visibles,
            IFF(COUNT(*) = 0, 'Sin comentarios visibles para este rol', 'Hay comentarios visibles') AS resultado
     FROM TEC_DEMO.ANALITICA.VOZ_CLIENTE
     WHERE region = 'Bajío' AND mes = '2026-10-01' AND calificacion <= 2;

-- ======================================================================
-- Parte 2 · ¿Cuánto vamos a perder si no hacemos nada?
-- ======================================================================

-- [bebidas_diarias]
-- Serie diaria de Bebidas por región. CREATE OR REPLACE: si recargas los datos, se recalcula (la celda gobierno_nuevas
-- le vuelve a poner la Row Access Policy y el permiso). El modelo de abajo NO se reentrena (IF NOT EXISTS).
CREATE OR REPLACE TABLE BEBIDAS_DIARIAS AS
SELECT region, fecha::TIMESTAMP_NTZ AS ts, SUM(venta_neta) AS venta
FROM VENTAS_ENRIQUECIDAS WHERE categoria = 'Bebidas'
GROUP BY region, fecha;
-- Entrenar (~1 min la primera vez). Solo datos hasta el 30-sep: el modelo no "sabe" del quiebre
CREATE SNOWFLAKE.ML.FORECAST IF NOT EXISTS MODELO_BEBIDAS(
  INPUT_DATA => TABLE(SELECT region, ts, venta FROM BEBIDAS_DIARIAS WHERE ts <= (SELECT valor FROM TEC_DEMO.ANALITICA.PARAMETROS WHERE parametro = 'corte_entrenamiento')),
  SERIES_COLNAME => 'region', TIMESTAMP_COLNAME => 'ts', TARGET_COLNAME => 'venta');

-- [pronostico]
-- 1) EN VIVO: tu modelo pronostica oct–nov 2026. Se lee como función de tabla (sin depender de LAST_QUERY_ID)
--    e IF NOT EXISTS: re-ejecutar no vuelve a pagar el pronóstico.
CREATE TABLE IF NOT EXISTS PRONOSTICO_DIARIO_EN_VIVO AS
SELECT series::STRING AS region, ts, forecast AS venta_esperada, lower_bound, upper_bound
FROM TABLE(MODELO_BEBIDAS!FORECAST(FORECASTING_PERIODS => 61, CONFIG_OBJECT => {'prediction_interval': 0.9}));

-- 2) OFICIAL: el pronóstico congelado en el kit (el entrenamiento puede variar ligeramente entre cuentas)
CREATE TABLE IF NOT EXISTS PRONOSTICO_DIARIO (region STRING, ts TIMESTAMP_NTZ, venta_esperada FLOAT, lower_bound FLOAT, upper_bound FLOAT);
CALL TEC_DEMO.RAW.CARGAR_CSV('PRONOSTICO_DIARIO');  -- carpeta y huella: TEC_DEMO.RAW.HUELLA_CARGA

-- 3) Tu modelo vs el oficial: venta esperada de octubre por región (M MXN)
SELECT o.region, ROUND(SUM(o.venta_esperada) / 1e6, 2) AS oficial_mdp, ROUND(SUM(v.venta_esperada) / 1e6, 2) AS en_vivo_mdp,
       ROUND(100 * (SUM(v.venta_esperada) / SUM(o.venta_esperada) - 1), 1) AS diferencia_pct
FROM PRONOSTICO_DIARIO o LEFT JOIN PRONOSTICO_DIARIO_EN_VIVO v ON v.region = o.region AND v.ts = o.ts
WHERE o.ts < '2026-11-01' GROUP BY o.region ORDER BY o.region;

-- [pronostico_mensual]
-- Real vs esperado por mes y región. Noviembre: esperado (sin quiebre) y escenario "sin acción" (mismo % de pérdida que octubre)
-- CREATE OR REPLACE: se recalcula si cambian BEBIDAS_DIARIAS o el pronóstico oficial.
-- LEFT JOIN: una región sin dato de octubre se conserva (con venta_sin_accion nula) en vez de desaparecer.
CREATE OR REPLACE TABLE PRONOSTICO_MENSUAL AS
WITH r AS (SELECT region, DATE_TRUNC('month', ts)::DATE AS mes, SUM(venta) AS venta_real FROM BEBIDAS_DIARIAS
           WHERE ts >= $inicio_pronostico GROUP BY 1, 2),
     e AS (SELECT region, DATE_TRUNC('month', ts)::DATE AS mes, SUM(venta_esperada) AS venta_esperada,
                  SUM(lower_bound) AS esperada_baja, SUM(upper_bound) AS esperada_alta FROM PRONOSTICO_DIARIO GROUP BY 1, 2),
     m AS (SELECT COALESCE(r.region, e.region) AS region, COALESCE(r.mes, e.mes) AS mes, 'Bebidas' AS categoria,
                  r.venta_real, e.venta_esperada, e.esperada_baja, e.esperada_alta
           FROM r FULL OUTER JOIN e ON r.region = e.region AND r.mes = e.mes),
     f AS (SELECT region, venta_real / NULLIF(venta_esperada, 0) AS factor_oct FROM m WHERE mes = $mes_analisis)
SELECT m.*, IFF(m.mes = $mes_pronostico, ROUND(m.venta_esperada * LEAST(f.factor_oct, 1), 0), NULL) AS venta_sin_accion
FROM m LEFT JOIN f USING (region);
SELECT * FROM PRONOSTICO_MENSUAL WHERE region = 'Bajío' ORDER BY mes;

-- [gobierno_nuevas]
-- Misma regla por región en TODAS las tablas derivadas que traen región (DROP ALL + ADD: idempotente)
ALTER TABLE PRONOSTICO_MENSUAL DROP ALL ROW ACCESS POLICIES;
ALTER TABLE PRONOSTICO_MENSUAL ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER TABLE BEBIDAS_DIARIAS DROP ALL ROW ACCESS POLICIES;
ALTER TABLE BEBIDAS_DIARIAS ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER TABLE PRONOSTICO_DIARIO DROP ALL ROW ACCESS POLICIES;
ALTER TABLE PRONOSTICO_DIARIO ADD ROW ACCESS POLICY RAP_REGION ON (region);
-- TEMAS_COMENTARIO no lleva política: es el catálogo de los 16 textos con su tema (no tiene región ni datos de tiendas);
-- la región vive en VOZ_CLIENTE, que ya tiene RAP_REGION.
GRANT SELECT ON TABLE PRONOSTICO_MENSUAL TO ROLE LECTOR_COMERCIAL;
GRANT SELECT ON TABLE BEBIDAS_DIARIAS TO ROLE LECTOR_COMERCIAL;
GRANT SELECT ON TABLE PRONOSTICO_DIARIO TO ROLE LECTOR_COMERCIAL;
GRANT SELECT ON TABLE TEMAS_COMENTARIO TO ROLE LECTOR_COMERCIAL;

-- ======================================================================
-- Parte 3 · ¿Desde qué CEDIS surtimos a León?
-- ======================================================================

-- [red_abasto]
-- CREATE OR REPLACE: se recalcula si recargas inventario o CEDIS (abajo se vuelven a poner política y permiso)
CREATE OR REPLACE TABLE RED_ABASTO AS
WITH inv AS (
  SELECT cedis_id, SUM(GREATEST(unidades_disponibles - demanda_diaria * 7, 0)) AS excedente_bebidas_unidades,
         ROUND(AVG(IFF(en_quiebre, 1, 0)) * 100, 1) AS quiebre_pct
  FROM TEC_DEMO.RAW.INVENTARIO_DIARIO WHERE categoria = 'Bebidas' AND fecha = $fecha_inventario GROUP BY cedis_id)
SELECT o.nombre AS cedis_origen, o.region AS region_origen, d.nombre AS cedis_destino, d.region AS region_destino,
       ROUND(ST_DISTANCE(o.geo, d.geo) / 1000) AS distancia_km,
       ROUND(ST_DISTANCE(o.geo, d.geo) / 1000 * 1.25 / 65, 1) AS horas_camion,
       io.excedente_bebidas_unidades AS excedente_origen_unidades, io.quiebre_pct AS quiebre_origen_pct,
       o.latitud AS lat_origen, o.longitud AS lon_origen, d.latitud AS lat_destino, d.longitud AS lon_destino
FROM TEC_DEMO.RAW.CEDIS o JOIN TEC_DEMO.RAW.CEDIS d ON o.cedis_id <> d.cedis_id
JOIN inv io ON io.cedis_id = o.cedis_id;
-- Cada gerente ve las rutas que SURTEN a su región (region_destino): el Bajío ve qué CEDIS le pueden mandar a León.
ALTER TABLE RED_ABASTO DROP ALL ROW ACCESS POLICIES;
ALTER TABLE RED_ABASTO ADD ROW ACCESS POLICY RAP_REGION ON (region_destino);
GRANT SELECT ON TABLE RED_ABASTO TO ROLE LECTOR_COMERCIAL;
-- Opciones para surtir al CEDIS León (el mapa de abajo usa este resultado)
SELECT * FROM RED_ABASTO WHERE cedis_destino = 'CEDIS León' ORDER BY distancia_km;
