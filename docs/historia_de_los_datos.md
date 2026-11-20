# La historia escondida en los datos (para el presentador)
Empresa ficticia: **Abarrotera del Centro S.A.** · 20,000 tiendas · 1,200 SKUs · 5 CEDIS · 40 proveedores · 24 meses (nov-2024 a oct-2026).

| Tabla | Filas (ESCALA 1) |
|---|---|
| VENTAS | 10,000,000 (ESCALA 5 = 50M; hasta 100M) |
| INVENTARIO_DIARIO | 4,380,000 |
| ORDENES_COMPRA | 250,600 |
| PRECIOS_COMPETENCIA | 54,288 |
| FEEDBACK_CLIENTES | 60,000 |
| CLIMA | 21,170 |
| CIUDADES | 93 ciudades reales en 29 estados (coordenadas WGS84, lada y peso por población) |
| TIENDAS | 20,000 con contacto, teléfono, email, dirección y latitud/longitud (ciudad real ± ~2 km) |
| LLAMADAS | 13 llamadas grabadas de tiendas al call center (66 min de audio mp3, ago–oct 2026), ligadas a tiendas reales de `TIENDAS` |

Generación 100% reproducible: misma ESCALA = mismas cifras (después de cada JOIN se usa `HASH(llave, semilla)` en lugar de `RANDOM`).
Nombres, formatos de email y dominios inspirados en los catálogos de `JMDI_SNOW.RAW` (embebidos en `01_datos`, el lab no depende de esa base).

## Patrones normales (para preguntas libres del público)
Crecimiento ~8% anual · Bebidas +35% de abril a agosto · El Buen Fin +40% y diciembre +25% · fines de semana +20% · quincenas +15% · promociones +25% de volumen · ~3% de días-SKU en quiebre en cualquier CEDIS.

## La caída del Bajío · octubre 2026 (causa raíz en cadena)
1. **Ventas:** Bebidas en el Bajío caen **−31.6%** vs septiembre ($23.1 M → $15.8 M). El Bajío total cae −1.2% mientras las otras regiones crecen ~+5% (Bebidas: Centro +4.6%, Norte +4.1%, Sur +8.2%, Sureste +3.6%). Botanas en Guanajuato −16.2%.
   - **En el mapa (`04b_mapas`):** las 24 ciudades del Bajío caen entre −20% y −45% (peor: Soledad de Graciano Sánchez −45.1%, Guanajuato −44.9%, Irapuato −43.8%); las otras 69 ciudades van de −14% a +35%. En la frontera Bajío–Centro el hexágono típico cae −30.8% contra +6.1%.
2. **Inventario:** el CEDIS León tiene **34.6%** de días-SKU de Bebidas en quiebre (otras regiones 2.7%). Supera el umbral de 20% del procedimiento de abasto.
3. **Proveedor:** el **Proveedor 07 Insumos** (Bebidas) falla en León desde el 20-sep: en octubre solo **21.6%** de sus órdenes son perfectas, **fill rate 72.6%** y 8.0 días de retraso promedio (10.1 días en las órdenes tardías). Antes era un proveedor confiable.
4. **Promoción:** "Verano refrescante Bajío" terminó el 30-sep (la política espera −10 a −20% el primer mes).
5. **Competencia:** el Competidor A está **~12% más barato** en botanas en Guanajuato (3x2 en conveniencia) desde el 5-oct.
6. **Clima:** el Bajío estuvo **~3 °C** por debajo de octubre del año anterior.
7. **Voz del cliente:** 328 quejas de tenderos del Bajío en octubre (calificación 1–2): falta de refresco y surtido incompleto. Clasificadas con IA, 274 son por desabasto.
8. **Call center:** las **3 llamadas del Bajío en octubre** (León 6-oct, Querétaro 14-oct, Aguascalientes 22-oct) salen con **sentimiento negativo en Logística**, y 2 se clasifican como **Desabasto de producto** con urgencia Alta. Con sus palabras repiten la cadena: CEDIS León sin bebidas, Proveedor 07 fallando desde el 20-sep, fin de "Verano refrescante Bajío", Competidor A 12% más barato en botanas, frío atípico. Aguascalientes ya pide producto **desde Tultitlán**.

**Lo que debería recomendar el agente:** reasignar inventario desde otro CEDIS en 72 h (quiebre > 20%), activar un proveedor alterno (más de 7 días de retraso) y responder a la promoción del Competidor A en Guanajuato.

