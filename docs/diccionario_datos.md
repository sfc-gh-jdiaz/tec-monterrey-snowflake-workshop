# Diccionario de datos · `TEC_DEMO`

Todas las tablas del kit, con su grano, número de filas y columnas tal como están en Snowflake. Las cifras de filas son las de una instalación completa (verificadas con `00b_validacion`). Términos y cálculos: [`glosario.md`](glosario.md).

**Políticas:** `RAP` = Row Access Policy `RAP_REGION` (cada rol ve solo sus regiones). `MASK` = Masking Policy `MASK_PII` (datos personales parciales para gerentes). `DMF` = Data Metric Functions de calidad (`03_gobierno`).

## `RAW` · datos de origen (cargados desde `datos/raw/`)

Solo los lee `TEC_ADMIN`. Los roles de negocio no tienen acceso a `RAW`; consumen `ANALITICA`.

| Tabla | Grano | Filas | Columnas | Calidad |
| --- | --- | --- | --- | --- |
| `REGIONES` | región | 5 | region, estados (ARRAY), cedis | |
| `CEDIS` | centro de distribución | 5 | cedis_id, nombre, region, latitud, longitud, geo (GEOGRAPHY) | |
| `CIUDADES` | ciudad | 93 | estado, ciudad, latitud, longitud, peso, lada | |
| `TIENDAS` | tienda | 20,000 | tienda_id, region, estado, canal, nombre, contacto, telefono, email, ciudad, colonia, direccion, latitud, longitud | DMF: tienda_id único, region no nula |
| `PRODUCTOS` | SKU | 1,200 | producto_id, categoria, sku, marca, precio_lista NUMBER(12,2), costo_pct | |
| `PROVEEDORES` | proveedor | 40 | proveedor_id, nombre, categoria, lead_time_dias | |
| `PROMOCIONES` | promoción | 6 | promo_id, region, categoria, inicio, fin, descuento, descripcion | |
| `VENTAS` | línea de venta | 10,000,000 | venta_id, fecha, tienda_id, producto_id, cantidad, precio_unitario NUMBER(12,2), costo_unitario NUMBER(12,2), promo_id, forma_pago | DMF: precio no nulo, venta_id único, precio > 0 y costo ≤ precio, tienda existe en `TIENDAS` |
| `INVENTARIO_DIARIO` | día × CEDIS × SKU | 4,380,000 | fecha, cedis_id, region, producto_id, categoria, demanda_diaria, unidades_disponibles, en_quiebre | DMF: unidades_disponibles no nula |
| `ORDENES_COMPRA` | orden de compra | 250,600 | oc_id, fecha_orden, proveedor_id, proveedor, categoria, cedis_id, region, unidades_pedidas, fecha_prometida, fecha_recepcion, unidades_recibidas | |
| `PRECIOS_COMPETENCIA` | semana × estado × categoría × competidor | 54,288 | semana, region, estado, categoria, competidor, brecha_vs_propio, actividad_observada (nula si no se observó nada) | |
| `CLIMA` | día × estado | 21,170 | fecha, region, estado, temp_max_c, lluvia_mm | |
| `FEEDBACK_CLIENTES` | comentario de tendero | 60,000 | feedback_id, fecha, region, estado, canal, email_cliente, comentario, calificacion (1-5) | DMF: feedback_id único, comentario no nulo |
| `LLAMADAS` | llamada al call center | 13 | llamada_id, archivo (mp3 en `@RAW.AUDIOS`), fecha, tienda_id, region, estado, ciudad, tienda, agente, duracion_seg | |

**Stages**

| Stage | Contenido |
| --- | --- |
| `DATOS_CSV` | Los 26 CSV de `datos/` (`raw/`, `referencia/`, `control/`) |
| `AUDIOS` | Las 13 llamadas mp3 de `datos/audios/`. Cifrado `SNOWFLAKE_SSE` (requisito de `AI_TRANSCRIBE`) y tabla de directorio. Ningún rol de negocio lo lee: la app entrega enlaces temporales de 10 min por región |

