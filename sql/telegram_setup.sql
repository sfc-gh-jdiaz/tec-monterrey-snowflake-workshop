-- telegram_setup.sql · plantilla para montar el envío a Telegram en OTRA cuenta.
-- Generado desde notebooks/08_reto_extra.ipynb con sql/.generar.py (no editar a mano).
-- Reemplaza <MI_DB>.<MI_ESQUEMA> (debe existir), <MI_ROL> (rol dueño de los procedimientos) y <TOKEN_DEL_BOT>.

-- [tg_secret]
-- ✏️ Reemplaza <TOKEN_DEL_BOT> por el token de @BotFather y ejecuta. Después borra el token de esta celda.
-- Si el secreto quedó de una corrida anterior con otro dueño (p. ej. ACCOUNTADMIN), se borra primero para que <MI_ROL> sea el dueño.
USE ROLE ACCOUNTADMIN;
DROP SECRET IF EXISTS <MI_DB>.<MI_ESQUEMA>.TELEGRAM_BOT_TOKEN;
USE ROLE <MI_ROL>;
CREATE OR REPLACE SECRET <MI_DB>.<MI_ESQUEMA>.TELEGRAM_BOT_TOKEN
  TYPE = GENERIC_STRING SECRET_STRING = '<TOKEN_DEL_BOT>';

-- [tg_accountadmin]
-- Salida a internet solo hacia api.telegram.org (regla de red de <MI_ROL>)
CREATE NETWORK RULE IF NOT EXISTS <MI_DB>.<MI_ESQUEMA>.TELEGRAM_NR
  MODE = EGRESS TYPE = HOST_PORT VALUE_LIST = ('api.telegram.org:443');

-- Las integraciones, EXECUTE ALERT y EXECUTE TASK solo los otorga ACCOUNTADMIN
USE ROLE ACCOUNTADMIN;
CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS TELEGRAM_EAI
  ALLOWED_NETWORK_RULES = (<MI_DB>.<MI_ESQUEMA>.TELEGRAM_NR)
  ALLOWED_AUTHENTICATION_SECRETS = (<MI_DB>.<MI_ESQUEMA>.TELEGRAM_BOT_TOKEN)
  ENABLED = TRUE;
GRANT USAGE ON INTEGRATION TELEGRAM_EAI TO ROLE <MI_ROL>;
GRANT EXECUTE ALERT ON ACCOUNT TO ROLE <MI_ROL>;   -- Reto A
GRANT EXECUTE TASK ON ACCOUNT TO ROLE <MI_ROL>;    -- Reto C
USE ROLE <MI_ROL>;

-- [tg_proc_enviar]
-- Dos procedimientos (código: CREATE OR REPLACE para que cada cambio se aplique)
-- ENVIAR_TELEGRAM: manda un mensaje a un chat REGISTRADO en TELEGRAM_USUARIOS (lista permitida)
CREATE TABLE IF NOT EXISTS <MI_DB>.<MI_ESQUEMA>.TELEGRAM_USUARIOS (chat_id VARCHAR, nombre VARCHAR, registrado TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP());

CREATE OR REPLACE PROCEDURE <MI_DB>.<MI_ESQUEMA>.ENVIAR_TELEGRAM(MENSAJE VARCHAR, CHAT_ID VARCHAR)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('requests','snowflake-snowpark-python')
HANDLER = 'run'
EXTERNAL_ACCESS_INTEGRATIONS = (TELEGRAM_EAI)
SECRETS = ('bot_token' = <MI_DB>.<MI_ESQUEMA>.TELEGRAM_BOT_TOKEN)
EXECUTE AS OWNER
AS
$$
import requests
import _snowflake

def run(session, mensaje, chat_id):
    # Solo se envía a chats registrados: evita que el procedimiento mande datos a cualquier chat
    registrado = session.sql("SELECT COUNT(*) FROM <MI_DB>.<MI_ESQUEMA>.TELEGRAM_USUARIOS WHERE chat_id = ?", params=[str(chat_id)]).collect()[0][0]
    if not registrado:
        return f"RECHAZADO: el chat_id {chat_id} no está en <MI_DB>.<MI_ESQUEMA>.TELEGRAM_USUARIOS"
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
CREATE OR REPLACE PROCEDURE <MI_DB>.<MI_ESQUEMA>.TELEGRAM_CHAT_IDS()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('requests','snowflake-snowpark-python')
HANDLER = 'run'
EXTERNAL_ACCESS_INTEGRATIONS = (TELEGRAM_EAI)
SECRETS = ('bot_token' = <MI_DB>.<MI_ESQUEMA>.TELEGRAM_BOT_TOKEN)
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
CALL <MI_DB>.<MI_ESQUEMA>.TELEGRAM_CHAT_IDS();
