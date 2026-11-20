-- 04_semantic_view.sql · generado desde notebooks/04_semantic_view.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 04 · Semantic View
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.ANALITICA;

-- [antes]
SHOW SEMANTIC VIEWS IN SCHEMA TEC_DEMO.ANALITICA;

-- ======================================================================
-- Motor
-- ======================================================================

-- [crear_sv]
/* Cada tabla lógica es un agregado mensual independiente (grano distinto: ventas por estado/canal,
   inventario por región/categoría, compras por proveedor, geo por tienda...). Casi no se declaran RELATIONSHIPS a propósito:
   unirlas por mes/región multiplicaría filas. El agente consulta cada tabla y combina los resultados.
    La tabla llamadas (03c) también va sola. La única relación es voz → temas por comentario_id (HASH del texto; cada comentario tiene un tema y sentimiento
    clasificados con IA en 03b). Las tasas y promedios se calculan SUM(numerador)/SUM(denominador) para que sean
    correctos a cualquier nivel (nunca promedio de promedios). */
CREATE OR REPLACE SEMANTIC VIEW SV_COMERCIAL
  TABLES (
    ventas AS TEC_DEMO.ANALITICA.VENTAS_MENSUALES WITH SYNONYMS = ('ventas','sell-out','facturación')
      COMMENT = 'Ventas mensuales por región, estado, categoría, canal y marca',
    inventario AS TEC_DEMO.ANALITICA.INVENTARIO_MENSUAL WITH SYNONYMS = ('stock','existencias','abasto')
      COMMENT = 'Inventario de CEDIS por mes, región y categoría',
    compras AS TEC_DEMO.ANALITICA.COMPRAS_MENSUALES WITH SYNONYMS = ('proveedores','órdenes de compra','OTIF')
      COMMENT = 'Desempeño de proveedores: retraso, fill rate y perfect order',
    competencia AS TEC_DEMO.ANALITICA.COMPETENCIA_MENSUAL WITH SYNONYMS = ('precios competencia','competidores')
      COMMENT = 'Brecha de precio del competidor vs precio propio (negativo = competidor más barato)',
    clima AS TEC_DEMO.ANALITICA.CLIMA_MENSUAL WITH SYNONYMS = ('temperatura','tiempo')
      COMMENT = 'Temperatura máxima promedio y lluvia por estado',
    voz AS TEC_DEMO.ANALITICA.VOZ_CLIENTE PRIMARY KEY (feedback_id) WITH SYNONYMS = ('voz del cliente','comentarios','tenderos','quejas','feedback')
      COMMENT = 'Comentarios textuales de tenderos con calificación 1-5 (1-2 = queja), por fecha, región, estado y canal',
    temas AS TEC_DEMO.ANALITICA.TEMAS_COMENTARIO PRIMARY KEY (comentario_id) WITH SYNONYMS = ('tema','tipo de queja','sentimiento')
      COMMENT = 'Tema y sentimiento de cada texto de comentario, clasificados con AI_CLASSIFY y AI_SENTIMENT',
    geo AS TEC_DEMO.ANALITICA.TIENDAS_GEO WITH SYNONYMS = ('mapa','tiendas','ubicación','puntos de venta','geografía')
      COMMENT = 'Una fila por tienda y mes con latitud, longitud, ciudad, hexágono H3 (resolución 7) y venta total, de Bebidas y de Botanas',
    pronostico AS TEC_DEMO.ANALITICA.PRONOSTICO_MENSUAL WITH SYNONYMS = ('pronóstico','forecast','proyección','venta esperada')
      COMMENT = 'Venta de Bebidas real vs esperada por SNOWFLAKE.ML.FORECAST (entrenado hasta sep-2026) por región y mes, de may-2026 a nov-2026. venta_sin_accion = noviembre si el quiebre sigue igual que en octubre',
    red AS TEC_DEMO.ANALITICA.RED_ABASTO WITH SYNONYMS = ('red de abasto','CEDIS más cercano','distancias','reasignación')
      COMMENT = 'Cada par de CEDIS origen → destino con distancia (km), horas de camión y excedente de Bebidas del origen al 31-oct-2026',
    llamadas AS TEC_DEMO.ANALITICA.LLAMADAS_360 PRIMARY KEY (llamada_id)
      WITH SYNONYMS = ('llamadas','call center','teléfono','llamadas de tiendas','reportes telefónicos')
      COMMENT = 'Una fila por llamada de tienda al call center (13 llamadas, ago-oct 2026): motivo, urgencia y sentimiento por aspecto clasificados con IA sobre la transcripción (03c)'
  )
  RELATIONSHIPS (
    voz_a_temas AS voz (comentario_id) REFERENCES temas
  )
  FACTS (
    ventas.f_venta AS venta_neta, ventas.f_margen AS margen_bruto, ventas.f_unidades AS unidades, ventas.f_tx AS transacciones,
    inventario.f_disponibles AS unidades_disponibles, inventario.f_demanda AS demanda_total,
    inventario.f_dias_quiebre AS dias_sku_quiebre, inventario.f_dias_sku AS dias_sku,
    compras.f_ordenes AS ordenes, compras.f_pedidas AS unidades_pedidas, compras.f_recibidas AS unidades_recibidas,
    compras.f_retraso_total AS retraso_total_dias, compras.f_perfectas AS ordenes_perfectas,
    compras.f_ordenes_recibidas AS ordenes_recibidas COMMENT = 'Órdenes ya recibidas: denominador del retraso promedio',
    competencia.f_brecha_suma AS brecha_suma, competencia.f_observaciones AS observaciones,
    clima.f_temp_suma AS temp_max_suma, clima.f_dias_medidos AS dias_medidos,
    voz.f_calificacion AS calificacion,
    geo.f_tienda AS tienda_id, geo.f_lat AS latitud COMMENT = 'Latitud WGS84 de la tienda',
    geo.f_lon AS longitud COMMENT = 'Longitud WGS84 de la tienda',
    geo.f_geo_venta AS venta_neta, geo.f_geo_bebidas AS venta_bebidas, geo.f_geo_botanas AS venta_botanas,
    pronostico.f_real AS venta_real COMMENT = 'Venta real de Bebidas; nula en noviembre 2026 (aún no ocurre)',
    pronostico.f_esperada AS venta_esperada, pronostico.f_esperada_baja AS esperada_baja, pronostico.f_esperada_alta AS esperada_alta,
    pronostico.f_sin_accion AS venta_sin_accion,
    red.f_km AS distancia_km, red.f_horas AS horas_camion, red.f_excedente AS excedente_origen_unidades,
    red.f_quiebre_origen AS quiebre_origen_pct COMMENT = 'Porcentaje (0-100) de SKUs de Bebidas en quiebre en el CEDIS origen',
    red.f_lat_origen AS lat_origen, red.f_lon_origen AS lon_origen, red.f_lat_destino AS lat_destino, red.f_lon_destino AS lon_destino,
    llamadas.f_llamada AS llamada_id, llamadas.f_duracion AS duracion_seg,
    llamadas.f_urgente AS IFF(urgencia = 'Alta', 1, 0) COMMENT = '1 si la llamada tiene urgencia Alta',
    llamadas.f_logistica_negativa AS IFF(sentimiento_logistica = 'negative', 1, 0) COMMENT = '1 si el sentimiento sobre logística es negativo'
  )
  DIMENSIONS (
    -- Nombres: las dimensiones de calendario y ubicación llevan el prefijo de su tabla (ventas_, inv_, oc_, comp_, clima_,
    -- voz_, geo_, pron_) porque cada tabla tiene su propio mes/región y no se deben mezclar. Las demás llevan su nombre de negocio.
    ventas.ventas_mes AS mes WITH SYNONYMS = ('mes','periodo','fecha'),
    ventas.ventas_region AS region WITH SYNONYMS = ('región','zona')
      SAMPLE_VALUES ('Norte','Bajío','Centro','Sur','Sureste') IS_ENUM,
    ventas.ventas_estado AS estado WITH SYNONYMS = ('estado'),
    ventas.ventas_categoria AS categoria WITH SYNONYMS = ('categoría'),
    ventas.ventas_canal AS canal WITH SYNONYMS = ('canal','formato'),
    ventas.ventas_marca AS marca WITH SYNONYMS = ('marca'),
    ventas.ventas_en_promocion AS en_promocion WITH SYNONYMS = ('en promoción'),
    inventario.inv_mes AS mes, inventario.inv_region AS region, inventario.inv_categoria AS categoria,
    compras.oc_mes AS mes, compras.oc_region AS region, compras.proveedor AS proveedor, compras.oc_categoria AS categoria,
    competencia.comp_mes AS mes, competencia.comp_estado AS estado, competencia.comp_categoria AS categoria,
    competencia.competidor AS competidor, competencia.actividad_observada AS actividad_observada,
    clima.clima_mes AS mes, clima.clima_region AS region, clima.clima_estado AS estado,
    voz.voz_fecha AS fecha, voz.voz_mes AS mes, voz.voz_region AS region, voz.voz_estado AS estado, voz.voz_canal AS canal,
    voz.comentario AS comentario WITH SYNONYMS = ('comentario del tendero','queja') COMMENT = 'Texto libre del tendero',
    voz.voz_calificacion AS calificacion COMMENT = 'Calificación 1-5; 1-2 = queja',
    temas.tema AS tema WITH SYNONYMS = ('tipo de queja','motivo')
      SAMPLE_VALUES ('Desabasto de producto','Entrega y logística','Precio y competencia','Surtido y variedad','Atención y servicio','Crédito y pagos','Producto y promoción') IS_ENUM,
    temas.sentimiento AS sentimiento SAMPLE_VALUES ('positive','neutral','negative') IS_ENUM,
    geo.tienda_id AS tienda_id COMMENT = 'ID único de tienda; agrupa por aquí para mapas de puntos',
    geo.tienda AS tienda WITH SYNONYMS = ('nombre de la tienda'),
    geo.geo_mes AS mes, geo.geo_region AS region, geo.geo_estado AS estado, geo.geo_canal AS canal,
    geo.ciudad AS ciudad WITH SYNONYMS = ('municipio','localidad'),
    geo.h3_cell AS h3_cell WITH SYNONYMS = ('hexágono','celda H3') COMMENT = 'Índice H3 en texto, resolución fija 7 (~5 km²)',
    pronostico.pron_mes AS mes, pronostico.pron_region AS region, pronostico.pron_categoria AS categoria,
    red.cedis_origen AS cedis_origen, red.region_origen AS region_origen,
    red.cedis_destino AS cedis_destino SAMPLE_VALUES ('CEDIS León','CEDIS Monterrey','CEDIS Tultitlán','CEDIS Veracruz','CEDIS Mérida') IS_ENUM,
    red.region_destino AS region_destino,
    llamadas.llamada_fecha AS fecha, llamadas.llamada_mes AS mes, llamadas.llamada_region AS region,
    llamadas.llamada_estado AS estado, llamadas.llamada_ciudad AS ciudad, llamadas.llamada_tienda AS tienda,
    llamadas.llamada_numero AS llamada_id COMMENT = 'Número de llamada (1-13); úsalo para citarla',
    llamadas.motivo_llamada AS categoria WITH SYNONYMS = ('motivo de la llamada','tipo de llamada')
      SAMPLE_VALUES ('Desabasto de producto','Entrega y logística','Sistemas y pagos','Cadena de frío','Calidad y caducidad','Precios y facturación','Insumos de operación') IS_ENUM,
    llamadas.urgencia AS urgencia SAMPLE_VALUES ('Alta','Media','Baja') IS_ENUM,
    llamadas.sentimiento_llamada AS sentimiento SAMPLE_VALUES ('positive','mixed','neutral','negative') IS_ENUM,
    llamadas.sentimiento_logistica AS sentimiento_logistica, llamadas.sentimiento_servicio AS sentimiento_servicio,
    llamadas.sentimiento_producto AS sentimiento_producto,
    llamadas.causa_llamada AS causa COMMENT = 'Causa del problema mencionada en la llamada (AI_EXTRACT)',
    llamadas.resumen_llamada AS resumen COMMENT = 'Resumen de la llamada en dos frases (AI_COMPLETE)',
    llamadas.folio AS folio COMMENT = 'Folio que dictó el agente'
  )
  METRICS (
    ventas.venta_total AS SUM(ventas.f_venta) WITH SYNONYMS = ('venta neta','ventas') COMMENT = 'Venta neta en MXN después de descuentos',
    ventas.margen_total AS SUM(ventas.f_margen) COMMENT = 'Margen bruto en MXN',
    ventas.unidades_vendidas AS SUM(ventas.f_unidades),
    ventas.ticket_promedio AS SUM(ventas.f_venta)/NULLIF(SUM(ventas.f_tx),0) WITH SYNONYMS = ('ticket'),
    inventario.dias_inventario AS SUM(inventario.f_disponibles)/NULLIF(SUM(inventario.f_demanda),0)
      WITH SYNONYMS = ('days of inventory','cobertura') COMMENT = 'Unidades disponibles / demanda diaria',
    inventario.tasa_quiebre AS SUM(inventario.f_dias_quiebre)/NULLIF(SUM(inventario.f_dias_sku),0)
      WITH SYNONYMS = ('out of stock','faltantes') COMMENT = 'Fracción de días-SKU con inventario menor a la demanda',
    compras.retraso_promedio AS SUM(compras.f_retraso_total)/NULLIF(SUM(compras.f_ordenes_recibidas),0)
      COMMENT = 'Días de retraso promedio vs fecha prometida, por orden recibida (una entrega adelantada cuenta 0)',
    compras.fill_rate AS SUM(compras.f_recibidas)/NULLIF(SUM(compras.f_pedidas),0)
      WITH SYNONYMS = ('fill rate ponderado','nivel de surtido') COMMENT = 'Unidades recibidas / unidades pedidas',
    compras.perfect_order_rate AS SUM(compras.f_perfectas)/NULLIF(SUM(compras.f_ordenes),0)
      WITH SYNONYMS = ('OTIF','pedido perfecto') COMMENT = 'Órdenes a tiempo y completas / órdenes',
    competencia.brecha_precio_promedio AS SUM(competencia.f_brecha_suma)/NULLIF(SUM(competencia.f_observaciones),0)
      COMMENT = 'Brecha promedio por observación semanal. Negativo = competidor más barato',
    clima.temperatura_maxima AS SUM(clima.f_temp_suma)/NULLIF(SUM(clima.f_dias_medidos),0)
      COMMENT = 'Temperatura máxima promedio diaria (°C)',
    voz.num_comentarios AS COUNT(voz.f_calificacion) WITH SYNONYMS = ('número de comentarios','número de quejas'),
    voz.calificacion_promedio AS AVG(voz.f_calificacion) WITH SYNONYMS = ('satisfacción','calificación promedio'),
    geo.venta_tienda AS SUM(geo.f_geo_venta) COMMENT = 'Venta neta MXN en la capa geográfica',
    geo.venta_bebidas_tienda AS SUM(geo.f_geo_bebidas) COMMENT = 'Venta de Bebidas MXN en la capa geográfica',
    geo.venta_botanas_tienda AS SUM(geo.f_geo_botanas) COMMENT = 'Venta de Botanas MXN en la capa geográfica',
    geo.num_tiendas AS COUNT(DISTINCT geo.f_tienda) WITH SYNONYMS = ('número de tiendas'),
    geo.latitud_mapa AS ANY_VALUE(geo.f_lat) COMMENT = 'Usar solo agrupando por tienda_id; si no, devuelve un punto arbitrario',
    geo.longitud_mapa AS ANY_VALUE(geo.f_lon) COMMENT = 'Usar solo agrupando por tienda_id; si no, devuelve un punto arbitrario',
    geo.latitud_centro AS AVG(geo.f_lat) COMMENT = 'Centro aproximado al agrupar por ciudad o estado (mapa de burbujas)',
    geo.longitud_centro AS AVG(geo.f_lon) COMMENT = 'Centro aproximado al agrupar por ciudad o estado (mapa de burbujas)',
    pronostico.venta_real_pronostico AS SUM(pronostico.f_real) COMMENT = 'Venta real de Bebidas MXN',
    pronostico.venta_esperada_pronostico AS SUM(pronostico.f_esperada) WITH SYNONYMS = ('venta esperada','debimos vender')
      COMMENT = 'Venta de Bebidas MXN que el modelo esperaba sin el quiebre',
    pronostico.brecha_vs_pronostico AS SUM(pronostico.f_esperada) - SUM(pronostico.f_real) WITH SYNONYMS = ('venta perdida','costo del quiebre')
      COMMENT = 'Esperado - real en MXN. Solo tiene sentido en meses con venta real (oct-2026)',
    pronostico.venta_en_riesgo AS SUM(pronostico.f_esperada) - SUM(pronostico.f_sin_accion) WITH SYNONYMS = ('pérdida si no actuamos','en riesgo')
      COMMENT = 'Noviembre 2026: esperado - escenario sin acción, en MXN',
    red.distancia_minima_km AS MIN(red.f_km) COMMENT = 'Distancia en línea recta en km',
    red.horas_camion_min AS MIN(red.f_horas) COMMENT = 'Horas de camión estimadas (km × 1.25 / 65 km/h)',
    red.excedente_unidades AS SUM(red.f_excedente) COMMENT = 'Unidades de Bebidas disponibles en el origen por arriba de 7 días de demanda',
    llamadas.num_llamadas AS COUNT(llamadas.f_llamada) WITH SYNONYMS = ('número de llamadas','llamadas recibidas'),
    llamadas.llamadas_urgentes AS SUM(llamadas.f_urgente) COMMENT = 'Llamadas con urgencia Alta',
    llamadas.llamadas_logistica_negativa AS SUM(llamadas.f_logistica_negativa) COMMENT = 'Llamadas con sentimiento negativo sobre logística',
    llamadas.minutos_llamada AS SUM(llamadas.f_duracion) / 60 COMMENT = 'Minutos de audio'
  )
  COMMENT = 'Modelo semántico comercial y de cadena de suministro de Abarrotera del Centro (ficticia)'
  AI_SQL_GENERATION 'Los datos cubren de noviembre 2024 a octubre 2026 (el pronóstico llega a noviembre 2026). Si el usuario dice un mes sin año, usa el más reciente (por ejemplo "octubre" = octubre 2026). Las regiones se escriben exactamente Norte, Bajío, Centro, Sur, Sureste. Redondea porcentajes a 1 decimal y montos a pesos enteros. Para preguntas sobre qué dicen los tenderos o clientes usa la tabla voz: agrupa por comentario, ordena por número de comentarios y filtra calificacion <= 2 si se pregunta por quejas. Para quejas por tema o tipo usa la dimensión tema de la tabla temas.
