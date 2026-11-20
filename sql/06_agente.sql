-- 06_agente.sql · generado desde notebooks/06_agente.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 06 · Cortex Agent y Snowflake CoWork
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.AGENTES;

-- [antes]
SHOW AGENTS IN SCHEMA TEC_DEMO.AGENTES;

-- ======================================================================
-- Motor
-- ======================================================================

-- [crear_agente]
CREATE OR REPLACE AGENT AGENTE_COMERCIAL
  COMMENT = 'Analista comercial y de cadena de suministro, con mapas, gráficas, pronóstico y red de abasto'
  PROFILE = '{"display_name": "Agente Comercial"}'
FROM SPECIFICATION $$
models:
  orchestration: auto
orchestration:
  budget:
    seconds: 120
    tokens: 20000
instructions:
  response: "Responde en español, breve, con cifras en MXN y porcentajes. La primera oración de tu respuesta debe ser la conclusión de negocio. Nunca escribas frases de planeación o de proceso interno (por ejemplo 'Run several queries in parallel', 'voy a correr consultas', 'déjame revisar'), ni menciones herramientas o errores internos. Para explicar una caída, sigue la cadena: ventas → geografía → inventario → proveedores → competencia → clima → voz del cliente → llamadas del call center, y termina con 2 o 3 acciones recomendadas citando el procedimiento aplicable. Si recomiendas reasignar inventario, di desde qué CEDIS, a cuántos km y en cuántas horas. Si te preguntan por el impacto económico, da la venta perdida contra el pronóstico y lo que está en riesgo en noviembre. Cuando haya una comparación en el tiempo o entre categorías, acompaña la respuesta con una gráfica. Si los datos solo muestran algunas regiones, es porque el rol del usuario solo tiene acceso a ellas: dilo así y no inventes cifras de otras regiones. Si citas una llamada del call center, di su número, la ciudad y la fecha, y resume lo que reportó la tienda en una frase. Nunca digas que una tabla o una gráfica de barras es un mapa."
  orchestration: "Usa 'datos' para cualquier número (ventas, inventario, proveedores, precios de competencia, clima), para los comentarios de tenderos (tabla voz; calificación <= 2 = queja; tabla temas para el tema clasificado con IA), para la ubicación de las tiendas (tabla geo), para el pronóstico de Bebidas (tabla pronostico: venta esperada vs real y escenario de noviembre sin acción), para la red de CEDIS (tabla red: distancias, horas de camión y excedente) y para las llamadas de las tiendas al call center (tabla llamadas: motivo, urgencia, sentimiento por aspecto, causa y resumen de cada llamada, analizadas con IA desde el audio). Usa 'documentos' para políticas y procedimientos. Los datos van de nov-2024 a oct-2026 (pronóstico hasta nov-2026): 'octubre' sin año es octubre de 2026.\nCLIMA: hay estacionalidad (octubre siempre es más frío que septiembre). Para saber si el clima explica una caída compara el mismo mes contra el año anterior (octubre 2026 vs octubre 2025), no contra el mes previo.\nMAPAS (tabla geo): mapa de puntos = tienda_id, tienda, latitud, longitud y la métrica, agrupado por tienda_id; mapa por ciudad = ciudad, estado, AVG latitud y longitud, número de tiendas y la métrica; mapa de hexágonos = h3_cell (resolución 7) y la métrica. Para la red de abasto devuelve lat_origen, lon_origen, lat_destino y lon_destino. Las coordenadas son latitud/longitud WGS84. Para mapas grandes usa el nivel ciudad o hexágono, no tienda por tienda, y limita a 2,000 filas. Devuelve siempre el resultado SQL con columnas de coordenadas o h3_cell para que el cliente dibuje el mapa nativo. Si además se pide una imagen o un archivo con el mapa, usa 'code_execution' con matplotlib (scatter de longitud vs latitud, color = métrica, tamaño = tiendas; plotly no puede exportar imágenes en este entorno) a partir de RESULT_SCAN del mismo query_id.\nUsa 'data_to_chart' para gráficas de líneas o barras (por ejemplo real vs esperado por mes). Usa 'code_execution' para generar archivos (PowerPoint, PDF, Word) o imágenes a partir de resultados ya obtenidos."
  sample_questions:
    - question: "¿Por qué cayeron las ventas en el Bajío en octubre de 2026?"
    - question: "¿Cuánto vamos a perder en noviembre si no resolvemos el quiebre?"
    - question: "¿Desde qué CEDIS reasigno Bebidas a León y en cuánto tiempo llegan?"
    - question: "Muéstrame en un mapa por ciudad cuánto cambió la venta de Bebidas de septiembre a octubre"
    - question: "¿De qué se quejan los tenderos del Bajío? Agrúpalo por tema"
    - question: "¿Qué reportaron por teléfono las tiendas del Bajío en octubre?"
    - question: "Haz un mapa de hexágonos con la venta de octubre y dime dónde se concentra"
tools:
  - tool_spec: { type: "cortex_analyst_text_to_sql", name: "datos", description: "Ventas, margen, inventario, quiebres, proveedores (OTIF, fill rate), precios de competencia, clima, comentarios de tenderos con tema y sentimiento (IA), ubicación de 20,000 tiendas (latitud, longitud, ciudad, hexágono H3), pronóstico de Bebidas (esperado vs real, noviembre sin acción), red de CEDIS (distancia, horas de camión, excedente) y llamadas de tiendas al call center (motivo, urgencia, sentimiento, causa y resumen) por mes, región, estado y categoría" }
  - tool_spec: { type: "cortex_search", name: "documentos", description: "Políticas comerciales, procedimientos de abasto y reportes de mercado" }
  - tool_spec: { type: "data_to_chart", name: "data_to_chart", description: "Genera gráficas de líneas, barras y dispersión a partir de los datos" }
  # RIESGO (documentado, se mantiene para el taller): code_execution corre Python generado por el modelo en un sandbox
  # de Snowflake con los resultados que el agente ya obtuvo. Puede crear archivos (PPTX, PDF, imágenes) con datos del
  # usuario. Para producción: quítalo si no se necesita, o limita qué roles usan el agente y revisa qué sale en los archivos.
  - tool_spec: { type: "code_execution", name: "code_execution" }
