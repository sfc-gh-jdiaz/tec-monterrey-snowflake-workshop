-- 03_gobierno.sql · generado desde notebooks/03_gobierno.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 03 · Gobierno: roles, Row Access Policy y masking
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.ANALITICA;

-- [antes]
SELECT COUNT(DISTINCT region) regiones_visibles_hoy FROM TEC_DEMO.ANALITICA.VENTAS_MENSUALES;

-- ======================================================================
-- Motor
-- ======================================================================

-- [usar_accountadmin]
-- RBAC: roles de negocio (ACCOUNTADMIN: funciona aunque los roles ya existan de otra corrida)
USE ROLE ACCOUNTADMIN;
CREATE ROLE IF NOT EXISTS DIRECTOR_COMERCIAL;
CREATE ROLE IF NOT EXISTS GERENTE_NORTE;
CREATE ROLE IF NOT EXISTS GERENTE_BAJIO;
-- Rol FUNCIONAL: todos los permisos de lectura del taller se otorgan una sola vez a LECTOR_COMERCIAL,
-- y los 3 roles de negocio lo heredan. Para un rol nuevo basta GRANT ROLE LECTOR_COMERCIAL (+ su fila en ACCESO_REGION).
-- La Row Access Policy sigue evaluando el rol de negocio activo (CURRENT_ROLE), no LECTOR_COMERCIAL.
CREATE ROLE IF NOT EXISTS LECTOR_COMERCIAL COMMENT = 'Permisos de lectura del workshop Tec; lo heredan los roles de negocio';
GRANT ROLE LECTOR_COMERCIAL TO ROLE DIRECTOR_COMERCIAL;
GRANT ROLE LECTOR_COMERCIAL TO ROLE GERENTE_NORTE;
GRANT ROLE LECTOR_COMERCIAL TO ROLE GERENTE_BAJIO;
-- El instructor suele abrir la app y el agente con ACCOUNTADMIN (su rol por defecto): necesita los mismos permisos de lectura
GRANT ROLE LECTOR_COMERCIAL TO ROLE ACCOUNTADMIN;
-- Te asignas los 3 roles para poder probarlos
SET me = CURRENT_USER();
GRANT ROLE DIRECTOR_COMERCIAL TO USER IDENTIFIER($me);
GRANT ROLE GERENTE_NORTE TO USER IDENTIFIER($me);
GRANT ROLE GERENTE_BAJIO TO USER IDENTIFIER($me);
USE ROLE TEC_ADMIN;

-- [tabla_acceso]
-- Mapeo rol -> región ('*' = todas). Es la ÚNICA fuente de verdad del acceso por región.
CREATE TABLE IF NOT EXISTS ACCESO_REGION (rol STRING, region STRING) AS
SELECT * FROM VALUES ('GERENTE_NORTE','Norte'), ('GERENTE_BAJIO','Bajío'), ('DIRECTOR_COMERCIAL','*'), ('TEC_ADMIN','*');
-- ACCOUNTADMIN ve todo: la app corre con el rol por defecto de quien la abre y el instructor suele entrar con ACCOUNTADMIN.
-- (MERGE: se agrega aunque la tabla ya exista de una corrida anterior)
MERGE INTO ACCESO_REGION a USING (SELECT 'ACCOUNTADMIN' rol, '*' region) s ON a.rol = s.rol
  WHEN NOT MATCHED THEN INSERT (rol, region) VALUES (s.rol, s.region);

/* Row Access Policy: cada rol ve solo lo que dice ACCESO_REGION para su rol ACTIVO.
   - CURRENT_ROLE() y no IS_ROLE_IN_SESSION(): con roles secundarios (DEFAULT_SECONDARY_ROLES = ALL,
     el default en cuentas nuevas) IS_ROLE_IN_SESSION también es TRUE para los roles secundarios y un
     gerente que además tenga el rol de director vería todas las regiones.
   - Fail-closed: un rol que no está en la tabla no ve nada.
   - Jerarquía de roles: un rol HIJO de GERENTE_BAJIO no hereda su región (CURRENT_ROLE es el rol activo, no sus
     padres). Es una decisión consciente para proteger contra los roles secundarios: si un rol nuevo necesita
     acceso, se da de alta como fila propia en ACCESO_REGION (INSERT INTO ACCESO_REGION VALUES ('MI_ROL','Bajío')).
   IF NOT EXISTS + SET BODY: se puede re-ejecutar aunque la policy ya esté adjunta a las tablas. */
