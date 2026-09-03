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
