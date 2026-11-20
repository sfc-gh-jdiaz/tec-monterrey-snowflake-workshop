-- 03c_call_center.sql · generado desde notebooks/03c_call_center.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 03c · Call Center: IA sobre audio
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda). Lo caro (transcribir y analizar con IA) usa IF NOT EXISTS:
-- re-ejecutar no repite ese costo. Costo de referencia: 66 min de audio ≈ 200 mil tokens de AI_TRANSCRIBE.
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.ANALITICA;

-- ======================================================================
-- Antes: 13 audios en un stage
-- ======================================================================

-- [antes]
SELECT l.llamada_id, l.fecha, l.region, l.ciudad, l.tienda, l.agente,
       ROUND(l.duracion_seg / 60, 1) AS minutos, ROUND(d.size / 1024 / 1024, 1) AS mb, l.archivo
FROM TEC_DEMO.RAW.LLAMADAS l
LEFT JOIN DIRECTORY(@TEC_DEMO.RAW.AUDIOS) d ON d.relative_path = l.archivo
ORDER BY l.llamada_id;

-- ======================================================================
-- Motor · Paso 1: transcribir con `AI_TRANSCRIBE`
-- ======================================================================

-- [transcripcion]
-- EN VIVO (una sola vez): una fila por llamada con el JSON completo de AI_TRANSCRIBE
CREATE TABLE IF NOT EXISTS TRANSCRIPCIONES_EN_VIVO AS
SELECT l.llamada_id, l.archivo,
       AI_TRANSCRIBE(TO_FILE('@TEC_DEMO.RAW.AUDIOS', l.archivo), {'timestamp_granularity': 'speaker'}) AS resultado
FROM TEC_DEMO.RAW.LLAMADAS l;

SELECT llamada_id, ROUND(resultado:audio_duration::FLOAT / 60, 1) AS minutos,
       ARRAY_SIZE(resultado:segments) AS turnos,
       ARRAY_SIZE(ARRAY_DISTINCT(TRANSFORM(resultado:segments, s -> s:speaker_label))) AS hablantes_detectados,
       LEFT(resultado:text::STRING, 160) || '…' AS inicio_de_la_transcripcion
FROM TRANSCRIPCIONES_EN_VIVO ORDER BY llamada_id;

-- [turnos]
-- El primer hablante es el agente (el call center siempre contesta primero)
SELECT ROUND(s.value:start::FLOAT, 1) AS inicio_seg, ROUND(s.value:end::FLOAT, 1) AS fin_seg,
       IFF(s.value:speaker_label::STRING = t.resultado:segments[0]:speaker_label::STRING, 'Agente', 'Tienda') AS hablante,
       s.value:text::STRING AS texto
FROM TRANSCRIPCIONES_EN_VIVO t, LATERAL FLATTEN(t.resultado:segments) s
WHERE t.llamada_id = 11
ORDER BY s.index
LIMIT 20;

-- [analisis]
-- EN VIVO (una sola vez). Los turnos se guardan como arreglo {inicio, fin, hablante, texto}.
CREATE TABLE IF NOT EXISTS LLAMADAS_ANALIZADAS_EN_VIVO AS
WITH t AS (
  SELECT llamada_id, resultado:text::STRING AS texto, resultado:audio_duration::FLOAT AS duracion_seg,
         resultado:segments AS segs, resultado:segments[0]:speaker_label::STRING AS primer_hablante,
         ARRAY_SIZE(ARRAY_DISTINCT(TRANSFORM(resultado:segments, s -> s:speaker_label))) AS hablantes
  FROM TRANSCRIPCIONES_EN_VIVO),