## Inteligencia (`03b_inteligencia`)
- **IA sobre texto:** `AI_CLASSIFY` y `AI_SENTIMENT` clasifican los 16 textos distintos (centavos de crédito). De las 328 quejas del Bajío en octubre, **274 son por desabasto de producto** y **54 por precio y competencia**. `AI_AGG` las resume en un párrafo y respeta la Row Access Policy: GERENTE_NORTE obtiene 0 comentarios del Bajío.
- **Pronóstico (`SNOWFLAKE.ML.FORECAST`, entrenado hasta el 30-sep-2026):**

  | Mes (Bebidas Bajío) | Esperado | Real o escenario | Diferencia |
  |---|---|---|---|
  | Octubre | **$24.2 M** (rango 90%: 21.3–27.0) | Real: $15.8 M | **$8.4 M perdidos** |
  | Noviembre | $26.1 M | Sin acción: $17.1 M | **$9.1 M en riesgo** |

  En total, unos $17.4 M en dos meses.
- **Red de abasto (`ST_DISTANCE`):** el CEDIS más cercano a León con excedente es **Tultitlán**: 310 km, ~6 h de camión, 88,365 unidades de excedente y 2.5% de quiebre. Las alternativas son Monterrey (526 km, 10.1 h), Veracruz (619 km, 11.9 h) y Mérida (1,255 km, 24.1 h).

## Call center (`03c_call_center`)
- **13 llamadas, 66 min de audio** en `@TEC_DEMO.RAW.AUDIOS` (vienen de `datos/audios/` y las copia `01_datos`). Voces sintéticas en español de México; los guiones están en `datos/audios/guiones/`.
- **Una consulta, cinco funciones:** `AI_TRANSCRIBE` (turnos por hablante con su segundo) → `AI_CLASSIFY` (motivo y urgencia) → `AI_SENTIMENT` (general + Logística, Servicio, Producto) → `AI_EXTRACT` (producto, compromiso, plazo, causa) → `AI_COMPLETE` con `response_format` de tipo fijo (resumen y folio normalizado). Costo de referencia: 66 min × 50 tokens/s ≈ 200 mil tokens de transcripción.
- **Mismo patrón que `03b`:** la IA corre en vivo en `*_EN_VIVO`; las cifras oficiales vienen de `datos/referencia/llamadas_analizadas/` y la celda compara ambas.

  | Llamada | Fecha | Ciudad | Motivo (IA) | Urgencia | Logística |
  |---|---|---|---|---|---|
  | 11 | 6-oct | León | Desabasto de producto | Alta | negativa |
  | 12 | 14-oct | Querétaro | Precios y facturación (fin de la promo) | Media | negativa |
  | 13 | 22-oct | Aguascalientes | Desabasto de producto | Alta | negativa |

- **Las otras 10** (ago–oct, todas las regiones) son el ruido normal de un call center: terminales, cuarto frío, caducidad, POS, facturación. Algunas mencionan sucursales y CEDIS con nombres propios del guion (por ejemplo "CEDIS Zapopan"); el catálogo las liga a una tienda real de su ciudad.
- **Lección de diarización:** en las llamadas 07 y 08 las dos voces se parecen y `AI_TRANSCRIBE` detecta un solo hablante (los turnos quedan como `Llamada`). En producción se graba en estéreo, un canal por persona.

## Contraste positivo
Norte · Botanas **+27.1%** en septiembre vs agosto por la promoción "Temporada futbol" (sep–nov).

## Gobierno
La voz del cliente llega al agente por `VOZ_CLIENTE` (Dynamic Table con la Row Access Policy) vía la Semantic View, no por Cortex Search: así el gerente del Norte no ve comentarios del Bajío.
La capa de mapas `TIENDAS_GEO` tiene la misma política: GERENTE_NORTE ve solo sus 4,295 tiendas y, si pide un mapa del Bajío, el agente responde que su rol no tiene acceso. `contacto`, `telefono` y `email` están enmascarados para todos excepto DIRECTOR_COMERCIAL.
Las llamadas siguen la misma regla: `LLAMADAS_360` lleva `RAP_REGION` (GERENTE_NORTE ve 3 llamadas, ninguna del Bajío) y el audio solo se entrega desde la app con un enlace temporal de 10 minutos, después de comprobar la región.
