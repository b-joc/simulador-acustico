"""FastAPI bridge between the web frontend and the scientific acoustic engine.

The frontend performs no acoustic calculations. Every simulated result comes
from ``acoustic_engine.py`` / pyroomacoustics.
"""

from __future__ import annotations

import io
import json
import shutil
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Annotated

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from scipy.io import wavfile

from .acoustic_engine import OCTAVE_BANDS_HZ, RoomConfig, simulate_acoustics


BASE_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = BASE_DIR / "web"
RESULTS_DIR = BASE_DIR / "runtime_results"
EXAMPLE_CACHE_DIR = BASE_DIR / "runtime_cache" / "examples"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
EXAMPLE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_AUDIO_SECONDS = 60.0
MAX_RESULT_DIRECTORIES = 24

EXAMPLE_AUDIO = {
    "voice": {
        "filename": "voz.wav",
        "url": "https://raw.githubusercontent.com/LuAViVA/Proyecto-Acustica/97c3b02797b7fbf216960295b8ea2b6303fdc51e/voz.wav",
    },
    "sax": {
        "filename": "saxofon.wav",
        "url": "https://raw.githubusercontent.com/LuAViVA/Proyecto-Acustica/97c3b02797b7fbf216960295b8ea2b6303fdc51e/saxof%C3%B3n.wav",
    },
}

app = FastAPI(
    title="Simulador acústico de auditorio",
    version="0.1.0",
    description="API para auralización y parámetros acústicos mediante pyroomacoustics.",
)


def _clean_number(value: float, name: str, lo: float, hi: float) -> float:
    if not np.isfinite(value) or value < lo or value > hi:
        raise HTTPException(422, f"{name} debe estar entre {lo} y {hi}.")
    return float(value)


def _validate_config(
    width_m: float,
    length_m: float,
    height_m: float,
    absorption: float,
    source_power_db: float,
    max_order: int,
    analysis_frequency_hz: int,
) -> RoomConfig:
    width_m = _clean_number(width_m, "width_m", 10.0, 30.0)
    length_m = _clean_number(length_m, "length_m", 24.0, 50.0)
    height_m = _clean_number(height_m, "height_m", 3.0, 15.0)
    absorption = _clean_number(absorption, "absorption", 0.05, 0.95)
    source_power_db = _clean_number(source_power_db, "source_power_db", 60.0, 130.0)

    if max_order < 1 or max_order > 10:
        raise HTTPException(422, "max_order debe estar entre 1 y 10.")
    if analysis_frequency_hz not in OCTAVE_BANDS_HZ:
        raise HTTPException(
            422,
            f"analysis_frequency_hz debe ser una de estas bandas: {list(OCTAVE_BANDS_HZ)}.",
        )

    return RoomConfig(
        width_m=width_m,
        length_m=length_m,
        height_m=height_m,
        absorption=absorption,
        max_order=int(max_order),
        source_power_db=source_power_db,
        analysis_frequency_hz=int(analysis_frequency_hz),
    )