**Tablas de control de la carga**

| Tabla | Para qué sirve |
| --- | --- |
| `CONTROL_CARGA` | Copia de `datos/control/control.csv`: filas y suma de control esperadas por tabla |
| `HUELLA_CARGA` | Cómo se carga y verifica cada tabla: esquema destino, carpeta del stage, columnas y expresión de la suma de control. La usan `CARGAR_CSV`, `CARGAR_TODO` y `VERIFICAR_HUELLA` |

## `ANALITICA` · capa de consumo

Los roles de negocio la leen a través de `LECTOR_COMERCIAL`. Las Dynamic Tables tienen `TARGET_LAG = '1 day'`.

| Objeto | Tipo | Grano | Filas | Columnas | Políticas |
| --- | --- | --- | --- | --- | --- |
| `VENTAS_ENRIQUECIDAS` | Dynamic Table | línea de venta | 10,000,000 | venta_id, fecha, mes, tienda_id, tienda, region, estado, canal, contacto, telefono, email, categoria, sku, marca, cantidad, precio_unitario, venta_neta, margen_bruto, en_promocion, forma_pago, ciudad, latitud, longitud | RAP, MASK (contacto, telefono, email) |
| `VENTAS_MENSUALES` | Dynamic Table | mes × estado × categoría × canal × marca × promoción | 66,864 | mes, region, estado, categoria, canal, marca, en_promocion, venta_neta, margen_bruto, unidades, transacciones | RAP |
| `TIENDAS_GEO` | Dynamic Table | tienda × mes | 480,000 | tienda_id, tienda, region, estado, ciudad, canal, latitud, longitud, h3_cell (resolución 7), mes, venta_neta, venta_bebidas, venta_botanas | RAP |
| `INVENTARIO_MENSUAL` | Dynamic Table | mes × región × categoría | 720 | mes, region, categoria, unidades_disponibles, demanda_total, dias_sku_quiebre, dias_sku | RAP |
| `INVENTARIO_SEMANAL` | Dynamic Table | semana × región × categoría | 3,150 | semana, region, categoria, dias_sku_quiebre, dias_sku, unidades_faltantes | RAP |
| `QUIEBRE_SKU_MENSUAL` | Dynamic Table | mes × región × SKU | 144,000 | mes, region, categoria, producto_id, dias_quiebre | RAP |
| `COMPRAS_MENSUALES` | Dynamic Table | mes × región × proveedor × categoría | 4,800 | mes, region, proveedor, categoria, ordenes, unidades_pedidas, unidades_recibidas, retraso_total_dias, ordenes_perfectas, ordenes_recibidas | RAP |
| `COMPETENCIA_MENSUAL` | Dynamic Table | mes × estado × categoría × competidor | 12,528 | mes, region, estado, categoria, competidor, actividad_observada (la más frecuente del mes), brecha_suma, observaciones | RAP |
| `CLIMA_MENSUAL` | Dynamic Table | mes × estado | 696 | mes, region, estado, lluvia_total_mm, temp_max_suma, dias_medidos | RAP |
| `VOZ_CLIENTE` | Dynamic Table | comentario | 60,000 | feedback_id, fecha, mes, region, estado, canal, comentario, calificacion, comentario_id (= HASH(comentario)) | RAP |
| `TEMAS_COMENTARIO` | Tabla (referencia) | texto distinto de comentario | 16 | comentario, tema, sentimiento, comentario_id | Sin RAP: no tiene región; se cruza con `VOZ_CLIENTE` por comentario_id |
| `BEBIDAS_DIARIAS` | Tabla | día × región | 3,650 | region, ts, venta | RAP |
| `PRONOSTICO_DIARIO` | Tabla (referencia) | día × región | 305 | region, ts, venta_esperada, lower_bound, upper_bound | RAP |
| `PRONOSTICO_MENSUAL` | Tabla | mes × región | 35 | region, mes, categoria, venta_real, venta_esperada, esperada_baja, esperada_alta, venta_sin_accion (solo nov-2026) | RAP |
| `RED_ABASTO` | Tabla | par de CEDIS origen → destino | 20 | cedis_origen, region_origen, cedis_destino, region_destino, distancia_km, horas_camion, excedente_origen_unidades, quiebre_origen_pct, lat/lon de origen y destino | RAP sobre region_destino |
| `LLAMADAS_ANALIZADAS` | Tabla (referencia) | llamada | 13 | llamada_id, transcripcion, segmentos (VARIANT: arreglo de turnos `{inicio, fin, hablante, texto}`), duracion_seg, categoria, sentimiento, sentimiento_logistica, sentimiento_servicio, sentimiento_producto, extraccion (VARIANT: producto_afectado, compromiso, plazo, causa, folio), resumen, urgencia | Sin RAP: no tiene región y solo la lee `TEC_ADMIN` |
| `LLAMADAS_360` | Tabla | llamada | 13 | llamada_id, fecha, mes, region, estado, ciudad, tienda_id, tienda, agente, duracion_seg, categoria, urgencia, sentimiento (general y por aspecto), producto_afectado, causa, compromiso, plazo, folio, resumen, transcripcion, segmentos, archivo | RAP |
| `PARAMETROS` | Tabla | parámetro | 5 | parametro, valor, descripcion: las fechas de la historia | |
| `ACCESO_REGION` | Tabla | rol × región | 5 | rol, region (`*` = todas). La lee `RAP_REGION` | |
| `SV_COMERCIAL` | Semantic View | | | 11 tablas lógicas (ventas, inventario, compras, competencia, clima, voz, temas, geo, pronostico, red, llamadas) sobre los objetos de arriba; la usa el agente | |

