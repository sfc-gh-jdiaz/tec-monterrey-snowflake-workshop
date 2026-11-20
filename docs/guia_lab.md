# Guía del lab (alumnos)
**Tiempo:** 60–90 min · **Nivel:** principiante–intermedio · **Formato:** notebooks de Snowflake Workspaces

## 1. Prepara (10 min)
1. Crea tu trial en https://signup.snowflake.com (Enterprise, AWS o Azure).
2. En Snowsight: **Projects → Workspaces → My Workspace → + Add → Upload** y sube la **carpeta completa** del kit (sin cambiarle el nombre): `01_datos` copia de ahí los CSV de `datos/` y los 13 audios de `datos/audios/`.
3. Abre `00_setup` y corre todo. Sigue con `01_datos` (ESCALA 1 = 10M ventas, ~1–2 min).

## 2. Datos vivos (5 min) · `02_dynamic_tables`
Crea las Dynamic Tables. En la sección **Demo: datos vivos** sube temporalmente el `TARGET_LAG` a 1 minuto, inserta la venta de prueba ($50,000 en Bebidas del Bajío), mírala aparecer, bórrala y regresa el lag a 1 hora.

## 3. Gobierno (10 min) · `03_gobierno`
Mira cómo `EXECUTE USING POLICY_CONTEXT` muestra 1 región al gerente del Bajío y 5 al director. ¿Por qué importa para un agente?

### 3b. Inteligencia (10 min) · `03b_inteligencia`
Tres capacidades en un notebook:
- **IA sobre texto:** clasifica los comentarios por tema y sentimiento y resume las 328 quejas en un párrafo. 274 son por desabasto.
- **Pronóstico:** entrena un modelo con la venta hasta septiembre. En octubre debimos vender $24.2 M de Bebidas en el Bajío y vendimos $15.8 M. Si no hacemos nada, en noviembre se pierden $9.1 M más.
- **Red de abasto:** ¿desde qué CEDIS surtimos a León? Tultitlán: 310 km, ~6 h de camión.

### 3c. Call Center (10 min) · `03c_call_center`
13 llamadas de tiendas al call center (66 min de audio) que nadie tiene tiempo de escuchar:
- **Escucha una** desde el stage, sin descargarla (celda *Escuchar una llamada*).
- **Una consulta, cinco funciones de IA:** `AI_TRANSCRIBE` separa agente y tienda con el segundo de cada turno; `AI_CLASSIFY` da el motivo y la urgencia; `AI_SENTIMENT` mide Logística, Servicio y Producto por separado; `AI_EXTRACT` saca producto, compromiso, plazo y causa; `AI_COMPLETE` resume y normaliza el folio con salida JSON de tipo fijo.
- **Lectura:** las 3 llamadas del Bajío de octubre tienen sentimiento negativo en logística y nombran al **CEDIS León** y al **Proveedor 07**. Busca dentro de los turnos el segundo exacto en que lo dicen.
- **Gobierno:** simula a `GERENTE_NORTE`: ¿cuántas llamadas del Bajío ve?
- **Pregunta para pensar:** en las llamadas 07 y 08 la IA detecta un solo hablante. ¿Por qué pasa y cómo lo evitarías en un call center real?

## 4. Conocimiento del negocio (10 min) · `04_semantic_view` y `05_search`
Define métricas una sola vez (incluidas la voz del cliente y las llamadas, gobernadas por región) y busca en políticas, procedimientos y en lo que se dijo por teléfono (`BUSQUEDA_LLAMADAS`). Pregunta clave: ¿por qué el agente **no** usa Cortex Search para los 60 mil comentarios de tenderos ni para las llamadas?

### 4b. Mapas (10 min) · `04b_mapas`
Corre el notebook y mira la caída **desde el espacio**: burbujas por ciudad, hexágonos H3 de todo el país y la frontera Bajío–Centro. Todo sale de la Semantic View con SQL; los mapas se dibujan con plotly. Al final, simula a GERENTE_NORTE: ¿cuántas tiendas ve?
> Si tu cuenta tiene **mapas nativos** de Snowsight (vista previa privada), en el resultado de una celda SQL elige **Map** y liga `LATITUD`/`LONGITUD`.