Pronóstico (tabla pronostico): para cuánto debimos vender o cuánto perdimos en octubre usa venta_esperada y venta_real del mes 2026-10-01; para cuánto vamos a perder en noviembre si no actuamos usa venta_esperada - venta_sin_accion del mes 2026-11-01.
Red de abasto (tabla red): para el CEDIS más cercano o desde dónde reasignar, filtra cedis_destino y ordena por distancia_km ascendente; incluye horas_camion, excedente_origen_unidades y quiebre_origen_pct.
Mapas (tabla geo): para un mapa de puntos devuelve tienda_id, tienda, latitud y longitud y agrupa SIEMPRE por tienda_id, nunca solo por nombre. Para un mapa de hexágonos devuelve h3_cell y la métrica (resolución fija 7; no inventes otra). Para un mapa por ciudad agrupa por ciudad y estado (hay ciudades con el mismo nombre en estados distintos) y usa AVG de latitud y longitud. Usa nombres de columna latitud y longitud en el resultado. Para un cambio porcentual entre meses calcula SUM(IFF(mes = nuevo, x, 0)) / NULLIF(SUM(IFF(mes = anterior, x, 0)), 0) - 1. Limita mapas a 2,000 filas como máximo.
Llamadas del call center (tabla llamadas): para qué reportaron las tiendas por teléfono filtra llamada_region y llamada_mes y devuelve llamada_id, llamada_fecha, llamada_ciudad, motivo_llamada, urgencia, sentimiento_logistica, causa_llamada y resumen_llamada. Las llamadas son pocas (13): no calcules porcentajes sobre ellas, cuéntalas.'
  -- Verified queries: el SQL usa los nombres de la Semantic View (facts f_*, dimensiones ventas_*/oc_*/inv_*/voz_*/geo_*/pron_*), no las columnas físicas
  AI_VERIFIED_QUERIES (
    vq_ventas_bajio AS (
      QUESTION '¿Cómo evolucionaron las ventas del Bajío en los últimos 4 meses?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT ventas_mes AS mes, SUM(f_venta) AS venta_neta FROM ventas WHERE ventas_region = ''Bajío'' AND ventas_mes BETWEEN ''2026-07-01'' AND ''2026-10-01'' GROUP BY ventas_mes ORDER BY ventas_mes'
    ),
    vq_proveedor_bajio AS (
      QUESTION '¿Qué proveedor tuvo peor perfect order rate en el Bajío en octubre?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT proveedor, SUM(f_perfectas) / NULLIF(SUM(f_ordenes), 0) AS perfect_order_rate, SUM(f_recibidas) / NULLIF(SUM(f_pedidas), 0) AS fill_rate FROM compras WHERE oc_region = ''Bajío'' AND oc_mes = ''2026-10-01'' GROUP BY proveedor ORDER BY perfect_order_rate ASC LIMIT 5'
    ),
    vq_quiebre_region AS (
      QUESTION '¿Cuál fue la tasa de quiebre de bebidas por región en octubre?'
      SQL 'SELECT inv_region AS region, SUM(f_dias_quiebre) / NULLIF(SUM(f_dias_sku), 0) AS tasa_quiebre FROM inventario WHERE inv_categoria = ''Bebidas'' AND inv_mes = ''2026-10-01'' GROUP BY inv_region ORDER BY tasa_quiebre DESC'
    ),
    vq_voz_bajio AS (
      QUESTION '¿Qué dicen los tenderos del Bajío en octubre?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT comentario, COUNT(f_calificacion) AS num_comentarios, AVG(f_calificacion) AS calificacion_promedio FROM voz WHERE voz_region = ''Bajío'' AND voz_mes = ''2026-10-01'' AND voz_calificacion <= 2 GROUP BY comentario ORDER BY num_comentarios DESC LIMIT 6'
    ),
    vq_temas_bajio AS (
      QUESTION '¿Cuántas quejas hubo por tema en el Bajío en octubre?'
      SQL 'SELECT tema, COUNT(f_calificacion) AS quejas, AVG(f_calificacion) AS calificacion_promedio FROM voz JOIN temas ON voz.comentario_id = temas.comentario_id WHERE voz_region = ''Bajío'' AND voz_mes = ''2026-10-01'' AND voz_calificacion <= 2 GROUP BY tema ORDER BY quejas DESC'
    ),
    vq_pronostico_bajio AS (
      QUESTION '¿Cuánto vendimos de Bebidas en el Bajío contra lo esperado y cuánto vamos a perder en noviembre si no actuamos?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT pron_mes AS mes, SUM(f_real) AS venta_real, SUM(f_esperada) AS venta_esperada, SUM(f_esperada) - SUM(f_real) AS brecha, SUM(f_sin_accion) AS venta_sin_accion, SUM(f_esperada) - SUM(f_sin_accion) AS venta_en_riesgo FROM pronostico WHERE pron_region = ''Bajío'' AND pron_mes IN (''2026-10-01'', ''2026-11-01'') GROUP BY pron_mes ORDER BY pron_mes'
    ),
    vq_cedis_cercano AS (
      QUESTION '¿Desde qué CEDIS conviene reasignar Bebidas al CEDIS León?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT cedis_origen, region_origen, f_km AS distancia_km, f_horas AS horas_camion, f_excedente AS excedente_origen_unidades, f_quiebre_origen AS quiebre_origen_pct, f_lat_origen AS lat_origen, f_lon_origen AS lon_origen, f_lat_destino AS lat_destino, f_lon_destino AS lon_destino FROM red WHERE cedis_destino = ''CEDIS León'' ORDER BY distancia_km'
    ),
    vq_mapa_ciudades AS (
      QUESTION 'Muestra en un mapa por ciudad cuánto cambió la venta de Bebidas de septiembre a octubre'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT ciudad, geo_estado AS estado, geo_region AS region, AVG(f_lat) AS latitud, AVG(f_lon) AS longitud, COUNT(DISTINCT f_tienda) AS tiendas, SUM(IFF(geo_mes = ''2026-10-01'', f_geo_bebidas, 0)) AS bebidas_oct, SUM(IFF(geo_mes = ''2026-10-01'', f_geo_bebidas, 0)) / NULLIF(SUM(IFF(geo_mes = ''2026-09-01'', f_geo_bebidas, 0)), 0) - 1 AS cambio_bebidas FROM geo WHERE geo_mes IN (''2026-09-01'', ''2026-10-01'') GROUP BY ciudad, geo_estado, geo_region ORDER BY cambio_bebidas'
    ),
    vq_mapa_tiendas_bajio AS (
      QUESTION 'Muestra en un mapa las tiendas del Bajío con su venta de Bebidas de octubre'
      SQL 'SELECT tienda_id, tienda, ciudad, ANY_VALUE(f_lat) AS latitud, ANY_VALUE(f_lon) AS longitud, SUM(f_geo_bebidas) AS venta_bebidas FROM geo WHERE geo_region = ''Bajío'' AND geo_mes = ''2026-10-01'' GROUP BY tienda_id, tienda, ciudad ORDER BY tienda_id LIMIT 2000'
    ),
    vq_mapa_hexagonos AS (
      QUESTION 'Mapa de hexágonos H3 con la venta total de octubre'
      SQL 'SELECT h3_cell, SUM(f_geo_venta) AS venta_neta, COUNT(DISTINCT f_tienda) AS tiendas FROM geo WHERE geo_mes = ''2026-10-01'' GROUP BY h3_cell ORDER BY venta_neta DESC LIMIT 2000'
    ),
    vq_llamadas_bajio AS (
      QUESTION '¿Qué reportaron por teléfono las tiendas del Bajío en octubre?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT llamada_numero AS llamada_id, llamada_fecha AS fecha, llamada_ciudad AS ciudad, motivo_llamada AS categoria, urgencia, sentimiento_logistica, causa_llamada AS causa, resumen_llamada AS resumen FROM llamadas WHERE llamada_region = ''Bajío'' AND llamada_mes = ''2026-10-01'' ORDER BY llamada_fecha'
    )
  );

-- [grant_sv_director]
-- CREATE OR REPLACE quita los permisos: se vuelven a otorgar (al rol funcional que heredan los 3 roles)
GRANT SELECT ON SEMANTIC VIEW SV_COMERCIAL TO ROLE LECTOR_COMERCIAL;

-- ======================================================================
-- Después: consultar la Semantic View con SQL
-- ======================================================================

-- [peores_proveedores]
SELECT * FROM SEMANTIC_VIEW(TEC_DEMO.ANALITICA.SV_COMERCIAL
  METRICS compras.perfect_order_rate, compras.fill_rate
  DIMENSIONS compras.proveedor
  WHERE compras.oc_region = 'Bajío' AND compras.oc_mes = '2026-10-01')
ORDER BY perfect_order_rate LIMIT 5;

-- [llamadas_sv]
SELECT * FROM SEMANTIC_VIEW(TEC_DEMO.ANALITICA.SV_COMERCIAL
  METRICS llamadas.num_llamadas, llamadas.llamadas_logistica_negativa, llamadas.llamadas_urgentes
  DIMENSIONS llamadas.llamada_region, llamadas.motivo_llamada
  WHERE llamadas.llamada_mes = '2026-10-01')
ORDER BY num_llamadas DESC;
