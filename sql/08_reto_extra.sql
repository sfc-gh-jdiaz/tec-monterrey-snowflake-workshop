-- 08_reto_extra.sql · generado desde notebooks/08_reto_extra.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 08 · Reto extra (para quien termina antes)
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.AGENTES;

-- ======================================================================
-- Reto A · Alerta a Telegram
-- ======================================================================

-- [tg_secret]
-- ✏️ Reemplaza <TOKEN_DEL_BOT> por el token de @BotFather y ejecuta. Después borra el token de esta celda.
-- Si el secreto quedó de una corrida anterior con otro dueño (p. ej. ACCOUNTADMIN), se borra primero para que TEC_ADMIN sea el dueño.
USE ROLE ACCOUNTADMIN;
DROP SECRET IF EXISTS TEC_DEMO.AGENTES.TELEGRAM_BOT_TOKEN;
USE ROLE TEC_ADMIN;
CREATE OR REPLACE SECRET TEC_DEMO.AGENTES.TELEGRAM_BOT_TOKEN
  TYPE = GENERIC_STRING SECRET_STRING = '<TOKEN_DEL_BOT>';

-- [tg_accountadmin]
-- Salida a internet solo hacia api.telegram.org (regla de red de TEC_ADMIN)
CREATE NETWORK RULE IF NOT EXISTS TEC_DEMO.AGENTES.TELEGRAM_NR
  MODE = EGRESS TYPE = HOST_PORT VALUE_LIST = ('api.telegram.org:443');

-- Las integraciones, EXECUTE ALERT y EXECUTE TASK solo los otorga ACCOUNTADMIN
USE ROLE ACCOUNTADMIN;
CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS TELEGRAM_EAI
  ALLOWED_NETWORK_RULES = (TEC_DEMO.AGENTES.TELEGRAM_NR)
  ALLOWED_AUTHENTICATION_SECRETS = (TEC_DEMO.AGENTES.TELEGRAM_BOT_TOKEN)
  ENABLED = TRUE;
GRANT USAGE ON INTEGRATION TELEGRAM_EAI TO ROLE TEC_ADMIN;
GRANT EXECUTE ALERT ON ACCOUNT TO ROLE TEC_ADMIN;   -- Reto A
GRANT EXECUTE TASK ON ACCOUNT TO ROLE TEC_ADMIN;    -- Reto C
USE ROLE TEC_ADMIN;

-- [tg_proc_enviar]
-- Dos procedimientos (código: CREATE OR REPLACE para que cada cambio se aplique)
-- ENVIAR_TELEGRAM: manda un mensaje a un chat REGISTRADO en TELEGRAM_USUARIOS (lista permitida)
CREATE TABLE IF NOT EXISTS TEC_DEMO.AGENTES.TELEGRAM_USUARIOS (chat_id VARCHAR, nombre VARCHAR, registrado TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP());

CREATE OR REPLACE PROCEDURE TEC_DEMO.AGENTES.ENVIAR_TELEGRAM(MENSAJE VARCHAR, CHAT_ID VARCHAR)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('requests','snowflake-snowpark-python')
HANDLER = 'run'
EXTERNAL_ACCESS_INTEGRATIONS = (TELEGRAM_EAI)
SECRETS = ('bot_token' = TEC_DEMO.AGENTES.TELEGRAM_BOT_TOKEN)
EXECUTE AS OWNER
AS
$$
import requests
import _snowflake

def run(session, mensaje, chat_id):
    # Solo se envía a chats registrados: evita que el procedimiento mande datos a cualquier chat
    registrado = session.sql("SELECT COUNT(*) FROM TEC_DEMO.AGENTES.TELEGRAM_USUARIOS WHERE chat_id = ?", params=[str(chat_id)]).collect()[0][0]
    if not registrado:
        return f"RECHAZADO: el chat_id {chat_id} no está en TEC_DEMO.AGENTES.TELEGRAM_USUARIOS"
    token = _snowflake.get_generic_secret_string('bot_token')
    try:
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                          json={"chat_id": chat_id, "text": mensaje[:4000]}, timeout=20)
        r.raise_for_status()
        return f"{r.status_code}: enviado"
    except requests.RequestException as e:
        codigo = getattr(e.response, "status_code", "sin respuesta")
        return f"ERROR {codigo}: no se pudo enviar el mensaje"
$$;

-- TELEGRAM_CHAT_IDS: lista quién le ha escrito al bot (para descubrir tu chat_id)
CREATE OR REPLACE PROCEDURE TEC_DEMO.AGENTES.TELEGRAM_CHAT_IDS()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('requests','snowflake-snowpark-python')
HANDLER = 'run'
EXTERNAL_ACCESS_INTEGRATIONS = (TELEGRAM_EAI)
SECRETS = ('bot_token' = TEC_DEMO.AGENTES.TELEGRAM_BOT_TOKEN)
EXECUTE AS OWNER
AS
$$
import requests
import _snowflake

