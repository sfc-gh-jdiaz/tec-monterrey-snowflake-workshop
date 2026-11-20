# Genera sql/*.sql a partir de notebooks/*.ipynb (celdas SQL en orden, misma lógica que el notebook).
# Uso (desde cualquier carpeta): python3 sql/.generar.py
# 00b_validacion no se genera: su notebook valida con Python (Snowpark); sql/00b_validacion.sql se mantiene a mano.
import json
import re
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
ORDEN = ['00_setup', '01_datos', '02_dynamic_tables', '03_gobierno', '03b_inteligencia', '03c_call_center', '04_semantic_view',
         '04b_mapas', '05_search', '06_agente', '07_reto_coco', '08_reto_extra', '99_limpieza']
EXCLUIR = {'lag_1min_a', 'venta_prueba', 'borrar_prueba'}  # demo en vivo del acto 1 (se corre a mano)


def celdas_sql(nb: str) -> list[str]:
    with open(KIT / 'notebooks' / f'{nb}.ipynb', encoding='utf-8') as f:
        d = json.load(f)
    out = [f'-- {nb}.sql · generado desde notebooks/{nb}.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)']
    for c in d['cells']:
        s = ''.join(c['source']) if isinstance(c['source'], list) else c['source']
        meta = c.get('metadata', {})
        if c['cell_type'] == 'markdown':
            t = s.strip().splitlines()[0] if s.strip() else ''
            if t.startswith('#'):
                out.append(f'\n-- {"=" * 70}\n-- {t.lstrip("# ")}\n-- {"=" * 70}')
            continue
        if s.startswith('%%sql'):
            m = re.match(r'%%sql\s+-r\s+(\w+)', s)
            name = m.group(1) if m else None
            s = s.split('\n', 1)[1] if '\n' in s else ''
        elif meta.get('language') == 'sql':
            name = meta.get('resultVariableName')
        else:
            continue
        if name in EXCLUIR or not s.strip():
            continue
        s = s.strip()
        out.append(f'\n-- [{name}]\n{s if s.endswith(";") else s + ";"}')
    return out


def plantilla_telegram() -> list[str]:
    """sql/telegram_setup.sql: las celdas de Telegram del notebook 08 con marcadores en vez de los nombres del taller."""
    celdas = {'tg_secret', 'tg_accountadmin', 'tg_proc_enviar', 'tg_chat_ids'}
    with open(KIT / 'notebooks' / '08_reto_extra.ipynb', encoding='utf-8') as f:
        d = json.load(f)
    out = ['-- telegram_setup.sql · plantilla para montar el envío a Telegram en OTRA cuenta.',
           '-- Generado desde notebooks/08_reto_extra.ipynb con sql/.generar.py (no editar a mano).',
           '-- Reemplaza <MI_DB>.<MI_ESQUEMA> (debe existir), <MI_ROL> (rol dueño de los procedimientos) y <TOKEN_DEL_BOT>.']
    for c in d['cells']:
        s = ''.join(c['source']) if isinstance(c['source'], list) else c['source']
        m = re.match(r'%%sql\s+-r\s+(\w+)', s)
        if not m or m.group(1) not in celdas:
            continue
        s = s.split('\n', 1)[1].strip()
        s = s.replace('TEC_DEMO.AGENTES', '<MI_DB>.<MI_ESQUEMA>').replace('TEC_ADMIN', '<MI_ROL>').replace('TEC_WH', '<MI_WH>')
        out.append(f'\n-- [{m.group(1)}]\n{s if s.endswith(";") else s + ";"}')
    return out


def main() -> int:
    errores = 0
    try:
        with open(KIT / 'sql' / 'telegram_setup.sql', 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(plantilla_telegram()) + '\n')
        print('telegram_setup (plantilla)')
    except (OSError, json.JSONDecodeError, KeyError) as e:
        print(f'ERROR telegram_setup: {e}', file=sys.stderr)
        errores += 1
    for nb in ORDEN:
        try:
            out = celdas_sql(nb)
        except (OSError, json.JSONDecodeError, KeyError) as e:
            print(f'ERROR {nb}: {e}', file=sys.stderr)
            errores += 1
            continue
        celdas = sum(1 for linea in out if linea.startswith('\n-- ['))
        if not celdas:
            print(f'{nb}: sin celdas SQL, no se genera')
            continue
        with open(KIT / 'sql' / f'{nb}.sql', 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(out) + '\n')
        print(nb, celdas)
    return 1 if errores else 0


if __name__ == '__main__':
    sys.exit(main())
