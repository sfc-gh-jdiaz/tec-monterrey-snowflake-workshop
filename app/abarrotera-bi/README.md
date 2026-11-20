# Abarrotera 360

Centro de mando comercial de **Abarrotera del Centro** (empresa ficticia del workshop Tec de Monterrey). Es una Snowflake App (Next.js + React) que cuenta la historia de la caída de Bebidas en el Bajío con mapas, gráficas y el **AGENTE_COMERCIAL** embebido.

## Vistas

| Vista | Qué muestra | Fuente principal |
|---|---|---|
| Resumen ejecutivo | KPIs animados, venta de Bebidas por región, mapas antes/después | `VENTAS_MENSUALES`, `PRONOSTICO_MENSUAL`, `TIENDAS_GEO` |
| Mapa de red | Mapa oscuro con 6 capas: arcos CEDIS→ciudad, hexágonos H3 en 3D, calor de caída, burbujas, radios de cobertura y quejas; recorrido animado de la reasignación Tultitlán → León | `TIENDAS_GEO`, `RAW.CEDIS`, `RED_ABASTO`, `VOZ_CLIENTE` |
| Flujo de valor | Sankey proveedor → CEDIS → categoría → venta, con la rama de venta perdida | `COMPRAS_MENSUALES`, `VENTAS_MENSUALES`, `PRONOSTICO_MENSUAL` |
| Salud operativa | Velocímetros (fill rate, quiebre, días de inventario, precisión del pronóstico), cobertura por CEDIS, peores proveedores | `COMPRAS_MENSUALES`, `INVENTARIO_MENSUAL` |
| Grafo de la red | Red de fuerzas: proveedores, CEDIS, ciudades y temas de queja | varias |
| Quiebres y venta perdida | Causa raíz (temas de IA), combo mensual, matriz región × categoría, mapa de la frontera Bajío–Centro | `TEMAS_COMENTARIO`, `INVENTARIO_MENSUAL` |
| Tracker semanal | Quiebre semanal con meta de 5 %, semáforo por región, distribución de días sin stock | `INVENTARIO_SEMANAL`, `QUIEBRE_SKU_MENSUAL` |
| Pronóstico | Real contra esperado con banda de confianza, diario y mensual | `PRONOSTICO_DIARIO`, `BEBIDAS_DIARIAS`, `PRONOSTICO_MENSUAL` |
| Voz del cliente | Comentarios por tema, calificación por región y citas más frecuentes | `VOZ_CLIENTE`, `TEMAS_COMENTARIO` |
| Llamadas del call center | Las 13 llamadas con motivo, urgencia y sentimiento por aspecto (IA); al abrir una: reproductor, transcripción por hablante que se resalta con el audio (clic en un turno = saltar a ese segundo), resumen y datos extraídos | `LLAMADAS_360`, `@RAW.AUDIOS` |
| Agente comercial | Chat con streaming, tablas y SQL generado, y mini-mapa de la ruta recomendada | `TEC_DEMO.AGENTES.AGENTE_COMERCIAL` |

Cada vista tiene el botón **"Pregúntale al agente sobre esta vista"**, que abre el panel lateral con una pregunta ya escrita.

## Cómo funciona

- **Datos:** todo el SQL vive en `lib/queries.ts` y se sirve por `GET /api/data/<consulta>?rol=<ROL>`. Las fechas de la historia, los nombres de objetos y el CEDIS foco están en `lib/constants.ts`. Hay caché en el servidor con límite de tamaño; su duración se ajusta con `CACHE_DATOS_MIN` (default 10) y `CACHE_ROLES_MIN` (default 5).
- **Quién ve qué (lo decide Snowflake):** en cada petición la app pregunta, **con los permisos del usuario que la abrió** (caller's rights, con su rol por defecto), qué regiones le deja ver la Row Access Policy `RAP_REGION`. Ese es el tope. Después consulta los datos filtrados a esas regiones con binds (`region IN (?, ...)`), nunca con texto del navegador.
- **Selector "Ver como":** sirve para la demo y **solo puede reducir** el tope: un gerente que elija `DIRECTOR_COMERCIAL` sigue viendo solo su región. Las regiones de cada rol se leen de `TEC_DEMO.ANALITICA.ACCESO_REGION` (el `*` se expande con `RAW.REGIONES`).
- **Errores:** el navegador recibe un mensaje genérico con un id de referencia; el detalle (SQL, objetos, mensajes del driver) solo va al log del servicio.
- **Mapas:** deck.gl sin tiles de internet. El mar es el fondo y los países vecinos y los 32 estados vienen en `public/geo/*.json`: Natural Earth (world-atlas) y el contorno de estados de Highcharts Map Collection, convertidos a lon/lat.
- **Agente:** `POST /api/agente` valida la conversación (máximo 20 mensajes de 4,000 caracteres) y la reenvía a `agent:run` (Cortex Agents REST) **con los permisos del usuario**, así que el agente aplica las mismas políticas. Devuelve el stream SSE: el navegador pinta el texto, el estado, las tablas, el SQL y las preguntas sugeridas.
- **Audio:** `GET /api/llamadas/<id>` regresa los turnos, los campos extraídos y un enlace temporal (10 min, `GET_PRESIGNED_URL`) al mp3, solo si la llamada es de una región que el usuario ve. El turno activo se sigue con el evento nativo `timeupdate` del `<audio>`.

Detalle del modelo de seguridad y sus riesgos: [`docs/seguridad_app.md`](../../docs/seguridad_app.md).

## Desplegar

```bash
snow app deploy --role TEC_ADMIN
```

El manifiesto es `app.yml` (`version: 2`): servicio `TEC_DEMO.APPS.ABARROTERA_360`, warehouse `TEC_WH`. Antes de desplegar corre `npm test` y `npm run build`.

**Requisito:** los caller grants de `03_gobierno` (celda `caller_grants_app`) y haber corrido `03c_call_center` (crea `LLAMADAS_360`; sin ella la vista de llamadas muestra un error). Sin los caller grants, las consultas con los permisos del usuario fallan y la app muestra un error.

Dar acceso a los roles de negocio (los tres heredan de `LECTOR_COMERCIAL`):

```sql
GRANT USAGE ON APPLICATION SERVICE TEC_DEMO.APPS.ABARROTERA_360 TO ROLE LECTOR_COMERCIAL;
```

Cada persona ve lo que permita **su rol por defecto** (`DEFAULT_ROLE`), así que los usuarios de demo (`GERENTE_BAJIO_USR`...) deben tener el suyo.

## Pruebas

```bash
npm test
```

Cubren el modelo de acceso (el selector no puede ampliar el tope, rol desconocido = nada), que toda consulta filtre por región con binds y solo use fechas de `lib/constants.ts`, que el enlace al audio solo salga para llamadas de regiones visibles (`__tests__/api/llamadas.test.ts`), la validación de la conversación del agente, los errores genéricos y el caché.

## Desarrollo local

```bash
npm install
SNOWFLAKE_ROLE=TEC_ADMIN SNOWFLAKE_WAREHOUSE=TEC_WH npm run dev
```

En `next dev` no hay caller's rights: todo corre con tu conexión local, y el tope de regiones es el del rol de esa conexión (`TEC_ADMIN` y `ACCOUNTADMIN` ven todo porque tienen `*` en `ACCESO_REGION`).
