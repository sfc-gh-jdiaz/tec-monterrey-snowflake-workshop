"""Genera un MP3 por guion con voces neuronales de Microsoft Edge (edge-tts) y ffmpeg.

Uso (desde datos/audios/guiones/): pip install edge-tts && python generar_audios.py "llamada_11_*.md"
Los mp3 quedan en datos/audios/, que es la carpeta que copia 01_datos al stage TEC_DEMO.RAW.AUDIOS."""
import asyncio
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

BASE = Path(__file__).parent
OUT = BASE.parent
FEMALE = {"Sofía", "Lorena", "Daniela", "Mariana", "Paola", "Patricia",
          "Fernanda", "Gabriela", "Mónica", "Verónica", "Margarita",
          "Elizabeth"}
VOICES = {  # (es_agente, es_mujer) -> voz
    (True, True): "es-MX-DaliaNeural",
    (True, False): "es-MX-JorgeNeural",
    (False, True): "es-US-PalomaNeural",
    (False, False): "es-US-AlonsoNeural",
}
LINE = re.compile(r"^\*\*(\w[\w ]*?) \((\w+)\):\*\*\s*(.+)$")


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return float(out.stdout.strip() or 0)


async def build(md: Path, tmp: Path) -> None:
    parts = []
    for i, raw in enumerate(md.read_text(encoding="utf-8").splitlines()):
        m = LINE.match(raw.strip())
        if not m:
            continue
        role, name, text = m.groups()
        agent = role == "Agente"
        voice = VOICES[(agent, name in FEMALE)]
        # Agente: ritmo calmado; tienda: un poco más rápido, como quien trae prisa
        rate = "+0%" if agent else "+8%"
        clip = tmp / f"{i:04d}.mp3"
        wav = tmp / f"{i:04d}.wav"
        # ~0.04 s por caracter; si el audio sale muy corto, la respuesta vino truncada
        min_secs = len(text) * 0.025
        for attempt in range(6):
            try:
                await edge_tts.Communicate(text, voice, rate=rate).save(str(clip))
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(clip),
                                "-ar", "24000", "-ac", "1", str(wav)], check=True)
                if duration(wav) >= min_secs:
                    break
            except (edge_tts.exceptions.NoAudioReceived, subprocess.CalledProcessError):
                pass
            if attempt == 5:
                raise RuntimeError(f"Fragmento {i} de {md.name} no se pudo generar")
            await asyncio.sleep(2 * (attempt + 1))
        parts.append(wav)
    silence = tmp / "silence.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "anullsrc=r=24000:cl=mono", "-t", "0.35", str(silence)], check=True)
    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{p}'\nfile '{silence}'\n" for p in parts))
    out = OUT / f"{md.stem}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", str(lst), "-ar", "44100", "-ac", "1", "-b:a", "128k", str(out)], check=True)
    print(f"OK {out.name}", flush=True)


async def main(pattern: str) -> None:
    OUT.mkdir(exist_ok=True)
    for md in sorted(BASE.glob(pattern)):
        with tempfile.TemporaryDirectory() as d:
            await build(md, Path(d))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "llamada_*.md"))
