-- 05_search.sql · generado desde notebooks/05_search.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 05 · Cortex Search
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.AGENTES;

-- [antes]
SHOW CORTEX SEARCH SERVICES IN SCHEMA TEC_DEMO.AGENTES;

-- ======================================================================
-- Motor
-- ======================================================================

-- [tabla_documentos]
-- Políticas y procedimientos que el agente cita. Única fuente: datos/referencia/documentos (mismo CARGAR_CSV que el resto)
CREATE TABLE IF NOT EXISTS DOCUMENTOS (doc_id INT, titulo STRING, contenido STRING);
CALL TEC_DEMO.RAW.CARGAR_CSV('DOCUMENTOS');

CREATE CORTEX SEARCH SERVICE IF NOT EXISTS BUSQUEDA_DOCUMENTOS
  ON contenido ATTRIBUTES titulo
  WAREHOUSE = TEC_WH TARGET_LAG = '1 day'
AS SELECT doc_id, titulo, contenido FROM DOCUMENTOS;

-- Permisos: esquema y búsqueda de documentos al rol funcional (lo heredan los 3 roles de negocio)
GRANT USAGE ON SCHEMA TEC_DEMO.AGENTES TO ROLE LECTOR_COMERCIAL;
GRANT USAGE ON CORTEX SEARCH SERVICE BUSQUEDA_DOCUMENTOS TO ROLE LECTOR_COMERCIAL;

-- [crear_search_feedback]
/* Segundo índice: voz del cliente. fecha se indexa como DATE para filtrar por rango.
   OJO: Cortex Search busca con los permisos del DUEÑO del servicio: NO aplica la Row Access Policy de quien busca.
   (Y no puede indexar VOZ_CLIENTE: RAP_REGION usa una subconsulta y Search requiere change tracking sin ella.)
   Por eso:
   - BUSQUEDA_FEEDBACK (todas las regiones) solo lo usa DIRECTOR_COMERCIAL.
   - Para cada rol con UNA región en ACCESO_REGION se crea su propio índice, con solo esa región,
     y se le otorga solo a ese rol. Así un gerente busca en sus comentarios sin ver los de otras regiones. */
CREATE CORTEX SEARCH SERVICE IF NOT EXISTS BUSQUEDA_FEEDBACK
  ON comentario ATTRIBUTES region, estado, canal, fecha
  WAREHOUSE = TEC_WH TARGET_LAG = '1 day'
AS SELECT feedback_id, comentario, region, estado, canal, fecha, calificacion FROM TEC_DEMO.RAW.FEEDBACK_CLIENTES;
GRANT USAGE ON CORTEX SEARCH SERVICE BUSQUEDA_FEEDBACK TO ROLE DIRECTOR_COMERCIAL;

-- Un índice por región (IF NOT EXISTS: re-ejecutar no repite el costo)
EXECUTE IMMEDIATE $$
DECLARE
  salida STRING DEFAULT '';
  c CURSOR FOR SELECT rol, region FROM TEC_DEMO.ANALITICA.ACCESO_REGION WHERE region <> '*' ORDER BY rol;
