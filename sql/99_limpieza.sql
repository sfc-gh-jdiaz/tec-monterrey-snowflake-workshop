-- 99_limpieza.sql · generado desde notebooks/99_limpieza.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 99 · Limpieza
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4).
-- Usamos la base SNOWFLAKE para que funcione aunque TEC_DEMO ya esté borrada.
USE DATABASE SNOWFLAKE;
USE SCHEMA SNOWFLAKE.INFORMATION_SCHEMA;
USE WAREHOUSE TEC_WH;

-- [antes]
SHOW DATABASES LIKE 'TEC_DEMO';

-- [pausar]
-- 0) Opción sin borrar: dejar todo instalado pero sin consumir créditos (lo puedes reactivar con RESUME)
-- USE ROLE TEC_ADMIN;
-- EXECUTE IMMEDIATE $$
-- BEGIN
--   SHOW DYNAMIC TABLES IN SCHEMA TEC_DEMO.ANALITICA;
--   LET c CURSOR FOR SELECT "name" n FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) WHERE "scheduling_state" <> 'SUSPENDED';
--   FOR t IN c DO
--     LET dt STRING := 'TEC_DEMO.ANALITICA.' || t.n;
--     ALTER DYNAMIC TABLE IDENTIFIER(:dt) SUSPEND;
--   END FOR;
--   SHOW CORTEX SEARCH SERVICES IN SCHEMA TEC_DEMO.AGENTES;
--   LET s CURSOR FOR SELECT "name" n FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
--   FOR x IN s DO
--     LET svc STRING := 'TEC_DEMO.AGENTES.' || x.n;
--     ALTER CORTEX SEARCH SERVICE IDENTIFIER(:svc) SUSPEND INDEXING;
--   END FOR;
--   ALTER TASK IF EXISTS TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK SUSPEND;
--   ALTER ALERT IF EXISTS TEC_DEMO.AGENTES.ALERTA_QUIEBRE SUSPEND;
--   ALTER WAREHOUSE TEC_WH SUSPEND;
--   RETURN 'Todo pausado';
-- END;
-- $$;
SELECT 'Descomenta para pausar' AS nota;

-- [usar_accountadmin]
-- 1) ACCOUNTADMIN: despublicar el agente, revocar privilegios de cuenta y limpiar el reto 08
-- USE ROLE ACCOUNTADMIN;
-- ALTER SNOWFLAKE INTELLIGENCE SNOWFLAKE_INTELLIGENCE_OBJECT_DEFAULT DROP AGENT TEC_DEMO.AGENTES.AGENTE_COMERCIAL;
-- REVOKE EXECUTE AGENT TASK ON ACCOUNT FROM ROLE PUBLIC;   -- CoWork Automations (06_agente)
-- Reto 08 (si lo hiciste):
-- DROP TASK IF EXISTS TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK;
-- DROP ALERT IF EXISTS TEC_DEMO.AGENTES.ALERTA_QUIEBRE;
-- DROP AGENT IF EXISTS TEC_DEMO.AGENTES.AGENTE_ABASTO;
-- DROP INTEGRATION IF EXISTS TELEGRAM_EAI;
-- REVOKE EXECUTE ALERT ON ACCOUNT FROM ROLE TEC_ADMIN;
-- REVOKE EXECUTE TASK ON ACCOUNT FROM ROLE TEC_ADMIN;
-- Sin borrar nada: ALTER TASK TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK SUSPEND; y ALTER ALERT TEC_DEMO.AGENTES.ALERTA_QUIEBRE SUSPEND;
SELECT 'Descomenta para limpiar' AS nota;

-- [usar_rol]
-- 2) TEC_ADMIN: app, base de datos y warehouse. DROP DATABASE borra también lo que vive dentro de TEC_DEMO:
--    Dynamic Tables, Semantic View, agente, los 7 servicios de Cortex Search, los stages DATOS_CSV y AUDIOS (13 mp3), las tablas del call center, modelo de pronóstico, políticas, DMF,
--    procedimientos, task, alerta, secreto y regla de red de Telegram.
-- USE ROLE TEC_ADMIN;
-- DROP APPLICATION SERVICE IF EXISTS TEC_DEMO.APPS.ABARROTERA_360;   -- la app (antes de la base para liberar su cómputo)
-- DROP DATABASE IF EXISTS TEC_DEMO;
-- DROP WAREHOUSE IF EXISTS TEC_WH;
SELECT 'Descomenta para limpiar' AS nota;

-- [usar_accountadmin_2]
-- 3) ACCOUNTADMIN: privilegios de cuenta, usuarios persona y roles (LECTOR_COMERCIAL al final de los de negocio)
-- USE ROLE ACCOUNTADMIN;
-- DROP COMPUTE POOL IF EXISTS TEC_POOL;               -- solo si creaste uno para una versión anterior de la app
-- REVOKE EXECUTE DATA METRIC FUNCTION ON ACCOUNT FROM ROLE TEC_ADMIN;
-- REVOKE DATABASE ROLE SNOWFLAKE.DATA_METRIC_USER FROM ROLE TEC_ADMIN;
-- DROP USER IF EXISTS GERENTE_BAJIO_USR;
-- DROP USER IF EXISTS GERENTE_NORTE_USR;
-- DROP USER IF EXISTS DIRECTOR_USR;
-- DROP ROLE IF EXISTS DIRECTOR_COMERCIAL;
-- DROP ROLE IF EXISTS GERENTE_NORTE;
-- DROP ROLE IF EXISTS GERENTE_BAJIO;
-- DROP ROLE IF EXISTS LECTOR_COMERCIAL;
-- DROP ROLE IF EXISTS TEC_ADMIN;
SELECT 'Descomenta para limpiar' AS nota;