ia AS (
  SELECT t.*,
    TRANSFORM(segs, x -> OBJECT_CONSTRUCT('inicio', ROUND(x:start::FLOAT, 2), 'fin', ROUND(x:end::FLOAT, 2),
              'hablante', IFF(hablantes = 1, 'Llamada', IFF(x:speaker_label::STRING = primer_hablante, 'Agente', 'Tienda')),
              'texto', x:text::STRING)) AS segmentos,
    AI_CLASSIFY(texto, ['Desabasto de producto', 'Entrega y logística', 'Sistemas y pagos', 'Cadena de frío',
                        'Calidad y caducidad', 'Precios y facturación', 'Insumos de operación'],
                {'task_description': 'Motivo principal por el que una tienda llama al call center de su distribuidor de abarrotes'}):labels[0]::STRING AS categoria,
    AI_CLASSIFY(texto, [
        {'label': 'Alta',  'description': 'la tienda ya está perdiendo ventas o clientes por falta de producto o porque no puede vender'},
        {'label': 'Media', 'description': 'hay un problema operativo con riesgo de merma o de pérdida próxima, pero la tienda sigue vendiendo'},
        {'label': 'Baja',  'description': 'trámite administrativo, facturación, insumos menores o un problema ya resuelto durante la llamada'}],
      {'task_description': 'Urgencia de negocio de la llamada de una tienda al call center de su distribuidor'}):labels[0]::STRING AS urgencia,
    AI_SENTIMENT(texto, ['Logística', 'Servicio', 'Producto']) AS sent,
    AI_EXTRACT(text => texto, responseFormat => {
      'producto_afectado': '¿Qué producto, categoría o insumo está afectado? Respuesta corta',
      'compromiso': '¿Qué se comprometió a hacer el agente? Una frase',
      'plazo': '¿En qué plazo se comprometió el agente?',
      'causa': '¿Qué causa del problema se menciona en la llamada? Una frase'}):response AS extraido,
    AI_COMPLETE(model => 'claude-sonnet-4-5',
      prompt => CONCAT('Eres analista del call center de un distribuidor de abarrotes. De esta llamada entre una tienda y el call center devuelve: ',
                       'resumen = el problema y el acuerdo en máximo dos frases en español; ',
                       'folio = el folio que dicta el agente al final, en formato compacto con mayúsculas, dígitos y guiones (por ejemplo "AB-1032911"; "cero" es 0). ',
                       'Llamada: ', texto),
      model_parameters => {'temperature': 0},
      response_format => TYPE OBJECT(resumen STRING, folio STRING)) AS completo
  FROM t)
SELECT llamada_id, texto AS transcripcion, segmentos, duracion_seg, categoria,
  GET(FILTER(sent:categories, c -> c:name::STRING = 'overall'), 0):sentiment::STRING   AS sentimiento,
  GET(FILTER(sent:categories, c -> c:name::STRING = 'Logística'), 0):sentiment::STRING AS sentimiento_logistica,
  GET(FILTER(sent:categories, c -> c:name::STRING = 'Servicio'), 0):sentiment::STRING  AS sentimiento_servicio,
  GET(FILTER(sent:categories, c -> c:name::STRING = 'Producto'), 0):sentiment::STRING  AS sentimiento_producto,
  OBJECT_INSERT(extraido, 'folio', completo:folio::STRING) AS extraccion,
  completo:resumen::STRING AS resumen, urgencia
FROM ia;

SELECT llamada_id, categoria, urgencia, sentimiento, sentimiento_logistica, extraccion:folio::STRING AS folio, resumen
FROM LLAMADAS_ANALIZADAS_EN_VIVO ORDER BY llamada_id;

-- ======================================================================
-- Oficial: el mismo análisis congelado en el kit
-- ======================================================================

-- [oficial]
CREATE TABLE IF NOT EXISTS LLAMADAS_ANALIZADAS (llamada_id NUMBER(9,0), transcripcion STRING, segmentos VARIANT, duracion_seg FLOAT,
  categoria STRING, sentimiento STRING, sentimiento_logistica STRING, sentimiento_servicio STRING, sentimiento_producto STRING,
  extraccion VARIANT, resumen STRING, urgencia STRING);
CALL TEC_DEMO.RAW.CARGAR_CSV('LLAMADAS_ANALIZADAS');  -- carpeta y huella: TEC_DEMO.RAW.HUELLA_CARGA

