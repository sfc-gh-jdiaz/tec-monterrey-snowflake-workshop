-- 07_reto_coco.sql · generado desde notebooks/07_reto_coco.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 07 · Reto CoCo: arregla una fuga de datos con un agente
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.ANALITICA;

-- ======================================================================
-- 1 · Sembrar la falla
-- ======================================================================

-- [sembrar_falla]
ALTER ROW ACCESS POLICY TEC_DEMO.ANALITICA.RAP_REGION SET BODY ->
  IS_ROLE_IN_SESSION('DIRECTOR_COMERCIAL') OR IS_ROLE_IN_SESSION('TEC_ADMIN')
  OR EXISTS (SELECT 1 FROM TEC_DEMO.ANALITICA.ACCESO_REGION a WHERE a.region = r AND IS_ROLE_IN_SESSION(a.rol));

-- ======================================================================
-- 2 · Antes: comprobar la fuga
-- ======================================================================

-- [antes]
EXECUTE USING POLICY_CONTEXT(CURRENT_ROLE => 'GERENTE_BAJIO',
    SNOWFLAKE$SESSION_ACTIVATED_ROLES => ('GERENTE_BAJIO','DIRECTOR_COMERCIAL'))
  AS SELECT COUNT(DISTINCT region) AS regiones_visibles, LISTAGG(DISTINCT region, ', ') AS regiones
     FROM TEC_DEMO.ANALITICA.VENTAS_MENSUALES;

-- ======================================================================
-- 3 · Pídele a CoCo que la corrija
-- ======================================================================

-- ======================================================================
-- 4 · Validación PASS / FAIL
-- ======================================================================

-- ======================================================================
-- Respaldo del instructor
-- ======================================================================

-- [solucion_respaldo]
-- ALTER ROW ACCESS POLICY TEC_DEMO.ANALITICA.RAP_REGION SET BODY ->
--   EXISTS (SELECT 1 FROM TEC_DEMO.ANALITICA.ACCESO_REGION a
--           WHERE a.rol = CURRENT_ROLE() AND (a.region = '*' OR a.region = r));

-- ======================================================================
-- Lectura
-- ======================================================================