CREATE ROW ACCESS POLICY IF NOT EXISTS RAP_REGION AS (r STRING) RETURNS BOOLEAN -> TRUE;
ALTER ROW ACCESS POLICY RAP_REGION SET BODY ->
  EXISTS (SELECT 1 FROM ACCESO_REGION a
          WHERE a.rol = CURRENT_ROLE() AND (a.region = '*' OR a.region = r));

-- Masking: PII completa solo para el director (rol activo). Los demás ven un enmascaramiento PARCIAL que conserva
-- el formato útil sin exponer a la persona: correo → dominio, teléfono → últimos 4 dígitos, nombre → iniciales.
CREATE MASKING POLICY IF NOT EXISTS MASK_PII AS (v STRING) RETURNS STRING -> v;
ALTER MASKING POLICY MASK_PII SET BODY ->
  CASE WHEN CURRENT_ROLE() = 'DIRECTOR_COMERCIAL' OR v IS NULL THEN v
       WHEN CONTAINS(v, '@') THEN '****' || SUBSTR(v, POSITION('@' IN v))
       WHEN REGEXP_LIKE(v, '[0-9 ()+.-]{7,}') THEN REGEXP_REPLACE(LEFT(v, LENGTH(v) - 4), '[0-9]', '*') || RIGHT(v, 4)
       ELSE REGEXP_REPLACE(v, '(\\S)\\S*', '\\1.') END;

-- [rap_drop_enriquecidas]
-- Row Access Policy en las 10 Dynamic Tables (DROP ALL + ADD: idempotente)
ALTER DYNAMIC TABLE VENTAS_ENRIQUECIDAS DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE VENTAS_ENRIQUECIDAS ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER DYNAMIC TABLE VENTAS_MENSUALES DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE VENTAS_MENSUALES ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER DYNAMIC TABLE INVENTARIO_MENSUAL DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE INVENTARIO_MENSUAL ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER DYNAMIC TABLE COMPRAS_MENSUALES DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE COMPRAS_MENSUALES ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER DYNAMIC TABLE COMPETENCIA_MENSUAL DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE COMPETENCIA_MENSUAL ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER DYNAMIC TABLE CLIMA_MENSUAL DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE CLIMA_MENSUAL ADD ROW ACCESS POLICY RAP_REGION ON (region);
-- Comentarios de tenderos: misma regla por región (Cortex Search no la aplicaría; ver 05)
ALTER DYNAMIC TABLE VOZ_CLIENTE DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE VOZ_CLIENTE ADD ROW ACCESS POLICY RAP_REGION ON (region);
-- Capa de mapas: el gerente del Norte verá un mapa sin puntos del Bajío
ALTER DYNAMIC TABLE TIENDAS_GEO DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE TIENDAS_GEO ADD ROW ACCESS POLICY RAP_REGION ON (region);
-- Agregados de inventario para el tracker de la app
ALTER DYNAMIC TABLE INVENTARIO_SEMANAL DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE INVENTARIO_SEMANAL ADD ROW ACCESS POLICY RAP_REGION ON (region);
ALTER DYNAMIC TABLE QUIEBRE_SKU_MENSUAL DROP ALL ROW ACCESS POLICIES;
ALTER DYNAMIC TABLE QUIEBRE_SKU_MENSUAL ADD ROW ACCESS POLICY RAP_REGION ON (region);

-- [mask_telefono]
-- Masking en las 3 columnas de PII (el contacto es un nombre real de persona: también es PII)
ALTER DYNAMIC TABLE VENTAS_ENRIQUECIDAS MODIFY COLUMN telefono SET MASKING POLICY MASK_PII FORCE;
ALTER DYNAMIC TABLE VENTAS_ENRIQUECIDAS MODIFY COLUMN email    SET MASKING POLICY MASK_PII FORCE;
ALTER DYNAMIC TABLE VENTAS_ENRIQUECIDAS MODIFY COLUMN contacto SET MASKING POLICY MASK_PII FORCE;