Las tablas con sufijo `_EN_VIVO` (por ejemplo `TEMAS_COMENTARIO_EN_VIVO` de `03b` o `TRANSCRIPCIONES_EN_VIVO` y `LLAMADAS_ANALIZADAS_EN_VIVO` de `03c`) son el resultado de correr la IA en tu cuenta; no alimentan las cifras oficiales.

## `AGENTES` · agente, búsqueda y Telegram

| Objeto | Tipo | Para qué sirve |
| --- | --- | --- |
| `AGENTE_COMERCIAL` | Cortex Agent | Agente publicado en CoWork y embebido en la app |
| `DOCUMENTOS` | Tabla (referencia, 4 filas) | doc_id, titulo, contenido: políticas y procedimientos que consulta el agente |
| `BUSQUEDA_DOCUMENTOS` | Cortex Search | Índice de `DOCUMENTOS` |
| `BUSQUEDA_FEEDBACK` | Cortex Search | Comentarios de todas las regiones (solo `DIRECTOR_COMERCIAL`) |
| `BUSQUEDA_FEEDBACK_BAJIO`, `BUSQUEDA_FEEDBACK_NORTE` | Cortex Search | Un índice por región, otorgado solo al rol de esa región |
| `LLAMADAS_TURNOS` | Tabla | Un turno por fila de las 13 llamadas (llamada_id, turno, segundo, hablante, texto, región, ciudad, tienda, categoría). Fuente de los índices de llamadas; no se otorga a roles de negocio |
| `BUSQUEDA_LLAMADAS` | Cortex Search | Lo que se dijo en las llamadas, con el segundo del audio (solo `DIRECTOR_COMERCIAL`) |
| `BUSQUEDA_LLAMADAS_BAJIO`, `BUSQUEDA_LLAMADAS_NORTE` | Cortex Search | Un índice de llamadas por región, otorgado solo al rol de esa región |
| `TELEGRAM_USUARIOS` | Tabla | chat_id registrados: el bot solo envía a estos chats |
| `TELEGRAM_ESTADO` | Tabla | Último mensaje procesado por el bot |

## `APPS`

| Objeto | Tipo | Para qué sirve |
| --- | --- | --- |
| `ABARROTERA_360` | Application Service | La app de `app/abarrotera-bi` |