def run(session):
    token = _snowflake.get_generic_secret_string('bot_token')
    try:
        r = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=20)
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError):
        return {"http": "error", "ok": False, "chats": {}}
    chats = {}
    for u in data.get("result", []):
        msg = u.get("message") or u.get("edited_message") or {}
        chat = msg.get("chat")
        if chat:
            chats[str(chat["id"])] = {"nombre": chat.get("first_name") or chat.get("title"), "texto": msg.get("text")}
    return {"http": r.status_code, "ok": data.get("ok"), "chats": chats}
$$;

-- [tg_chat_ids]
-- Copia el número que aparece en "chats" (es tu chat_id)
CALL TEC_DEMO.AGENTES.TELEGRAM_CHAT_IDS();

-- [tg_prueba]
-- Debe responder 200 y llegarte el mensaje al celular.
-- Ojo: el chat_id es TU id (celda "Descubrir tu chat_id"), no el número que está antes de ':' en el token (ese es el id del bot).
-- ✏️ Reemplaza <TU_CHAT_ID> por tu número (en las dos líneas).
-- 1) Registra tu chat: ENVIAR_TELEGRAM solo manda mensajes a chats de esta lista.
MERGE INTO TEC_DEMO.AGENTES.TELEGRAM_USUARIOS u USING (SELECT '<TU_CHAT_ID>' AS chat_id) s ON u.chat_id = s.chat_id
  WHEN NOT MATCHED THEN INSERT (chat_id, nombre) VALUES (s.chat_id, 'Instructor');
-- 2) Envía la prueba
CALL TEC_DEMO.AGENTES.ENVIAR_TELEGRAM('Hola desde Snowflake · Abarrotera del Centro', '<TU_CHAT_ID>');

-- ======================================================================
-- El reto: que Snowflake te avise solo
-- ======================================================================

-- ======================================================================
-- Respaldo del instructor (Reto A)
-- ======================================================================

-- [resp_notificar]
-- Respaldo completo del Reto A: procedimiento, alert, reanudar y ejecutar
-- CREATE OR REPLACE PROCEDURE TEC_DEMO.AGENTES.NOTIFICAR_QUIEBRE(CHAT_ID VARCHAR)
-- RETURNS VARCHAR LANGUAGE SQL EXECUTE AS OWNER AS
-- $$
-- DECLARE
--   enviados INT DEFAULT 0;
--   c CURSOR FOR
--     SELECT region, ROUND(100 * SUM(dias_sku_quiebre) / NULLIF(SUM(dias_sku), 0), 1) AS tasa
--     FROM TEC_DEMO.ANALITICA.INVENTARIO_MENSUAL
--     WHERE categoria = 'Bebidas' AND mes = (SELECT MAX(mes) FROM TEC_DEMO.ANALITICA.INVENTARIO_MENSUAL)
--     GROUP BY region HAVING SUM(dias_sku_quiebre) / NULLIF(SUM(dias_sku), 0) > 0.20;
--   msg VARCHAR;
-- BEGIN
--   FOR r IN c DO
--     msg := '⚠️ Quiebre de Bebidas en ' || r.region || ': ' || r.tasa || '% (umbral 20%). Procedimiento de abasto: reasignar inventario en 72 h desde el CEDIS más cercano.';
--     CALL TEC_DEMO.AGENTES.ENVIAR_TELEGRAM(:msg, :CHAT_ID);
--     enviados := enviados + 1;
--   END FOR;
--   RETURN enviados || ' alerta(s) enviada(s)';
-- END;
-- $$;
-- CREATE ALERT IF NOT EXISTS TEC_DEMO.AGENTES.ALERTA_QUIEBRE
--   WAREHOUSE = TEC_WH SCHEDULE = '60 MINUTE'
--   IF (EXISTS (
--     SELECT 1 FROM TEC_DEMO.ANALITICA.INVENTARIO_MENSUAL
--     WHERE categoria = 'Bebidas' AND mes = (SELECT MAX(mes) FROM TEC_DEMO.ANALITICA.INVENTARIO_MENSUAL)
--     GROUP BY region HAVING SUM(dias_sku_quiebre) / NULLIF(SUM(dias_sku), 0) > 0.20))
--   THEN CALL TEC_DEMO.AGENTES.NOTIFICAR_QUIEBRE('<CHAT_ID>');
-- ALTER ALERT TEC_DEMO.AGENTES.ALERTA_QUIEBRE RESUME;
-- EXECUTE ALERT TEC_DEMO.AGENTES.ALERTA_QUIEBRE;
SELECT 'Descomenta para usar el respaldo' AS nota;

