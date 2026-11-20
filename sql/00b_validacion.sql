-- 00b_validacion.sql · huella de los datos y las cifras de la presentación (todo debe salir PASS)
-- Se mantiene a mano (el notebook 00b valida con Python). Los chequeos de seguridad detallados están en 00c_politicas.
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;

-- 1) Huella de carga: filas y suma de control de las 18 tablas contra datos/control/control.csv
--    (las expresiones viven en TEC_DEMO.RAW.HUELLA_CARGA; aquí no se repiten)
CALL TEC_DEMO.RAW.VERIFICAR_HUELLA();

-- 2) Cifras de la historia y objetos del pipeline
WITH cifras AS (
  SELECT 'Historia' area, 'Bebidas Bajío sep → oct (%)' chequeo,
         (SELECT ROUND(100 * (SUM(IFF(mes = '2026-10-01', venta_neta, 0)) / SUM(IFF(mes = '2026-09-01', venta_neta, 0)) - 1), 1)
          FROM TEC_DEMO.ANALITICA.VENTAS_MENSUALES WHERE region = 'Bajío' AND categoria = 'Bebidas')::STRING valor, '-31.6' esperado
  UNION ALL SELECT 'Historia', 'Quiebre Bebidas CEDIS León oct (%)',
         (SELECT ROUND(100 * SUM(dias_sku_quiebre) / SUM(dias_sku), 1) FROM TEC_DEMO.ANALITICA.INVENTARIO_MENSUAL
          WHERE mes = '2026-10-01' AND region = 'Bajío' AND categoria = 'Bebidas')::STRING, '34.6'
  UNION ALL SELECT 'Historia', 'Fill rate Proveedor 07 Bajío oct (%)',
         (SELECT ROUND(100 * SUM(unidades_recibidas) / SUM(unidades_pedidas), 1) FROM TEC_DEMO.ANALITICA.COMPRAS_MENSUALES
          WHERE mes = '2026-10-01' AND region = 'Bajío' AND proveedor LIKE 'Proveedor 07%')::STRING, '72.6'
  UNION ALL SELECT 'Historia', 'Primer día con quiebre diario > 20%',
         (SELECT MIN(fecha) FROM (SELECT fecha FROM TEC_DEMO.RAW.INVENTARIO_DIARIO WHERE region = 'Bajío' AND categoria = 'Bebidas'
          GROUP BY fecha HAVING COUNT_IF(en_quiebre) / COUNT(*) > 0.2))::STRING, '2026-10-01'
  UNION ALL SELECT 'IA', 'Quejas Bajío oct por desabasto',
         (SELECT COUNT(*) FROM TEC_DEMO.ANALITICA.VOZ_CLIENTE v JOIN TEC_DEMO.ANALITICA.TEMAS_COMENTARIO t ON t.comentario_id = v.comentario_id
          WHERE v.region = 'Bajío' AND v.mes = '2026-10-01' AND v.calificacion <= 2 AND t.tema = 'Desabasto de producto')::STRING, '274'
  UNION ALL SELECT 'IA', 'Venta perdida oct Bajío (M MXN)',
         (SELECT ROUND((venta_esperada - venta_real) / 1e6, 1) FROM TEC_DEMO.ANALITICA.PRONOSTICO_MENSUAL WHERE region = 'Bajío' AND mes = '2026-10-01')::STRING, '8.4'
  UNION ALL SELECT 'IA', 'Venta en riesgo nov Bajío (M MXN)',
         (SELECT ROUND((venta_esperada - venta_sin_accion) / 1e6, 1) FROM TEC_DEMO.ANALITICA.PRONOSTICO_MENSUAL WHERE region = 'Bajío' AND mes = '2026-11-01')::STRING, '9.1'
  UNION ALL SELECT 'IA', 'CEDIS más cercano a León · excedente',
         (SELECT cedis_origen || ' · ' || excedente_origen_unidades FROM TEC_DEMO.ANALITICA.RED_ABASTO
          WHERE cedis_destino = 'CEDIS León' ORDER BY distancia_km LIMIT 1), 'CEDIS Tultitlán · 88365'
  UNION ALL SELECT 'IA', 'Llamadas del Bajío en oct con logística negativa',
         (SELECT COUNT(*) FROM TEC_DEMO.ANALITICA.LLAMADAS_360
          WHERE region = 'Bajío' AND mes = '2026-10-01' AND sentimiento_logistica = 'negative')::STRING, '3'
  UNION ALL SELECT 'IA', 'Llamadas del Bajío en oct por desabasto',
         (SELECT COUNT(*) FROM TEC_DEMO.ANALITICA.LLAMADAS_360
          WHERE region = 'Bajío' AND mes = '2026-10-01' AND categoria = 'Desabasto de producto')::STRING, '2'
  UNION ALL SELECT 'Datos', 'Archivos CSV en el stage',
         (SELECT COUNT(*) FROM DIRECTORY(@TEC_DEMO.RAW.DATOS_CSV) WHERE relative_path LIKE '%.csv%')::STRING, '26'
  UNION ALL SELECT 'Datos', 'Audios del call center en el stage',
         (SELECT COUNT(*) FROM DIRECTORY(@TEC_DEMO.RAW.AUDIOS) WHERE relative_path LIKE '%.mp3')::STRING, '13'
  UNION ALL SELECT 'Pipeline', 'Dynamic Tables',
         (SELECT COUNT(*) FROM TEC_DEMO.INFORMATION_SCHEMA.TABLES WHERE table_schema = 'ANALITICA' AND is_dynamic = 'YES')::STRING, '10'
  UNION ALL SELECT 'Pipeline', 'Parámetros de la historia',
         (SELECT COUNT(*) FROM TEC_DEMO.ANALITICA.PARAMETROS)::STRING, '5'
  UNION ALL SELECT 'Gobierno', 'Tablas con RAP_REGION',
         (SELECT COUNT(DISTINCT ref_entity_name) FROM TABLE(TEC_DEMO.INFORMATION_SCHEMA.POLICY_REFERENCES(POLICY_NAME => 'TEC_DEMO.ANALITICA.RAP_REGION')))::STRING, '15'
  UNION ALL SELECT 'Gobierno', 'Columnas con MASK_PII',
         (SELECT COUNT(*) FROM TABLE(TEC_DEMO.INFORMATION_SCHEMA.POLICY_REFERENCES(POLICY_NAME => 'TEC_DEMO.ANALITICA.MASK_PII')))::STRING, '3'
  UNION ALL SELECT 'Agente', 'Semantic View',
         (SELECT COUNT(*) FROM TEC_DEMO.INFORMATION_SCHEMA.SEMANTIC_VIEWS WHERE name = 'SV_COMERCIAL')::STRING, '1'
  UNION ALL SELECT 'Agente', 'Llamadas en la Semantic View',
         (SELECT COUNT(*) FROM TEC_DEMO.INFORMATION_SCHEMA.SEMANTIC_TABLES WHERE semantic_view_name = 'SV_COMERCIAL' AND name = 'LLAMADAS')::STRING, '1'
  UNION ALL SELECT 'Agente', 'Servicios de Cortex Search (documentos, feedback y llamadas, con uno por región)',
         (SELECT COUNT(*) FROM TEC_DEMO.INFORMATION_SCHEMA.CORTEX_SEARCH_SERVICES)::STRING, '7'
)
SELECT IFF(valor = esperado, 'PASS', 'FAIL') estado, area, chequeo, valor, esperado FROM cifras
ORDER BY estado, area, chequeo;