-- [grant_wh_director]
-- Permisos de lectura: una sola vez, al rol funcional LECTOR_COMERCIAL (lo heredan los 3 roles de negocio)
GRANT USAGE ON WAREHOUSE TEC_WH TO ROLE LECTOR_COMERCIAL;
GRANT USAGE ON DATABASE TEC_DEMO TO ROLE LECTOR_COMERCIAL;
GRANT USAGE ON SCHEMA TEC_DEMO.ANALITICA TO ROLE LECTOR_COMERCIAL;
-- APPS: donde vive la app Abarrotera 360 (para abrirla se necesita USAGE en el esquema y en el servicio)
GRANT USAGE ON SCHEMA TEC_DEMO.APPS TO ROLE LECTOR_COMERCIAL;
GRANT SELECT ON ALL DYNAMIC TABLES IN SCHEMA TEC_DEMO.ANALITICA TO ROLE LECTOR_COMERCIAL;
-- (el GRANT ... ON FUTURE DYNAMIC TABLES va en la siguiente celda: requiere MANAGE GRANTS / ACCOUNTADMIN);

-- [usar_accountadmin_cortex]
-- CORTEX_USER solo lo puede otorgar ACCOUNTADMIN
USE ROLE ACCOUNTADMIN;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE LECTOR_COMERCIAL;
-- FUTURE: una Dynamic Table nueva en ANALITICA queda legible sin volver a otorgar (requiere MANAGE GRANTS).
-- Ojo: también debe llevar RAP_REGION (la prueba 00c revisa que ninguna tabla legible quede sin política).
GRANT SELECT ON FUTURE DYNAMIC TABLES IN SCHEMA TEC_DEMO.ANALITICA TO ROLE LECTOR_COMERCIAL;
USE ROLE TEC_ADMIN;

-- [caller_grants_app]
/* Caller grants para la app ABARROTERA_360 (su rol de ejecución es TEC_ADMIN).
   La app pregunta con los permisos de QUIEN LA ABRE (caller's rights, con su rol por defecto) qué regiones le deja
   ver RAP_REGION, y el Agente Comercial corre también como esa persona. Así la seguridad la decide Snowflake,
   no un parámetro del navegador. Estos grants son el TOPE de lo que la app puede hacer en nombre del usuario:
   leer TEC_DEMO.ANALITICA / AGENTES, usar TEC_WH e invocar el agente. Nada de escribir ni crear objetos. */
USE ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON DATABASE TEC_DEMO TO ROLE TEC_ADMIN;
GRANT CALLER USAGE ON SCHEMA TEC_DEMO.ANALITICA TO ROLE TEC_ADMIN;
GRANT CALLER USAGE ON SCHEMA TEC_DEMO.AGENTES TO ROLE TEC_ADMIN;
GRANT CALLER DATA READ ON SCHEMA TEC_DEMO.ANALITICA TO ROLE TEC_ADMIN;
GRANT CALLER DATA READ ON SCHEMA TEC_DEMO.AGENTES TO ROLE TEC_ADMIN;
GRANT CALLER PROGRAM USAGE ON SCHEMA TEC_DEMO.AGENTES TO ROLE TEC_ADMIN;
GRANT CALLER USAGE ON WAREHOUSE TEC_WH TO ROLE TEC_ADMIN;
USE ROLE TEC_ADMIN;
SHOW CALLER GRANTS TO ROLE TEC_ADMIN;

-- [usar_accountadmin_usuarios]
/* Usuarios "persona": el agente (CoWork y REST) corre con el DEFAULT_ROLE del usuario,
   NO con el rol que elijas con USE ROLE en una hoja. Para demostrar que "el agente hereda
   el rol" hay que entrar a CoWork con estos usuarios.
   ✏️ Cambia la contraseña y el correo (CoWork Automations exige correo verificado). */
USE ROLE ACCOUNTADMIN;
SET pwd_persona = 'CambiaEsto-Tec-2026!';
CREATE USER IF NOT EXISTS GERENTE_BAJIO_USR PASSWORD = $pwd_persona DEFAULT_ROLE = GERENTE_BAJIO
  DEFAULT_WAREHOUSE = TEC_WH DEFAULT_SECONDARY_ROLES = () MUST_CHANGE_PASSWORD = FALSE TYPE = PERSON
  EMAIL = 'gerente.bajio@ejemplo.mx' COMMENT = 'Persona del workshop Tec';