BEGIN
  FOR f IN c DO
    LET servicio STRING := 'TEC_DEMO.AGENTES.BUSQUEDA_FEEDBACK_' ||
        REGEXP_REPLACE(UPPER(TRANSLATE(f.region, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')), '[^A-Z0-9]', '_');
    LET rol STRING := f.rol;
    EXECUTE IMMEDIATE 'CREATE CORTEX SEARCH SERVICE IF NOT EXISTS ' || servicio ||
      ' ON comentario ATTRIBUTES estado, canal, fecha WAREHOUSE = TEC_WH TARGET_LAG = ''1 day''' ||
      ' AS SELECT feedback_id, comentario, region, estado, canal, fecha, calificacion FROM TEC_DEMO.RAW.FEEDBACK_CLIENTES' ||
      ' WHERE region = ''' || REPLACE(f.region, '''', '''''') || '''';
    GRANT USAGE ON CORTEX SEARCH SERVICE IDENTIFIER(:servicio) TO ROLE IDENTIFIER(:rol);
    salida := salida || servicio || ' → ' || rol || '; ';
  END FOR;
  RETURN salida;
END;
$$;

-- [crear_search_llamadas]
/* Tercer índice: cada TURNO de las 13 llamadas (03c), con el segundo exacto del audio. Mismo modelo de seguridad que
   feedback: Search busca con los permisos del dueño, así que BUSQUEDA_LLAMADAS (todas las regiones) es solo para
   DIRECTOR_COMERCIAL y cada rol con una región recibe su propio índice. La tabla de turnos se crea una vez
   (IF NOT EXISTS: los datos del kit están congelados) y no se otorga a ningún rol de negocio. */
CREATE TABLE IF NOT EXISTS TEC_DEMO.AGENTES.LLAMADAS_TURNOS AS
SELECT l.llamada_id, l.fecha, l.region, l.estado, l.ciudad, l.tienda, a.categoria,
       s.index AS turno, ROUND(s.value:inicio::FLOAT, 1) AS segundo, s.value:hablante::STRING AS hablante,
       s.value:texto::STRING AS texto
FROM TEC_DEMO.RAW.LLAMADAS l
JOIN TEC_DEMO.ANALITICA.LLAMADAS_ANALIZADAS a USING (llamada_id),
     LATERAL FLATTEN(a.segmentos) s;

CREATE CORTEX SEARCH SERVICE IF NOT EXISTS BUSQUEDA_LLAMADAS
  ON texto ATTRIBUTES region, estado, ciudad, categoria, hablante, fecha
  WAREHOUSE = TEC_WH TARGET_LAG = '1 day'
AS SELECT llamada_id, turno, segundo, hablante, texto, region, estado, ciudad, tienda, categoria, fecha
   FROM TEC_DEMO.AGENTES.LLAMADAS_TURNOS;
GRANT USAGE ON CORTEX SEARCH SERVICE BUSQUEDA_LLAMADAS TO ROLE DIRECTOR_COMERCIAL;

EXECUTE IMMEDIATE $$
DECLARE
  salida STRING DEFAULT '';
  c CURSOR FOR SELECT rol, region FROM TEC_DEMO.ANALITICA.ACCESO_REGION WHERE region <> '*' ORDER BY rol;
BEGIN
  FOR f IN c DO
    LET servicio STRING := 'TEC_DEMO.AGENTES.BUSQUEDA_LLAMADAS_' ||
        REGEXP_REPLACE(UPPER(TRANSLATE(f.region, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')), '[^A-Z0-9]', '_');
    LET rol STRING := f.rol;
    EXECUTE IMMEDIATE 'CREATE CORTEX SEARCH SERVICE IF NOT EXISTS ' || servicio ||
      ' ON texto ATTRIBUTES estado, ciudad, categoria, hablante, fecha WAREHOUSE = TEC_WH TARGET_LAG = ''1 day''' ||
      ' AS SELECT llamada_id, turno, segundo, hablante, texto, region, estado, ciudad, tienda, categoria, fecha' ||
      ' FROM TEC_DEMO.AGENTES.LLAMADAS_TURNOS WHERE region = ''' || REPLACE(f.region, '''', '''''') || '''';
    GRANT USAGE ON CORTEX SEARCH SERVICE IDENTIFIER(:servicio) TO ROLE IDENTIFIER(:rol);
    salida := salida || servicio || ' → ' || rol || '; ';
  END FOR;
  RETURN salida;
END;
$$;

-- [lag_search]
-- Los datos del kit están congelados: los índices se revisan una vez al día (también si vienen de una corrida anterior)
EXECUTE IMMEDIATE $$
DECLARE
  n INT DEFAULT 0;
BEGIN
  SHOW CORTEX SEARCH SERVICES IN SCHEMA TEC_DEMO.AGENTES;
  LET c CURSOR FOR SELECT "name" AS nombre FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) WHERE "target_lag" <> '1 day';
  FOR s IN c DO
    LET servicio STRING := 'TEC_DEMO.AGENTES.' || s.nombre;
    ALTER CORTEX SEARCH SERVICE IDENTIFIER(:servicio) SET TARGET_LAG = '1 day';
    n := n + 1;
  END FOR;
  RETURN n || ' servicio(s) ajustados a 1 día';
END;
$$;

-- ======================================================================
-- Después: buscar como lo haría el agente
-- ======================================================================

-- [busqueda]
SELECT PARSE_JSON(SNOWFLAKE.CORTEX.SEARCH_PREVIEW('TEC_DEMO.AGENTES.BUSQUEDA_FEEDBACK',
  '{"query":"no hay refresco ni bebidas","columns":["comentario","estado","fecha"],"filter":{"@eq":{"region":"Bajío"}},"limit":5}')):results AS resultados;

-- [busqueda_llamadas]
-- Búsqueda semántica sobre los turnos: "faltan refrescos" encuentra "el anaquel de bebidas medio vacío" (con el segundo del audio)
SELECT PARSE_JSON(SNOWFLAKE.CORTEX.SEARCH_PREVIEW('TEC_DEMO.AGENTES.BUSQUEDA_LLAMADAS',
  '{"query":"el proveedor no surte refresco y el CEDIS está vacío","columns":["llamada_id","ciudad","segundo","hablante","texto"],"filter":{"@eq":{"region":"Bajío"}},"limit":5}')):results AS resultados;