-- ======================================================================
-- Reto B · Agente de Abasto
-- ======================================================================

-- ======================================================================
-- Respaldo del instructor (Reto B)
-- ======================================================================

-- [resp_agente_abasto]
-- CREATE OR REPLACE AGENT TEC_DEMO.AGENTES.AGENTE_ABASTO
--   COMMENT = 'Recomienda reasignaciones de inventario'
--   PROFILE = '{"display_name": "Agente de Abasto"}'
-- FROM SPECIFICATION $$
-- models:
--   orchestration: auto
-- instructions:
--   response: "Responde en español, breve. Si una región tiene quiebre mayor a 20%, recomienda reasignar inventario en 72 h desde la región con menor quiebre de la misma categoría y cita el procedimiento de abasto. Si el usuario solo ve algunas regiones, dilo y no inventes cifras."
--   orchestration: "Usa 'datos' solo para inventario (tasa_quiebre, dias_inventario) y proveedores (fill rate, perfect order, retraso). Usa 'documentos' para el procedimiento de abasto. 'octubre' sin año es octubre de 2026."
-- tools:
--   - tool_spec: { type: "cortex_analyst_text_to_sql", name: "datos", description: "Inventario y proveedores por mes, región y categoría" }
--   - tool_spec: { type: "cortex_search", name: "documentos", description: "Procedimiento de abasto y políticas" }
-- tool_resources:
--   datos:
--     semantic_view: "TEC_DEMO.ANALITICA.SV_COMERCIAL"
--     execution_environment: { type: "warehouse", warehouse: "TEC_WH", query_timeout: 60 }
--   documentos:
--     search_service: "TEC_DEMO.AGENTES.BUSQUEDA_DOCUMENTOS"
--     title_column: "TITULO"
--     id_column: "DOC_ID"
--     max_results: 3
-- $$;
-- GRANT USAGE ON AGENT TEC_DEMO.AGENTES.AGENTE_ABASTO TO ROLE DIRECTOR_COMERCIAL;
-- GRANT USAGE ON AGENT TEC_DEMO.AGENTES.AGENTE_ABASTO TO ROLE GERENTE_NORTE;
-- GRANT USAGE ON AGENT TEC_DEMO.AGENTES.AGENTE_ABASTO TO ROLE GERENTE_BAJIO;
SELECT 'Descomenta para usar el respaldo' AS nota;

-- ======================================================================
-- Reto C · Pregúntale al agente desde Telegram
-- ======================================================================

-- [tg_tablas_bidireccional]
CREATE TABLE IF NOT EXISTS TEC_DEMO.AGENTES.TELEGRAM_USUARIOS (chat_id VARCHAR, nombre VARCHAR, registrado TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP());
CREATE TABLE IF NOT EXISTS TEC_DEMO.AGENTES.TELEGRAM_ESTADO (clave VARCHAR, valor NUMBER);
MERGE INTO TEC_DEMO.AGENTES.TELEGRAM_USUARIOS u USING (SELECT '{{CHAT_ID}}' AS chat_id) s ON u.chat_id = s.chat_id
  WHEN NOT MATCHED THEN INSERT (chat_id, nombre) VALUES (s.chat_id, 'Instructor');
SELECT * FROM TEC_DEMO.AGENTES.TELEGRAM_USUARIOS;

-- [tg_proc_responder]
CREATE OR REPLACE PROCEDURE TEC_DEMO.AGENTES.RESPONDER_TELEGRAM()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('requests','snowflake-snowpark-python')
HANDLER = 'run'
EXTERNAL_ACCESS_INTEGRATIONS = (TELEGRAM_EAI)
SECRETS = ('bot_token' = TEC_DEMO.AGENTES.TELEGRAM_BOT_TOKEN)
EXECUTE AS OWNER
AS
$$
import json
import re
import requests
import _snowflake

AGENTE = 'TEC_DEMO.AGENTES.AGENTE_COMERCIAL'
MAX_MENSAJES = 3  # por ejecución, para no exceder el tiempo del task

def preguntar_al_agente(session, pregunta):
    cuerpo = json.dumps({"messages": [{"role": "user", "content": [{"type": "text", "text": pregunta}]}]})
    fila = session.sql("SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN(?, ?)", params=[AGENTE, cuerpo]).collect()[0][0]
    r = json.loads(fila)
    texto = " ".join(c.get("text", "") for c in r.get("content", []) if c.get("type") == "text").strip()
    # Telegram en texto plano: quitamos el formato markdown y notas internas que a veces emite el modelo
    texto = re.sub(r"^Run several queries in parallel\.?\s*", "", texto).replace("**", "")
    return (texto or "No encontré una respuesta. Intenta con otra pregunta.")[:4000]