CREATE USER IF NOT EXISTS GERENTE_NORTE_USR PASSWORD = $pwd_persona DEFAULT_ROLE = GERENTE_NORTE
  DEFAULT_WAREHOUSE = TEC_WH DEFAULT_SECONDARY_ROLES = () MUST_CHANGE_PASSWORD = FALSE TYPE = PERSON
  EMAIL = 'gerente.norte@ejemplo.mx' COMMENT = 'Persona del workshop Tec';
CREATE USER IF NOT EXISTS DIRECTOR_USR PASSWORD = $pwd_persona DEFAULT_ROLE = DIRECTOR_COMERCIAL
  DEFAULT_WAREHOUSE = TEC_WH DEFAULT_SECONDARY_ROLES = () MUST_CHANGE_PASSWORD = FALSE TYPE = PERSON
  EMAIL = 'director.comercial@ejemplo.mx' COMMENT = 'Persona del workshop Tec';
GRANT ROLE GERENTE_BAJIO      TO USER GERENTE_BAJIO_USR;
GRANT ROLE GERENTE_NORTE      TO USER GERENTE_NORTE_USR;
GRANT ROLE DIRECTOR_COMERCIAL TO USER DIRECTOR_USR;
USE ROLE TEC_ADMIN;

-- [calidad_dmf]
-- Calidad de datos con Data Metric Functions (DMF): Snowflake mide la tabla y compara contra una expectativa.
-- TRIGGER_ON_CHANGES: solo se miden cuando la tabla cambia (con datos congelados no hay costo recurrente).
-- Resultados: SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS. Requiere EXECUTE DATA METRIC FUNCTION (00_setup).
USE ROLE TEC_ADMIN;
CREATE OR REPLACE DATA METRIC FUNCTION TEC_DEMO.RAW.DMF_PRECIOS_INVALIDOS(t TABLE(precio NUMBER, costo NUMBER))
RETURNS NUMBER
COMMENT = 'Filas con precio <= 0 o costo mayor que el precio (venta con margen negativo imposible en el kit)'
AS 'SELECT COUNT_IF(precio <= 0 OR costo > precio) FROM t';
CREATE OR REPLACE DATA METRIC FUNCTION TEC_DEMO.RAW.DMF_LLAVES_HUERFANAS(hijo TABLE(llave NUMBER), padre TABLE(llave NUMBER))
RETURNS NUMBER
COMMENT = 'Filas cuya llave no existe en la tabla padre (p. ej. ventas de una tienda que no está en TIENDAS)'
AS 'SELECT COUNT(*) FROM hijo WHERE llave IS NOT NULL AND llave NOT IN (SELECT llave FROM padre)';

EXECUTE IMMEDIATE $$
DECLARE
  agregadas INT DEFAULT 0;
  -- tabla | función | columnas | expectativa
  c CURSOR FOR SELECT * FROM VALUES
    ('TEC_DEMO.RAW.VENTAS', 'SNOWFLAKE.CORE.NULL_COUNT', 'precio_unitario', 'sin_precios_nulos'),
    ('TEC_DEMO.RAW.VENTAS', 'SNOWFLAKE.CORE.DUPLICATE_COUNT', 'venta_id', 'venta_id_unico'),
    ('TEC_DEMO.RAW.VENTAS', 'TEC_DEMO.RAW.DMF_PRECIOS_INVALIDOS', 'precio_unitario, costo_unitario', 'precios_validos'),
    ('TEC_DEMO.RAW.VENTAS', 'TEC_DEMO.RAW.DMF_LLAVES_HUERFANAS', 'tienda_id, TABLE(TEC_DEMO.RAW.TIENDAS(tienda_id))', 'ventas_con_tienda'),
    ('TEC_DEMO.RAW.TIENDAS', 'SNOWFLAKE.CORE.DUPLICATE_COUNT', 'tienda_id', 'tienda_id_unico'),
    ('TEC_DEMO.RAW.TIENDAS', 'SNOWFLAKE.CORE.NULL_COUNT', 'region', 'tienda_con_region'),
    ('TEC_DEMO.RAW.INVENTARIO_DIARIO', 'SNOWFLAKE.CORE.NULL_COUNT', 'unidades_disponibles', 'inventario_completo'),
    ('TEC_DEMO.RAW.FEEDBACK_CLIENTES', 'SNOWFLAKE.CORE.DUPLICATE_COUNT', 'feedback_id', 'feedback_id_unico'),
    ('TEC_DEMO.RAW.FEEDBACK_CLIENTES', 'SNOWFLAKE.CORE.NULL_COUNT', 'comentario', 'feedback_con_comentario')
    AS v(tabla, funcion, columnas, expectativa);
