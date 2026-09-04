# API v3

## `GET /api/health`
Comprueba que FastAPI y el motor Python están activos.

## `POST /api/simulate`
`multipart/form-data` con:

- `source`: `voice`, `sax` o `upload`
- `width_m`: 6–40 m
- `length_m`: 8–60 m
- `height_m`: 2.5–18 m
- `absorption`: 0.05–0.95
- `source_power_db`: 60–130 dB
- `max_order`: 1–10
- `analysis_frequency_hz`: 125, 250, 500, 1000, 2000 o 4000 Hz
- `audio_file`: WAV, M4A o MP3 cuando `source=upload`

Devuelve URL del WAV procesado, métricas, RIR, EDC y tiempo de ejecución.

La comparación A/B de v3 llama este mismo endpoint dos veces; no existe un segundo motor físico en el navegador.