def _read_wav_bytes(raw: bytes, label: str) -> tuple[int, np.ndarray]:
    try:
        fs, audio = wavfile.read(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(400, f"No fue posible leer {label} como WAV: {exc}") from exc

    if fs < 8000 or fs > 192000:
        raise HTTPException(422, f"Frecuencia de muestreo no soportada: {fs} Hz.")
    if audio.size == 0:
        raise HTTPException(422, "El archivo de audio está vacío.")

    duration = len(audio) / float(fs)
    if duration > MAX_AUDIO_SECONDS:
        raise HTTPException(
            413,
            f"El audio dura {duration:.1f} s. Para esta versión el máximo es {MAX_AUDIO_SECONDS:.0f} s.",
        )
    return int(fs), np.asarray(audio)


def _download_example(source: str) -> bytes:
    spec = EXAMPLE_AUDIO[source]
    cached = EXAMPLE_CACHE_DIR / spec["filename"]
    if cached.exists() and cached.stat().st_size > 44:
        return cached.read_bytes()

    try:
        request = urllib.request.Request(
            spec["url"],
            headers={"User-Agent": "Simulador-Acustico-Auditorio/0.1"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read(MAX_UPLOAD_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise HTTPException(
            503,
            "No fue posible descargar el audio de ejemplo. Comprueba la conexión a Internet "
            "o usa la opción 'Subir audio'.",
        ) from exc

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "El audio de ejemplo excede el límite permitido.")
    cached.write_bytes(raw)
    return raw


async def _load_source_audio(source: str, audio_file: UploadFile | None) -> tuple[int, np.ndarray]:
    if source in EXAMPLE_AUDIO:
        return _read_wav_bytes(_download_example(source), f"audio de ejemplo '{source}'")

    if source != "upload":
        raise HTTPException(422, "source debe ser 'voice', 'sax' o 'upload'.")
    if audio_file is None:
        raise HTTPException(422, "Debes seleccionar un archivo WAV.")

    filename = (audio_file.filename or "audio.wav").lower()
    if not filename.endswith(".wav"):
        raise HTTPException(415, "La primera versión acepta únicamente archivos WAV.")

    raw = await audio_file.read(MAX_UPLOAD_BYTES + 1)
    await audio_file.close()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "El archivo supera el límite de 25 MB.")
    return _read_wav_bytes(raw, audio_file.filename or "audio.wav")


def _finite_or_none(value: float) -> float | None:
    number = float(value)
    return number if np.isfinite(number) else None


def _write_processed_wav(path: Path, fs: int, audio: np.ndarray) -> None:
    data = np.asarray(audio, dtype=np.float64)
    data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
    data = np.clip(data, -1.0, 1.0)
    pcm = np.round(data * 32767.0).astype(np.int16)
    wavfile.write(path, fs, pcm)


def _trim_old_results() -> None:
    dirs = [p for p in RESULTS_DIR.iterdir() if p.is_dir()]
    dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for old in dirs[MAX_RESULT_DIRECTORIES:]:
        shutil.rmtree(old, ignore_errors=True)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "engine": "pyroomacoustics",
        "octave_bands_hz": list(OCTAVE_BANDS_HZ),
        "max_audio_seconds": MAX_AUDIO_SECONDS,
        "upload_format": "wav",
    }


@app.post("/api/simulate")
async def simulate(
    source: Annotated[str, Form()],
    width_m: Annotated[float, Form()],
    length_m: Annotated[float, Form()],
    height_m: Annotated[float, Form()],
    absorption: Annotated[float, Form()],
    source_power_db: Annotated[float, Form()],
    max_order: Annotated[int, Form()],
    analysis_frequency_hz: Annotated[int, Form()],
    audio_file: Annotated[UploadFile | None, File()] = None,
) -> dict[str, object]:
    config = _validate_config(
        width_m,
        length_m,
        height_m,
        absorption,
        source_power_db,
        max_order,
        analysis_frequency_hz,
    )
    fs, audio = await _load_source_audio(source, audio_file)

    started = time.perf_counter()
    try:
        result = simulate_acoustics(
            audio,
            fs,
            config,
            preprocess=True,
            # One acoustic realization is used for both auralization and metrics.
            legacy_recompute_rir=False,
        )
    except Exception as exc:
        raise HTTPException(500, f"Falló la simulación acústica: {exc}") from exc

    simulation_id = uuid.uuid4().hex[:16]
    result_dir = RESULTS_DIR / simulation_id
    result_dir.mkdir(parents=True, exist_ok=False)
    processed_path = result_dir / "processed.wav"
    _write_processed_wav(processed_path, result.fs, result.processed_audio)

    metadata = {
        "source": source,
        "fs": result.fs,
        "duration_s": len(audio) / float(result.fs),
        "elapsed_s": time.perf_counter() - started,
        "config": config.__dict__,
    }
    (result_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    _trim_old_results()

    return {
        "simulation_id": simulation_id,
        "fs": result.fs,
        "processed_audio_url": f"/api/results/{simulation_id}/processed.wav",
        "metrics": {key: _finite_or_none(value) for key, value in result.metrics.items()},
        "rir": {
            "fs": result.fs,
            "samples": np.asarray(result.central_rir, dtype=float).tolist(),
        },
        "edc": {
            "fs": result.fs,
            "frequency_hz": config.analysis_frequency_hz,
            "db": np.asarray(result.selected_edc_db, dtype=float).tolist(),
        },
        "elapsed_s": metadata["elapsed_s"],
    }


@app.get("/api/results/{simulation_id}/processed.wav")
def processed_audio(simulation_id: str) -> FileResponse:
    if not simulation_id.isalnum() or len(simulation_id) > 32:
        raise HTTPException(404, "Resultado no encontrado.")
    path = RESULTS_DIR / simulation_id / "processed.wav"
    if not path.is_file():
        raise HTTPException(404, "Resultado no encontrado.")
    return FileResponse(
        path,
        media_type="audio/wav",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": "inline; filename=processed.wav",
        },
    )


# Mount the static frontend last so /api/* routes keep priority.
app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="frontend")