def run(session):
    token = _snowflake.get_generic_secret_string('bot_token')
    api = f"https://api.telegram.org/bot{token}"
    fila = session.sql("SELECT MAX(valor) FROM TEC_DEMO.AGENTES.TELEGRAM_ESTADO WHERE clave = 'offset'").collect()[0][0]
    offset = int(fila) if fila is not None else 0
    autorizados = {r[0] for r in session.sql("SELECT chat_id FROM TEC_DEMO.AGENTES.TELEGRAM_USUARIOS").collect()}

    try:
        r = requests.get(f"{api}/getUpdates", params={"offset": offset, "timeout": 0, "limit": MAX_MENSAJES}, timeout=20)
        r.raise_for_status()
        updates = r.json().get("result", [])
    except (requests.RequestException, ValueError):
        return {"mensajes": 0, "error": "Telegram no respondió; se reintenta en la siguiente ejecución", "offset": offset}
    respondidas = []
    for u in updates:
        offset = max(offset, u["update_id"] + 1)
        msg = u.get("message") or {}
        chat_id, texto = str(msg.get("chat", {}).get("id", "")), (msg.get("text") or "").strip()
        if not chat_id or not texto:
            continue
        if chat_id not in autorizados:
            respuesta = f"Hola. Tu chat_id es {chat_id}. Pide al instructor que lo registre en TELEGRAM_USUARIOS para hablar con el Agente Comercial."
        elif texto.startswith("/start"):
            respuesta = "Soy el Agente Comercial de Abarrotera del Centro. Pregúntame, por ejemplo: ¿Desde qué CEDIS reasigno Bebidas a León?"
        else:
            try:
                requests.post(f"{api}/sendChatAction", json={"chat_id": chat_id, "action": "typing"}, timeout=10)
                respuesta = preguntar_al_agente(session, texto)
            except Exception:
                # No se manda el detalle del error al chat (puede exponer nombres de objetos o SQL)
                respuesta = "El agente no pudo responder en este momento. Intenta de nuevo en unos minutos."
        try:
            requests.post(f"{api}/sendMessage", json={"chat_id": chat_id, "text": respuesta}, timeout=20).raise_for_status()
        except requests.RequestException:
            respuesta = "[no entregada] " + respuesta
        respondidas.append({"chat_id": chat_id, "pregunta": texto[:100], "respuesta": respuesta[:120]})

    session.sql("DELETE FROM TEC_DEMO.AGENTES.TELEGRAM_ESTADO WHERE clave = 'offset'").collect()
    session.sql("INSERT INTO TEC_DEMO.AGENTES.TELEGRAM_ESTADO VALUES ('offset', ?)", params=[offset]).collect()
    return {"mensajes": len(updates), "respondidas": respondidas, "offset": offset}
$$;

-- [tg_responder_prueba]
-- 1) En Telegram escribe a tu bot: ¿Desde qué CEDIS reasigno Bebidas a León?
-- 2) Corre esta celda (tarda lo que tarda el agente, ~1 min). La respuesta llega al celular.
CALL TEC_DEMO.AGENTES.RESPONDER_TELEGRAM();

-- [tg_task]
-- IF NOT EXISTS: si ya lo activaste, re-ejecutar no lo reinicia ni lo suspende.
-- Cada hora para no mantener el warehouse encendido; durante la demo puedes ejecutarlo a mano con EXECUTE TASK.
CREATE TASK IF NOT EXISTS TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK
  WAREHOUSE = TEC_WH
  SCHEDULE = '60 MINUTE'
  USER_TASK_TIMEOUT_MS = 600000
  COMMENT = 'Responde preguntas de Telegram con el Agente Comercial. Activar solo durante la demo.'
AS CALL TEC_DEMO.AGENTES.RESPONDER_TELEGRAM();
-- Si ya existía con otro horario, esto lo ajusta y lo deja SUSPENDIDO (cambiar el horario requiere suspenderlo):
ALTER TASK TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK SUSPEND;
ALTER TASK TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK SET SCHEDULE = '60 MINUTE';
-- Para activarlo durante la demo:
--   ALTER TASK TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK RESUME;
-- Para responder de inmediato sin esperar la hora:
--   EXECUTE TASK TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK;
-- Al terminar:
--   ALTER TASK TEC_DEMO.AGENTES.RESPONDER_TELEGRAM_TASK SUSPEND;
SHOW TASKS LIKE 'RESPONDER_TELEGRAM_TASK' IN SCHEMA TEC_DEMO.AGENTES;
