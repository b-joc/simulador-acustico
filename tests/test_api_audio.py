from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient
from scipy.io import wavfile

from app import api


def test_processed_audio_is_inline_playable_wav(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "RESULTS_DIR", tmp_path)
    simulation_id = "abc123"
    result_dir = tmp_path / simulation_id
    result_dir.mkdir(parents=True)
    output = result_dir / "processed.wav"
    fs = 16000
    t = np.arange(int(0.1 * fs)) / fs
    audio = 0.25 * np.sin(2 * np.pi * 440 * t)
    api._write_processed_wav(output, fs, audio)

    client = TestClient(api.app)
    response = client.get(f"/api/results/{simulation_id}/processed.wav")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.headers.get("content-disposition", "").startswith("inline")
    assert response.content[:4] == b"RIFF"
    assert response.content[8:12] == b"WAVE"
    read_fs, decoded = wavfile.read(BytesIO(response.content))
    assert read_fs == fs
    assert decoded.size > 0


def test_v3_api_accepts_small_room_presets():
    cfg = api._validate_config(7.0, 10.0, 3.5, 0.5, 100.0, 3, 1000)
    assert cfg.width_m == 7.0
    assert cfg.length_m == 10.0
    assert cfg.height_m == 3.5


def test_uploaded_m4a_is_decoded_to_pcm(tmp_path):
    """The upload path accepts a real M4A/AAC container and returns PCM samples."""
    import subprocess

    from imageio_ffmpeg import get_ffmpeg_exe

    fs = 16000
    t = np.arange(int(0.25 * fs)) / fs
    tone = (0.2 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)
    source_wav = tmp_path / "source.wav"
    encoded_m4a = tmp_path / "source.m4a"
    wavfile.write(source_wav, fs, tone)

    subprocess.run(
        [
            get_ffmpeg_exe(),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source_wav),
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-y",
            str(encoded_m4a),
        ],
        check=True,
    )

    decoded_fs, decoded = api._read_uploaded_audio_bytes(encoded_m4a.read_bytes(), "source.m4a")

    assert decoded_fs == fs
    assert decoded.size > 0
    assert decoded.ndim in (1, 2)


def test_uploaded_mp3_is_decoded_to_pcm(tmp_path):
    """The upload path accepts a real MP3 container and returns PCM samples."""
    import subprocess

    from imageio_ffmpeg import get_ffmpeg_exe

    fs = 16000
    t = np.arange(int(0.25 * fs)) / fs
    tone = (0.2 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)
    source_wav = tmp_path / "source.wav"
    encoded_mp3 = tmp_path / "source.mp3"
    wavfile.write(source_wav, fs, tone)

    subprocess.run(
        [
            get_ffmpeg_exe(),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source_wav),
            "-c:a",
            "libmp3lame",
            "-b:a",
            "96k",
            "-y",
            str(encoded_mp3),
        ],
        check=True,
    )

    decoded_fs, decoded = api._read_uploaded_audio_bytes(encoded_mp3.read_bytes(), "source.mp3")

    assert decoded_fs == fs
    assert decoded.size > 0
    assert decoded.ndim in (1, 2)


def test_health_reports_mp3_support():
    payload = api.health()
    assert "mp3" in payload["upload_formats"]
