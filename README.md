# Workshop Tec de Monterrey · De los datos a los agentes
## Kit final idempotente — Abarrotera del Centro S.A. (empresa ficticia)

Todos los asistentes cargan **los mismos archivos** y obtienen **las mismas cifras de la presentación**. Cada notebook (y cada script de `sql/`) se puede correr las veces que quieras: no duplica datos ni cambia los resultados.

| Cifra de la historia | Valor |
|---|---|
| Bebidas Bajío sep → oct | **−31.6 %** |
| Quiebre de Bebidas en el CEDIS León (oct) | **34.6 %** |
| Fill rate del Proveedor 07 en el Bajío (oct) | **72.6 %** |
| Primer día con quiebre diario > 20 % | **1-oct-2026** |
| Quejas del Bajío por desabasto (oct) | **274** |
| Venta perdida en octubre / en riesgo en noviembre | **$8.4 M / $9.1 M** |
| CEDIS más cercano a León con excedente | **Tultitlán · 88,365 u · 310 km** |
| Llamadas del Bajío en octubre con logística negativa (IA sobre audio) | **3 de 3** (2 por desabasto, urgencia alta) |

## Contenido

```
datos/            26 CSV gzip (191 MB) y 13 audios mp3 (61 MB): la "verdad" del workshop
  raw/            14 tablas (VENTAS en 8 partes de ~19 MB; LLAMADAS = catálogo del call center)
  referencia/     clasificación con IA, pronóstico, documentos y llamadas analizadas (resultados congelados)
  audios/         13 llamadas de tiendas al call center (mp3) y sus guiones (guiones/)
  control/        control.csv: filas y suma de control por tabla
notebooks/        00 → 08 (con 03b y 03c_call_center), 00b_validacion, 00c_politicas, 99_limpieza
sql/              los mismos pasos en scripts .sql (generados desde los notebooks)
app/abarrotera-bi la app React "Abarrotera 360" (Snowflake App Runtime)
docs/             guía del lab, caso de estudio, prompts, CoWork, glosario, diccionario de datos y seguridad de la app
Presentacion/     material complementario
```

## Desde GitHub

1. Descarga el kit:
   - **Con git:** `git clone https://github.com/<usuario>/tec-monterrey-datos-a-agentes.git`
   - **Sin git:** en GitHub, **Code → Download ZIP** y descomprímelo.
2. Sube la carpeta completa a **Projects → Workspaces → My Workspace** sin cambiarle el nombre, y sigue los pasos de abajo desde `00_setup`.
3. Si no puedes usar el workspace, usa la **opción B** (subir `datos/` al stage).
4. **La app:** el repo no trae `node_modules`. Desde `app/abarrotera-bi` corre `npm install` y `npm test`, y despliega con `snow app deploy --role TEC_ADMIN` (ver `app/abarrotera-bi/README.md`).

## De cero a la historia completa (10 pasos)

1. Crea una cuenta trial de Snowflake (Enterprise, AWS) y entra con tu usuario ACCOUNTADMIN.
2. Importa esta carpeta a tu workspace (**Projects → Workspaces → My Workspace**). `01_datos` la reconoce con cualquiera de estos nombres: `tec-monterrey-datos-a-agentes` (repo clonado), `tec-monterrey-datos-a-agentes-main` (ZIP de GitHub) o `TEC Monterrey Final 2`. Si usas otro nombre, cámbialo en la celda *Copiar los CSV* de `01_datos`.
3. **`00_setup`**: crea el rol `TEC_ADMIN`, el warehouse `TEC_WH`, la base `TEC_DEMO` y los esquemas `RAW`, `ANALITICA`, `AGENTES` y `APPS`.
4. **`01_datos`**: copia los 26 CSV de `datos/` al stage `TEC_DEMO.RAW.DATOS_CSV` y los 13 audios de `datos/audios/` al stage `TEC_DEMO.RAW.AUDIOS`, crea las 14 tablas y las carga (~1 min). La última celda debe mostrar 14 × **PASS**.
5. **`02_dynamic_tables`**: arma las 10 Dynamic Tables de `ANALITICA`.
6. **`03_gobierno`**: roles (los de negocio leen a través de `LECTOR_COMERCIAL`), Row Access Policy por región, enmascaramiento parcial de datos personales y Data Metric Functions de calidad.
7. **`03b_inteligencia`**: IA sobre comentarios, pronóstico y red de abasto. Las fechas de la historia viven en `ANALITICA.PARAMETROS`. Las funciones de IA y ML se ejecutan **en vivo** en tablas `*_EN_VIVO` para aprender. Las tablas oficiales se cargan de `datos/referencia/` para que todos tengan las mismas cifras, y la celda muestra si tu resultado coincide.
   **`03c_call_center`**: IA sobre audio. Transcribe las 13 llamadas por hablante (`AI_TRANSCRIBE`), las clasifica, mide el sentimiento por aspecto, extrae causa y compromiso y las resume, con el mismo patrón en vivo / oficial. Crea `ANALITICA.LLAMADAS_360` con la Row Access Policy por región.
