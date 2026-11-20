# Seguridad de la app, el agente y los datos

Cómo se controla quién ve qué en el kit, qué decisiones se tomaron y qué riesgos quedan abiertos a propósito. Para auditar el estado actual en tu cuenta corre `notebooks/00c_politicas` (todo debe salir PASS).

## Roles

| Rol | Para qué | Ve |
| --- | --- | --- |
| `TEC_ADMIN` | Dueño de todos los objetos del kit y rol de ejecución de la app | Todo (`*` en `ACCESO_REGION`) |
| `LECTOR_COMERCIAL` | Rol funcional con **todos** los permisos de lectura: `ANALITICA`, Semantic View, agente, warehouse | Nada por sí mismo: no está en `ACCESO_REGION` |
| `DIRECTOR_COMERCIAL` | Rol de negocio; hereda `LECTOR_COMERCIAL` | Las 5 regiones; datos personales completos; índice de comentarios de todas las regiones |
| `GERENTE_BAJIO`, `GERENTE_NORTE` | Roles de negocio; heredan `LECTOR_COMERCIAL` | Solo su región; datos personales parciales; índice de comentarios de su región |
| `ACCOUNTADMIN` | Administración | Todo (`*`); hereda `LECTOR_COMERCIAL` para poder usar la app y el agente |

Los roles de negocio **no tienen permisos directos**: todo llega por `LECTOR_COMERCIAL`, y las Dynamic Tables nuevas lo reciben con un grant `FUTURE`. Por eso **toda tabla nueva con región debe llevar `RAP_REGION` antes de que exista algún dato sensible en ella**. `00c_politicas` lo revisa.

## Filas: `RAP_REGION`

- Compara `CURRENT_ROLE()` contra `ANALITICA.ACCESO_REGION` (`rol`, `region`; `*` = todas).
- Es **fail-closed**: un rol que no está en la tabla no ve ninguna fila.
- Está en 15 tablas de `ANALITICA` (todas las que tienen región, incluida `LLAMADAS_360` de `03c`). En `RED_ABASTO` filtra por `region_destino`.
- `TEMAS_COMENTARIO` no tiene región (16 textos con su tema); se cruza con `VOZ_CLIENTE` por `comentario_id`, y esa sí tiene RAP.

**Decisión (B4): se mantiene `CURRENT_ROLE()`.** La política mira solo el rol principal de la sesión, no los roles secundarios. Ventaja: el resultado es predecible y se puede simular con `EXECUTE USING POLICY_CONTEXT`. Consecuencia: si un usuario activa roles secundarios, no ve más regiones por eso. Si en tu organización los permisos llegan por roles secundarios, cambia la política a `IS_ROLE_IN_SESSION(rol)`.

## Columnas: `MASK_PII`

En `VENTAS_ENRIQUECIDAS.contacto`, `telefono` y `email`. El director ve el dato completo; los demás ven lo mínimo para operar:

| Columna | Gerente ve |
| --- | --- |
| contacto | Iniciales: `G. C. J.` |
| telefono | Últimos 4 dígitos: `******7025` |
| email | Solo el dominio: `****@gmail.com` |

Los correos son inventados pero usan dominios públicos reales; no se deben usar para enviar mensajes.

## Calidad: Data Metric Functions

9 métricas en `RAW` (`03_gobierno`, celda `calidad_dmf`), con expectativa `= 0`: llaves únicas, valores no nulos, precios válidos y ventas cuya tienda existe. Se evalúan solo cuando la tabla cambia (`TRIGGER_ON_CHANGES`). Resultados: `SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS`.

## La app (`APPS.ABARROTERA_360`)

**Quién ve qué lo decide Snowflake, no el navegador:**

