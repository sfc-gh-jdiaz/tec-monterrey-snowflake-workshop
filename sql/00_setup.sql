-- 00_setup.sql · generado desde notebooks/00_setup.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 00 · Setup de la cuenta
-- ======================================================================

-- [ctx_inicial]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4).
-- TEC_DEMO todavía no existe: usamos la base SNOWFLAKE, que existe en toda cuenta.
USE DATABASE SNOWFLAKE;
USE SCHEMA SNOWFLAKE.INFORMATION_SCHEMA;

-- [antes]
SELECT CURRENT_USER() usuario, CURRENT_ROLE() rol, CURRENT_ACCOUNT() cuenta, CURRENT_REGION() region;

-- ======================================================================
-- Motor
-- ======================================================================

-- [usar_accountadmin]
USE ROLE ACCOUNTADMIN;
-- Modelos de otra región si la tuya no los tiene
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';

CREATE ROLE IF NOT EXISTS TEC_ADMIN;
GRANT ROLE TEC_ADMIN TO ROLE ACCOUNTADMIN;
SET me = CURRENT_USER();
GRANT ROLE TEC_ADMIN TO USER IDENTIFIER($me);
-- CREATE USER: para los usuarios "persona" del acto 2 (el agente usa el DEFAULT_ROLE del usuario)
GRANT CREATE DATABASE, CREATE WAREHOUSE, CREATE ROLE, CREATE USER ON ACCOUNT TO ROLE TEC_ADMIN;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE TEC_ADMIN;
-- Calidad de datos (03_gobierno): ejecutar Data Metric Functions y usar las del sistema (NULL_COUNT, DUPLICATE_COUNT...)
GRANT EXECUTE DATA METRIC FUNCTION ON ACCOUNT TO ROLE TEC_ADMIN;
GRANT DATABASE ROLE SNOWFLAKE.DATA_METRIC_USER TO ROLE TEC_ADMIN;

-- [usar_rol]
USE ROLE TEC_ADMIN;
-- MEDIUM solo para generar datos (notebook 01_datos). Al terminar, 01_datos lo regresa a XSMALL.
CREATE WAREHOUSE IF NOT EXISTS TEC_WH WAREHOUSE_SIZE='MEDIUM' AUTO_SUSPEND=60 AUTO_RESUME=TRUE INITIALLY_SUSPENDED=TRUE;
CREATE DATABASE IF NOT EXISTS TEC_DEMO;
CREATE SCHEMA IF NOT EXISTS TEC_DEMO.RAW;
CREATE SCHEMA IF NOT EXISTS TEC_DEMO.ANALITICA;
CREATE SCHEMA IF NOT EXISTS TEC_DEMO.AGENTES;
CREATE SCHEMA IF NOT EXISTS TEC_DEMO.APPS COMMENT = 'Snowflake Apps del workshop (Abarrotera 360)';
-- A partir de aquí TEC_DEMO existe: cambiamos el contexto
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.RAW;
USE WAREHOUSE TEC_WH;

-- ======================================================================
-- Después
-- ======================================================================

-- [despues]
SHOW SCHEMAS IN DATABASE TEC_DEMO;