8. **`04_semantic_view`**, **`05_search`** y **`06_agente`**: Semantic View (incluye las llamadas), Cortex Search (documentos y un índice de comentarios y otro de llamadas por región) y el Agente Comercial (publicado en CoWork).
9. **`00b_validacion`**: todo debe salir **PASS**: la huella de las 18 tablas y las cifras de la historia. **`00c_politicas`** audita que ninguna tabla legible quede sin política de región.
10. Opcional: `04b_mapas`, `07_reto_coco`, `08_reto_extra` (Telegram) y la app en `app/abarrotera-bi`.

### Sin workspace (opción B)
Snowsight → **Data → Add data → Load files into a stage** → `TEC_DEMO.RAW.DATOS_CSV`. Sube el contenido de `datos/` respetando las carpetas `raw/<tabla>/`, `referencia/<tabla>/` y `control/`. Sube los 13 mp3 de `datos/audios/` (sin carpeta) a `TEC_DEMO.RAW.AUDIOS`. Después corre `01_datos`: las celdas de copia detectan que los stages ya tienen los 26 CSV y los 13 audios y no copian nada.

### Solo con SQL
Corre en orden `sql/00_setup.sql` … `sql/06_agente.sql` y al final `sql/00b_validacion.sql`. Si cambias un notebook, regenera los scripts con `python3 sql/.generar.py`.

## Cómo funciona la idempotencia

| Capa | Mecanismo |
|---|---|
| Objetos (base, esquemas, stage, tablas, políticas) | `CREATE ... IF NOT EXISTS` |
| Dynamic Tables | `CREATE OR ALTER`: actualiza una versión anterior sin perder políticas ni permisos |
| Copia de archivos | Se omite si el stage ya tiene los 26 CSV (y `AUDIOS` los 13 mp3), comprobados por nombre |
| Carga de datos | `RAW.CARGAR_CSV`: si la tabla ya tiene las filas **y la suma de control** de `control.csv` no la toca; si no coincide (aunque tenga datos previos), `TRUNCATE` + `COPY ... FORCE` |
| IA y pronóstico | Oficial = CSV de referencia; en vivo = tablas `*_EN_VIVO` (no afectan las cifras). La transcripción de `03c` también se hace una sola vez (`IF NOT EXISTS`) |
| Semantic View, agente y procedimientos | `CREATE OR REPLACE`, con los permisos en la celda siguiente |
| Políticas en tablas | `DROP ALL ROW ACCESS POLICIES` + `ADD` |
| Data Metric Functions | Se agregan solo si la tabla no las tiene ya |

## Costo y limpieza
- `TEC_WH` sube a MEDIUM solo durante la carga y regresa a XSMALL (también si la carga falla).
- Las Dynamic Tables y los servicios de Cortex Search revisan cambios **una vez al día** (los datos están congelados). Las DMF solo se evalúan cuando una tabla cambia.
- `03c_call_center` transcribe 66 minutos de audio una sola vez: ~200 mil tokens de `AI_TRANSCRIBE` (50 tokens por segundo), más las funciones de texto sobre 13 transcripciones.
- La alerta de Telegram y su task (cada 60 minutos) quedan **suspendidas**; actívalas solo durante la demo.
- `99_limpieza` tiene una celda para **pausar** todo sin borrar y otra para borrar todo lo del workshop.

## Datos y privacidad
Todo es **sintético**: la empresa, las personas, los teléfonos, los comentarios y las llamadas son ficticios (las voces se generaron con síntesis de voz a partir de los guiones de `datos/audios/guiones/`). Los correos son inventados pero usan dominios públicos reales (`gmail.com`, `hotmail.com`, `outlook.com`...), así que no se deben usar para enviar mensajes. El kit no incluye identificadores de cuenta, tokens ni URLs privadas. Los valores `<TOKEN_DEL_BOT>`, `<TU_CHAT_ID>` y la contraseña de demo de `03_gobierno` (`CambiaEsto-Tec-2026!`) se reemplazan en tu propia cuenta.

Más detalle: [`docs/diccionario_datos.md`](docs/diccionario_datos.md) (tablas y columnas), [`docs/glosario.md`](docs/glosario.md) (términos) y [`docs/seguridad_app.md`](docs/seguridad_app.md) (modelo de seguridad de la app y del agente).