1. En cada petición, la app pregunta **con los permisos del usuario que la abrió** (caller's rights, con su rol por defecto) qué regiones le deja ver `RAP_REGION`. Ese es el **tope**.
2. El selector "Ver como" de la demo **solo puede reducir** el tope. Un gerente que pida `rol=DIRECTOR_COMERCIAL` sigue viendo solo su región; un rol desconocido no ve nada.
3. Los datos se consultan filtrados a esas regiones con **binds** (`region IN (?, ...)`). Ningún texto del navegador se concatena al SQL; la búsqueda de comentarios escapa `%` y `_` y limita el texto a 100 caracteres.

Requisitos: los caller grants a `TEC_ADMIN` (`03_gobierno`, celda `caller_grants_app`) y que cada usuario tenga su `DEFAULT_ROLE`.

**Otros controles:**
- Los errores llegan al navegador como mensaje genérico con un id de referencia; el detalle solo queda en el log del servicio.
- La conversación con el agente se valida: máximo 20 mensajes de 4,000 caracteres, solo roles `user` y `assistant`, y debe terminar en una pregunta del usuario.
- El caché del servidor tiene tamaño máximo. Las regiones forman parte de la llave, así que un usuario nunca recibe el caché de otro con más regiones.

Las pruebas de `app/abarrotera-bi/__tests__` cubren estos puntos (`npm test`).

### Audio de las llamadas

- Los mp3 viven en `RAW.AUDIOS` (cifrado `SNOWFLAKE_SSE`). **Ningún rol de negocio tiene acceso al stage**; en los notebooks solo `TEC_ADMIN` los lee.
- La app pide el detalle en `GET /api/llamadas/<id>`: valida que el id sea numérico, calcula las regiones efectivas del usuario y genera el enlace con `GET_PRESIGNED_URL` **en la misma consulta** que filtra `llamada_id = ? AND region IN (?, ...)`. Si la llamada no es de una región visible, responde 404 y no hay enlace.
- El enlace caduca en **10 minutos** y la respuesta lleva `Cache-Control: no-store`; el navegador vuelve a pedirlo cada vez que se abre una llamada.
- **Riesgo conocido:** mientras no caduque, quien tenga el enlace puede descargar ese mp3 (es una URL firmada del stage). Para el taller se acepta; en producción usa un TTL más corto o sirve el audio desde la propia app.

## El agente (`AGENTES.AGENTE_COMERCIAL`)

- Corre con el **rol por defecto del usuario**, tanto en CoWork como desde la app y desde `DATA_AGENT_RUN`, así que aplica las mismas RAP y máscaras. Si ese rol no tiene `USAGE` sobre el agente (por ejemplo, un usuario cuyo rol por defecto no hereda `LECTOR_COMERCIAL`), la llamada falla con "does not exist or not authorized".
- Presupuesto: 120 segundos y 20,000 tokens por pregunta.

**Riesgo documentado (A12): `code_execution`.** Esta herramienta corre Python generado por el modelo en un sandbox de Snowflake con los resultados que el agente ya obtuvo, y puede crear archivos (PPTX, PDF, imágenes) con esos datos. Se mantiene porque el taller la usa para generar la presentación. En producción: quítala si no se necesita, limita qué roles usan el agente y revisa qué datos salen en los archivos.

## Cortex Search

Los servicios de búsqueda responden con los permisos de su **dueño**, no del usuario, y no pueden indexar tablas cuya RAP use una subconsulta. Por eso los comentarios se indexan desde `RAW` en un servicio por región, y cada servicio se otorga solo al rol de esa región: `BUSQUEDA_FEEDBACK` (todas, solo director), `BUSQUEDA_FEEDBACK_BAJIO` y `BUSQUEDA_FEEDBACK_NORTE`. Las llamadas siguen el mismo modelo con `BUSQUEDA_LLAMADAS`, `BUSQUEDA_LLAMADAS_BAJIO` y `BUSQUEDA_LLAMADAS_NORTE`, indexadas desde `AGENTES.LLAMADAS_TURNOS` (tabla que no se otorga a roles de negocio). El agente **no** usa estos índices: consulta comentarios y llamadas por la Semantic View, donde sí aplica `RAP_REGION`. Si agregas una región, crea sus servicios en `05_search`.

## Telegram (`08_reto_extra`)

- El token vive en un `SECRET`; el notebook trae `<TOKEN_DEL_BOT>` y se debe borrar de la celda después de usarlo.
- La salida a internet solo va a `api.telegram.org:443` (regla de red + External Access Integration).
- El bot solo envía a chats registrados en `TELEGRAM_USUARIOS`, y no reenvía errores internos al chat.
- La alerta y el task quedan suspendidos. El task revisa mensajes cada 60 minutos cuando se activa.

## Riesgos aceptados (no se corrigieron por decisión del equipo)

| Punto | Riesgo | Mitigación sugerida fuera del taller |
| --- | --- | --- |
| A3 · Rol por defecto | Lo que ve cada persona depende de su `DEFAULT_ROLE`; un usuario sin rol por defecto adecuado ve otra cosa o recibe errores | Revisar `DEFAULT_ROLE` al dar de alta usuarios |
| A6 · Contraseña de los usuarios de prueba | Los tres usuarios persona comparten una contraseña de demo escrita en `03_gobierno` | Cambiarla o borrar los usuarios al terminar (`99_limpieza`) |
| A8 · Privilegios de `TEC_ADMIN` | `TEC_ADMIN` puede crear bases, warehouses, roles y usuarios en la cuenta | En producción, separar el rol de despliegue del de administración |
| A9 · Cross-region | `CORTEX_ENABLED_CROSS_REGION` permite que los modelos procesen datos en otra región | Revertir con `ALTER ACCOUNT UNSET CORTEX_ENABLED_CROSS_REGION` si hay requisitos de residencia |
| B2 · Tags de PII | Las columnas personales se protegen por nombre en la política, no con tags de clasificación | Clasificar con tags y asignar la máscara por tag |
| `EXECUTE AGENT TASK` a `PUBLIC` | Si la cuenta ya lo tenía, cualquier rol puede crear automatizaciones de agentes | La revocación está comentada en `06_agente`; aplicarla si no se usa CoWork Automations |