tool_resources:
  datos:
    semantic_view: "TEC_DEMO.ANALITICA.SV_COMERCIAL"
    execution_environment: { type: "warehouse", warehouse: "TEC_WH", query_timeout: 60 }
  documentos:
    search_service: "TEC_DEMO.AGENTES.BUSQUEDA_DOCUMENTOS"
    title_column: "TITULO"
    id_column: "DOC_ID"
    max_results: 4
  code_execution: {}
$$;

-- [grant_agente_director]
-- CREATE OR REPLACE quita los permisos: se vuelven a otorgar (al rol funcional que heredan los 3 roles)
GRANT USAGE ON AGENT AGENTE_COMERCIAL TO ROLE LECTOR_COMERCIAL;

-- [usar_accountadmin]
-- Publicar el agente en Snowflake CoWork (antes Snowflake Intelligence) y habilitar Automations (ACCOUNTADMIN)
USE ROLE ACCOUNTADMIN;
CREATE SNOWFLAKE INTELLIGENCE IF NOT EXISTS SNOWFLAKE_INTELLIGENCE_OBJECT_DEFAULT;
EXECUTE IMMEDIATE $$
BEGIN
  ALTER SNOWFLAKE INTELLIGENCE SNOWFLAKE_INTELLIGENCE_OBJECT_DEFAULT ADD AGENT TEC_DEMO.AGENTES.AGENTE_COMERCIAL;
  RETURN 'Agente publicado en CoWork';
EXCEPTION
  WHEN OTHER THEN
    IF (CONTAINS(SQLERRM, 'already present')) THEN RETURN 'Ya estaba publicado en CoWork'; END IF;
    RAISE;
END;
$$;
GRANT USAGE ON SNOWFLAKE INTELLIGENCE SNOWFLAKE_INTELLIGENCE_OBJECT_DEFAULT TO ROLE LECTOR_COMERCIAL;
-- CoWork Automations ("mándame este reporte cada lunes") requiere este privilegio.
-- Solo a los roles de negocio del taller vía LECTOR_COMERCIAL (antes se otorgaba a PUBLIC = cualquier usuario de la cuenta).
-- Si una corrida anterior del kit lo otorgó a PUBLIC y nada más en tu cuenta lo usa, quítalo con:
--   REVOKE EXECUTE AGENT TASK ON ACCOUNT FROM ROLE PUBLIC;
GRANT EXECUTE AGENT TASK ON ACCOUNT TO ROLE LECTOR_COMERCIAL;
USE ROLE TEC_ADMIN;

-- ======================================================================
-- Después: preguntarle al agente desde SQL
-- ======================================================================

-- [respuesta]
WITH r AS (SELECT TRY_PARSE_JSON(SNOWFLAKE.CORTEX.DATA_AGENT_RUN('TEC_DEMO.AGENTES.AGENTE_COMERCIAL',
  $${"messages":[{"role":"user","content":[{"type":"text","text":"¿Qué proveedor tuvo peor perfect order rate en el Bajío en octubre?"}]}]}$$)) j)
SELECT LISTAGG(f.value:text::STRING, ' ') AS respuesta FROM r, LATERAL FLATTEN(j:content) f WHERE f.value:type = 'text';

-- [respuesta_llamadas]
-- El agente cruza las llamadas con las cifras: debe citar al menos una llamada del Bajío de octubre
WITH r AS (SELECT TRY_PARSE_JSON(SNOWFLAKE.CORTEX.DATA_AGENT_RUN('TEC_DEMO.AGENTES.AGENTE_COMERCIAL',
  $${"messages":[{"role":"user","content":[{"type":"text","text":"¿Qué reportaron por teléfono las tiendas del Bajío en octubre y coincide con lo que dicen los datos de proveedores?"}]}]}$$)) j)
SELECT LISTAGG(f.value:text::STRING, ' ') AS respuesta FROM r, LATERAL FLATTEN(j:content) f WHERE f.value:type = 'text';

-- [respuesta_mapa]
-- Pregunta de mapa: el agente usa la verified query de ciudades y devuelve latitud/longitud (lo que CoWork necesita para dibujar)
WITH r AS (SELECT TRY_PARSE_JSON(SNOWFLAKE.CORTEX.DATA_AGENT_RUN('TEC_DEMO.AGENTES.AGENTE_COMERCIAL',
  $${"messages":[{"role":"user","content":[{"type":"text","text":"Muéstrame en un mapa por ciudad cuánto cambió la venta de Bebidas de septiembre a octubre. Dime las 3 ciudades que más cayeron."}]}]}$$)) j)
SELECT (SELECT LISTAGG(f.value:text::STRING, ' ') FROM LATERAL FLATTEN(j:content) f WHERE f.value:type = 'text') AS respuesta,
       (SELECT LISTAGG(f.value:tool_use:input:sql::STRING, '\n---\n') FROM LATERAL FLATTEN(j:content) f
         WHERE f.value:type = 'tool_use' AND f.value:tool_use:input:sql IS NOT NULL) AS sql_generado
FROM r;