SELECT o.llamada_id, o.categoria AS categoria_oficial, v.categoria AS categoria_en_vivo, IFF(o.categoria = v.categoria, '✓', '≠') AS coincide,
       o.sentimiento_logistica AS logistica_oficial, v.sentimiento_logistica AS logistica_en_vivo,
       o.urgencia AS urgencia_oficial, v.urgencia AS urgencia_en_vivo
FROM LLAMADAS_ANALIZADAS o LEFT JOIN LLAMADAS_ANALIZADAS_EN_VIVO v USING (llamada_id)
ORDER BY o.llamada_id;

-- ======================================================================
-- Gobierno: una tabla para el agente y la app
-- ======================================================================

-- [llamadas_360]
-- CREATE OR REPLACE: se recalcula si recargas el catálogo o el oficial (abajo se vuelven a poner política y permiso)
CREATE OR REPLACE TABLE LLAMADAS_360 AS
SELECT l.llamada_id, l.fecha, DATE_TRUNC('month', l.fecha)::DATE AS mes, l.region, l.estado, l.ciudad, l.tienda_id, l.tienda,
       l.agente, a.duracion_seg, a.categoria, a.urgencia, a.sentimiento, a.sentimiento_logistica, a.sentimiento_servicio,
       a.sentimiento_producto, a.extraccion:producto_afectado::STRING AS producto_afectado, a.extraccion:causa::STRING AS causa,
       a.extraccion:compromiso::STRING AS compromiso, a.extraccion:plazo::STRING AS plazo, a.extraccion:folio::STRING AS folio,
       a.resumen, a.transcripcion, a.segmentos, l.archivo
FROM TEC_DEMO.RAW.LLAMADAS l JOIN LLAMADAS_ANALIZADAS a USING (llamada_id);

-- [gobierno_llamadas]
ALTER TABLE LLAMADAS_360 DROP ALL ROW ACCESS POLICIES;
ALTER TABLE LLAMADAS_360 ADD ROW ACCESS POLICY RAP_REGION ON (region);
GRANT SELECT ON TABLE LLAMADAS_360 TO ROLE LECTOR_COMERCIAL;
-- LLAMADAS_ANALIZADAS(_EN_VIVO) y TRANSCRIPCIONES_EN_VIVO no tienen región: se quedan solo para TEC_ADMIN.
SELECT COUNT(*) AS llamadas, COUNT_IF(region = 'Bajío') AS del_bajio FROM LLAMADAS_360;

-- ======================================================================
-- Después: lo que dicen las llamadas
-- ======================================================================

-- [por_categoria]
SELECT categoria, region, COUNT(*) AS llamadas, COUNT_IF(urgencia = 'Alta') AS urgentes,
       COUNT_IF(sentimiento_logistica = 'negative') AS logistica_negativa
FROM LLAMADAS_360 GROUP BY ALL ORDER BY llamadas DESC, categoria;

-- [bajio_octubre]
SELECT llamada_id, fecha, ciudad, tienda, categoria, urgencia, sentimiento_logistica, causa, folio, resumen
FROM LLAMADAS_360
WHERE region = 'Bajío' AND mes = '2026-10-01'
ORDER BY fecha;

-- [citas]
-- Buscar dentro de los turnos: la evidencia textual, con el segundo exacto del audio
SELECT l.llamada_id, l.ciudad, ROUND(s.value:inicio::FLOAT) AS segundo, s.value:hablante::STRING AS hablante, s.value:texto::STRING AS texto
FROM LLAMADAS_360 l, LATERAL FLATTEN(l.segmentos) s
WHERE l.region = 'Bajío' AND l.mes = '2026-10-01'
  AND REGEXP_LIKE(s.value:texto::STRING, '.*(proveedor|CEDIS|Cedis|Tultitlán|competencia|promoción).*', 'i')
ORDER BY l.llamada_id, segundo;

-- [llamadas_norte]
-- La política viaja con el dato: como GERENTE_NORTE no hay llamadas del Bajío
EXECUTE USING POLICY_CONTEXT(CURRENT_ROLE => 'GERENTE_NORTE')
  AS SELECT COUNT(*) AS llamadas_visibles, COUNT_IF(region = 'Bajío') AS del_bajio
     FROM TEC_DEMO.ANALITICA.LLAMADAS_360;