BEGIN
  FOR r IN c DO
    EXECUTE IMMEDIATE 'ALTER TABLE ' || r.tabla || ' SET DATA_METRIC_SCHEDULE = ''TRIGGER_ON_CHANGES''';
    BEGIN
      EXECUTE IMMEDIATE 'ALTER TABLE ' || r.tabla || ' ADD DATA METRIC FUNCTION ' || r.funcion || ' ON (' || r.columnas ||
                        ') EXPECTATION ' || r.expectativa || ' (VALUE = 0)';
      agregadas := agregadas + 1;
    EXCEPTION
      WHEN OTHER THEN
        IF (NOT CONTAINS(LOWER(SQLERRM), 'already')) THEN RAISE; END IF;  -- re-ejecución: ya estaba asignada
    END;
  END FOR;
  RETURN agregadas || ' DMF nuevas (las demás ya estaban asignadas)';
END;
$$;

-- Medición inmediata (sin esperar un cambio): todas deben dar 0
SELECT SNOWFLAKE.CORE.NULL_COUNT(SELECT precio_unitario FROM TEC_DEMO.RAW.VENTAS) AS ventas_precio_nulo,
       SNOWFLAKE.CORE.DUPLICATE_COUNT(SELECT venta_id FROM TEC_DEMO.RAW.VENTAS) AS ventas_duplicadas,
       TEC_DEMO.RAW.DMF_PRECIOS_INVALIDOS(SELECT precio_unitario, costo_unitario FROM TEC_DEMO.RAW.VENTAS) AS precios_invalidos,
       SNOWFLAKE.CORE.DUPLICATE_COUNT(SELECT tienda_id FROM TEC_DEMO.RAW.TIENDAS) AS tiendas_duplicadas,
       SNOWFLAKE.CORE.NULL_COUNT(SELECT region FROM TEC_DEMO.RAW.TIENDAS) AS tiendas_sin_region,
       SNOWFLAKE.CORE.NULL_COUNT(SELECT unidades_disponibles FROM TEC_DEMO.RAW.INVENTARIO_DIARIO) AS inventario_nulo,
       SNOWFLAKE.CORE.DUPLICATE_COUNT(SELECT feedback_id FROM TEC_DEMO.RAW.FEEDBACK_CLIENTES) AS feedback_duplicado,
       SNOWFLAKE.CORE.NULL_COUNT(SELECT comentario FROM TEC_DEMO.RAW.FEEDBACK_CLIENTES) AS feedback_sin_comentario,
       -- las DMF de dos tablas no se llaman en un SELECT: esta es su consulta equivalente
       (SELECT COUNT(*) FROM TEC_DEMO.RAW.VENTAS WHERE tienda_id NOT IN (SELECT tienda_id FROM TEC_DEMO.RAW.TIENDAS)) AS ventas_sin_tienda;

-- ======================================================================
-- Después: simular personas sin cambiar de usuario
-- ======================================================================

-- [valida_bajio]
-- VALIDACIÓN sin cambiar de usuario: simula el rol activo (y roles secundarios) con POLICY_CONTEXT.
-- Esperado: GERENTE_BAJIO → 1 región (Bajío), aun con DIRECTOR_COMERCIAL como rol secundario.
EXECUTE USING POLICY_CONTEXT(CURRENT_ROLE => 'GERENTE_BAJIO',
    SNOWFLAKE$SESSION_ACTIVATED_ROLES => ('GERENTE_BAJIO','DIRECTOR_COMERCIAL'))
  AS SELECT COUNT(DISTINCT region) regiones_visibles, LISTAGG(DISTINCT region, ', ') regiones FROM VENTAS_MENSUALES;

-- [valida_director]
EXECUTE USING POLICY_CONTEXT(CURRENT_ROLE => 'DIRECTOR_COMERCIAL')
  AS SELECT COUNT(DISTINCT region) regiones_visibles FROM VENTAS_MENSUALES;
