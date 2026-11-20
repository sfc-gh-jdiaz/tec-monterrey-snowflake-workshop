# Glosario del kit

Términos de negocio y técnicos que aparecen en los notebooks, la Semantic View `TEC_DEMO.ANALITICA.SV_COMERCIAL`, la app y las respuestas del agente. Algunos se quedan en inglés porque así se usan en la industria; aquí está su significado y cómo se calculan.

## Términos que se quedan en inglés

| Término | Significado | Cálculo en el kit |
| --- | --- | --- |
| fill rate | Nivel de surtido: qué parte de lo pedido llegó | unidades recibidas / unidades pedidas (`compras.fill_rate`) |
| perfect order rate | Pedido perfecto (también OTIF, *on time in full*): a tiempo y completo | órdenes recibidas a tiempo y completas / órdenes (`compras.perfect_order_rate`) |
| sell-out | Venta del distribuidor a la tienda (lo que registra `RAW.VENTAS`) | `ventas.venta_total` |
| out of stock / quiebre | Un SKU no alcanza la demanda del día en un CEDIS | días-SKU en quiebre / días-SKU (`inventario.tasa_quiebre`) |
| days of inventory | Cobertura: días que alcanza el inventario | unidades disponibles / demanda diaria (`inventario.dias_inventario`) |
| SKU | Producto individual (código de artículo) | `RAW.PRODUCTOS.sku` |
| forecast | Pronóstico con `SNOWFLAKE.ML.FORECAST`, entrenado hasta el 30-sep-2026 | `pronostico.venta_esperada_pronostico` |
| H3 | Rejilla de hexágonos de Uber; el kit usa resolución 7 (~5 km²) | `H3_LATLNG_TO_CELL_STRING(lat, lon, 7)` |
| RAP / masking | Row Access Policy (filas por región) y Masking Policy (datos personales) | `RAP_REGION`, `MASK_PII` |
| DMF | Data Metric Function: métrica de calidad que Snowflake evalúa contra una expectativa | `03_gobierno`, celda `calidad_dmf` |
| diarización | Separar quién habla en un audio. `AI_TRANSCRIBE` con `timestamp_granularity = 'speaker'` regresa un turno por cambio de hablante con su inicio y fin en segundos | `03c_call_center`, celda `transcripcion` |
| presigned URL | Enlace temporal firmado a un archivo de un stage (`GET_PRESIGNED_URL`); la app lo usa para reproducir el audio sin dar acceso al stage | `/api/llamadas/<id>`, 10 minutos |

## Términos de negocio

| Término | Significado |
| --- | --- |
| CEDIS | Centro de distribución. Hay 5, uno por región (`RAW.CEDIS`) |
| Bajío | Región de la historia: Guanajuato, Querétaro, Aguascalientes, San Luis Potosí, Jalisco, Michoacán y Zacatecas (`RAW.REGIONES`). Su CEDIS es León |
| venta perdida | Esperado − real en octubre 2026 (`pronostico.brecha_vs_pronostico`) |
| venta en riesgo | Noviembre 2026: esperado − escenario si el quiebre sigue igual (`pronostico.venta_en_riesgo`) |
| excedente | Unidades de Bebidas de un CEDIS por arriba de 7 días de demanda, al 31-oct-2026 (`RED_ABASTO`) |
| brecha de precio | Precio del competidor vs el propio; negativo = el competidor es más barato |
| queja | Comentario de tendero con calificación 1 o 2 |
| llamada urgente | Llamada al call center con urgencia **Alta** (`AI_CLASSIFY`): la tienda ya pierde ventas o clientes (`llamadas.llamadas_urgentes`) |
| turno | Fragmento de una llamada dicho por un solo hablante (`Agente`, `Tienda` o `Llamada` si no se pudo separar), con su segundo de inicio |

## Convención de nombres en la Semantic View

- **Facts** (`f_*`): columnas numéricas crudas que se suman; nunca se muestran solas.
- **Dimensiones de calendario y ubicación**: llevan el prefijo de su tabla, porque cada tabla tiene su propio mes y región y no se deben mezclar: `ventas_`, `inv_` (inventario), `oc_` (órdenes de compra), `comp_` (competencia), `clima_`, `voz_`, `geo_`, `pron_` (pronóstico), `llamada_` (call center). Por ejemplo `ventas_mes`, `inv_region`, `oc_mes`, `llamada_mes`.
- **Dimensiones propias de una tabla** (`proveedor`, `competidor`, `tema`, `ciudad`, `cedis_origen`...): sin prefijo, porque solo existen en esa tabla.
- **Métricas**: nombre de negocio en español (`venta_total`, `tasa_quiebre`), salvo los términos de la industria de la tabla de arriba (`fill_rate`, `perfect_order_rate`).
- **Tasas y promedios**: siempre `SUM(numerador) / SUM(denominador)`, para que sean correctos a cualquier nivel de agregación (nunca promedio de promedios).

## Fechas de la historia

Las fechas viven en `TEC_DEMO.ANALITICA.PARAMETROS` (notebooks) y en `app/abarrotera-bi/lib/constants.ts` (app), con los mismos valores:

| Parámetro | Valor | Uso |
| --- | --- | --- |
| corte_entrenamiento | 2026-09-30 | Último día con el que se entrena el pronóstico |
| mes_analisis | 2026-10-01 | Mes de la caída de Bebidas en el Bajío |
| mes_pronostico | 2026-11-01 | Escenario "si no actuamos" |
| inicio_pronostico | 2026-05-01 | Inicio de la comparación real vs esperado |
| fecha_inventario | 2026-10-31 | Foto de inventario para la red de abasto |
