# datos/ · Archivos del workshop

CSV gzip con encabezado, separados por comas, con comillas dobles opcionales, `\N` = NULL y UTF-8. Los lee `TEC_DEMO.RAW.CSV_GZ`.

| Carpeta | Tabla destino | Filas |
|---|---|---|
| raw/regiones | RAW.REGIONES (estados como JSON → ARRAY) | 5 |
| raw/cedis | RAW.CEDIS (la columna GEO se calcula con ST_MAKEPOINT) | 5 |
| raw/ciudades | RAW.CIUDADES | 93 |
| raw/tiendas | RAW.TIENDAS | 20,000 |
| raw/productos | RAW.PRODUCTOS | 1,200 |
| raw/proveedores | RAW.PROVEEDORES | 40 |
| raw/promociones | RAW.PROMOCIONES | 6 |
| raw/ventas (8 partes) | RAW.VENTAS | 10,000,000 |
| raw/inventario_diario | RAW.INVENTARIO_DIARIO | 4,380,000 |
| raw/ordenes_compra | RAW.ORDENES_COMPRA | 250,600 |
| raw/precios_competencia | RAW.PRECIOS_COMPETENCIA | 54,288 |
| raw/clima | RAW.CLIMA | 21,170 |
| raw/feedback_clientes | RAW.FEEDBACK_CLIENTES | 60,000 |
| raw/llamadas | RAW.LLAMADAS (catálogo: una fila por mp3 de `audios/`, ligada a una tienda real) | 13 |
| referencia/temas_comentario | ANALITICA.TEMAS_COMENTARIO (AI_CLASSIFY + AI_SENTIMENT) | 16 |
| referencia/pronostico_diario | ANALITICA.PRONOSTICO_DIARIO (ML.FORECAST oct–nov 2026) | 305 |
| referencia/documentos | AGENTES.DOCUMENTOS (respaldo; `05_search` los crea igual) | 4 |
| referencia/llamadas_analizadas | ANALITICA.LLAMADAS_ANALIZADAS (AI_TRANSCRIBE + AI_CLASSIFY + AI_SENTIMENT + AI_EXTRACT + AI_COMPLETE; segmentos y extraccion en JSON) | 13 |
| control/control.csv | RAW.CONTROL_CARGA: filas y suma de control por tabla | 18 |

## audios/ · llamadas del call center

13 mp3 (mono, 44.1 kHz, 128 kbps; 3.6 a 6.1 minutos cada uno, 66 min en total). `01_datos` los copia al stage `TEC_DEMO.RAW.AUDIOS` (cifrado `SNOWFLAKE_SSE`, requisito de `AI_TRANSCRIBE`) y `03c_call_center` los analiza.

| Llamada | Fecha | Ciudad (región) | Motivo |
|---|---|---|---|
| 01 faltante_cedis | 14-sep | Guadalajara (Bajío) | Tarimas faltantes en una entrega |
| 02 terminal_bancaria | 9-oct | Monterrey (Norte) | Terminales bancarias sin conexión |
| 03 cuarto_frio | 21-ago | Mérida (Sureste) | Falla del cuarto frío |
| 04 producto_caducado | 16-oct | Puebla (Centro) | Galletas y cereal caducados |
| 05 discrepancia_precios | 27-oct | Iztapalapa (Centro) | Precio de anaquel vs caja |
| 06 proveedor_directo_retraso | 12-ago | Hermosillo (Norte) | Agua y hielo sin entregar |
| 07 insumos_empaque | 8-sep | Querétaro (Bajío) | Rollos de ticket y bolsas |
| 08 merma_transito | 20-oct | Veracruz (Sur) | Tarima dañada en tránsito |
| 09 sistema_caido_corte | 2-oct | Tijuana (Norte) | POS caído en el corte |
| 10 facturacion_mayoreo | 23-sep | León (Bajío) | Factura con precio y RFC incorrectos |
| **11 quiebre_bebidas_leon** | **6-oct** | **León (Bajío)** | **Refresco y agua sin surtir; CEDIS León y Proveedor 07** |
| **12 fin_promocion_queretaro** | **14-oct** | **Querétaro (Bajío)** | **Fin de "Verano refrescante" y faltantes de bebidas** |
| **13 competencia_aguascalientes** | **22-oct** | **Aguascalientes (Bajío)** | **Bebidas agotadas, Competidor A y reabasto desde Tultitlán** |

`audios/guiones/` trae el guion de cada llamada (la "verdad" contra la que se revisa la IA) y `generar_audios.py`, que los convierte en mp3 con voces neuronales (`edge-tts` + `ffmpeg`). Si cambias un audio, vuelve a generar `referencia/llamadas_analizadas` y `control.csv` desde la cuenta del instructor.

Se exportaron de la cuenta del instructor (`TEC_DEMO`) con `COPY INTO @stage`. No los edites: `00b_validacion` compara contra `control.csv`.