## 5. Conversa con el agente (15 min) · `06_agente` y Snowflake CoWork
Entra a CoWork como `DIRECTOR_USR` y empieza por el mapa:
- Muéstrame en un mapa por ciudad cuánto cambió la venta de Bebidas de septiembre a octubre.
- Grafica la venta mensual de Bebidas del Bajío contra el resto del país en 2026.

Después entra como `GERENTE_BAJIO_USR` (contraseña en `03_gobierno`) y pregunta:
- ¿Por qué cayeron las ventas en el Bajío en octubre de 2026?
- ¿Qué proveedor tuvo peor perfect order rate en el Bajío en octubre?
- ¿Dónde la competencia está más barata en botanas?
- ¿Qué dicen los tenderos del Bajío en octubre?
- ¿Qué dice el procedimiento cuando el quiebre supera 20%?
- ¿Cuánto vamos a perder en noviembre si no resolvemos el quiebre?
- ¿Desde qué CEDIS reasigno Bebidas a León y en cuánto tiempo llegan?
- ¿De qué se quejan los tenderos del Bajío? Agrúpalo por tema.
- ¿Qué reportaron por teléfono las tiendas del Bajío en octubre y coincide con los datos de proveedores?
- Pide: "Genera una presentación PowerPoint de 5 láminas con este análisis."
- Entra como `GERENTE_NORTE_USR` y pide *"muéstrame en un mapa las tiendas del Bajío"*, *"qué dicen los tenderos del Bajío"* o *"qué reportaron por teléfono las tiendas del Bajío"*. ¿Qué responde y por qué?

> En CoWork el agente usa el **rol por defecto del usuario**. Por eso usamos usuarios persona en vez de cambiar de rol.

> **Riesgo a conocer:** la lámina de PowerPoint la arma la herramienta `code_execution`, que corre Python generado por el modelo en un sandbox de Snowflake con los datos que el agente ya obtuvo. Los archivos que crea llevan esos datos. En producción, quita la herramienta si no la necesitas o limita qué roles usan el agente (ver `docs/seguridad_app.md`).

## 6. Reto CoCo (10 min) · `07_reto_coco`
Hay una fuga de datos sembrada. Pídele a CoCo que la arregle con el prompt del notebook. Lo logras cuando la validación diga **RETO SUPERADO**.

## 7. Reto extra (si terminas antes) · `08_reto_extra`
- **A · Telegram:** crea un bot con @BotFather y haz que un `ALERT` de Snowflake te avise al celular cuando el quiebre de Bebidas supere 20%. Requiere External Access Integration (si tu trial no lo permite, haz el B).
- **B · Agente de Abasto:** pídele a CoCo un segundo agente que recomiende reasignaciones de inventario.
- **C · Pregúntale desde Telegram:** responde al bot con una pregunta y el Agente Comercial te contesta en el celular (requiere el A). El task revisa mensajes cada 60 minutos: actívalo solo mientras lo pruebas y usa `EXECUTE TASK` para no esperar.
Los retos A y B terminan en **RETO A/B SUPERADO**.

## 8. Más prompts para CoCo
`docs/prompts_cortex_code.md` (prompts 1–3).

## 9. Cuéntanos cómo te fue
Escanea el QR de la última lámina: 3 preguntas, 1 minuto.

> **Si ves "Upgrade service to runtime v2.4":** cambia el servicio del notebook (menú **Connected**) a uno con runtime 2.4 o superior. Cada notebook ya trae como primera celda `USE DATABASE` / `USE SCHEMA`, así que funciona igual.

## Limpieza
`99_limpieza`: descomenta las celdas para no consumir créditos de tu trial (incluye revocar `EXECUTE AGENT TASK` de PUBLIC).

## Qué NO está en el lab del trial
- **Internal Marketplace:** requiere una organización con varias cuentas; lo verás en la demo.
- **App en SPCS:** Snowpark Container Services no está disponible en trial; lo verás en la demo (incluido el módulo **Llamadas del call center**, donde escuchas cada llamada con su transcripción sincronizada).

## Sigue aprendiendo
Quickstarts: https://quickstarts.snowflake.com · Documentación: https://docs.snowflake.com · Cursos gratuitos: https://learn.snowflake.com
