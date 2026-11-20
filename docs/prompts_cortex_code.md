# Prompts para Cortex Code (CoCo) — construye en vivo
Úsalos en Snowsight (CoCo) o en Cortex Code. Escribe en español.

## 0. El reto (100% reproducible) · `notebooks/07_reto_coco.ipynb`
Corre las celdas 1 y 2 del notebook (siembran la falla y muestran la fuga: 5 regiones) y pega:

"En TEC_DEMO.ANALITICA la policy RAP_REGION deja ver otras regiones a GERENTE_BAJIO cuando tiene roles secundarios. Corrígela para que use CURRENT_ROLE() y la tabla ACCESO_REGION, sin desasignarla de las tablas, y ejecuta la celda de validación de este notebook."

Éxito = la celda de validación imprime **RETO SUPERADO**. Si CoCo no está disponible, usa la celda de respaldo.

## Datos e ingeniería
1. "Crea una Dynamic Table en TEC_DEMO.ANALITICA que calcule la venta neta semanal por estado y canal a partir de VENTAS_ENRIQUECIDAS, con target lag de 1 día, y ponle la Row Access Policy RAP_REGION sobre la columna region."
2. "Agrega a SV_COMERCIAL una métrica 'margen_pct' = margen_total / venta_total, con sinónimos 'margen porcentual' y 'rentabilidad', sin perder los grants."
3. "Crea una masking policy que muestre solo los últimos 4 dígitos del teléfono para GERENTE_NORTE."

## La app · `app/abarrotera-bi` (Next.js en Snowflake App Runtime)
Las consultas viven en `lib/queries.ts`: cada una lleva el marcador `{R}` (filtro de región con binds) y la ruta `app/api/data/[name]` la ejecuta con los permisos del usuario. Ver `docs/seguridad_app.md`.
4. "En app/abarrotera-bi/lib/queries.ts agrega una consulta 'proveedores_riesgo' con los 5 proveedores con peor perfect_order_rate de octubre 2026 desde COMPRAS_MENSUALES. Usa el marcador {R}, las fechas de lib/constants.ts y calcula la tasa como SUM/SUM. Agrega un test en __tests__/lib/queries.test.ts."
5. "En app/abarrotera-bi/components/views/salud.tsx agrega una tarjeta 'Proveedores en riesgo' que consuma /api/data/proveedores_riesgo y marque en rojo los que tengan perfect order menor a 70%."
6. "Corre los tests y el build de app/abarrotera-bi y dime el comando para volver a desplegar la app TEC_DEMO.APPS.ABARROTERA_360."

### Módulo Llamadas del call center (construirlo en vivo con CoCo en Snowsight)
La versión terminada ya viene en el kit (`components/views/llamadas.tsx`, `app/api/llamadas/[id]/route.ts`): úsala como respaldo o para comparar lo que genera CoCo. Para construirlo desde cero, borra esos dos archivos y la entrada `llamadas` de `lib/queries.ts`, `lib/app-state.ts` y `components/shell.tsx`, y pega en orden:

7. "En app/abarrotera-bi/lib/queries.ts agrega la consulta 'llamadas' sobre TEC_DEMO.ANALITICA.LLAMADAS_360 (sin transcripcion, segmentos ni archivo) con el marcador {R}, ordenada por fecha descendente."
8. "Crea la ruta app/api/llamadas/[id]/route.ts: valida que id sea numérico, usa regionesEfectivas(rol) de lib/acceso.ts y en UNA consulta con binds (llamada_id = ? AND region IN (...)) regresa los campos de LLAMADAS_360 con segmentos y GET_PRESIGNED_URL(@TEC_DEMO.RAW.AUDIOS, archivo, 600) como audio_url. Si no hay fila responde 404 sin enlace; errores con errorResponse. Agrega __tests__/api/llamadas.test.ts con el patrón de seguridad.test.ts: un gerente del Norte no obtiene una llamada del Bajío."
9. "Crea components/views/llamadas.tsx con el estilo de voz.tsx: filtros por región, urgencia, sentimiento de logística y motivo; 4 KPIs; barras de motivo por región; lista de llamadas. Al abrir una, un panel lateral con <audio> (audio_url), resumen, campos extraídos y la transcripción por turno: resalta el turno activo con el evento timeupdate del audio (sin setInterval) y al hacer clic en un turno salta a su segundo. Regístrala en shell.tsx (grupo Diagnóstico, icono PhoneCall) y en el tipo Vista de lib/app-state.ts."
10. "Corre npm test y npm run build y despliega con snow app deploy --role TEC_ADMIN."

## Reto final para el público · `notebooks/08_reto_extra`
11. **Agente de Abasto** (Reto B) y **alerta de quiebre a Telegram** (Reto A): los prompts exactos y la validación PASS/FAIL están en el notebook 08.
