# Frontend v2 — Simulador acústico

Este directorio contiene la primera interfaz web desacoplada del motor físico.

## Principio de diseño

El JavaScript **no implementa el modelo acústico**. Solo:

- gestiona controles y navegación;
- reproduce el audio seco;
- envía parámetros y audio al backend;
- recibe audio procesado, RIR, EDC y métricas;
- grafica los resultados recibidos;
- presenta los fundamentos teóricos.

La física debe permanecer en `app/acoustic_engine.py`.

## Archivos

- `index.html`: estructura de simulador, resultados, teoría y metodología.
- `styles.css`: diseño responsive oscuro/claro.
- `app.js`: estado de UI, carga de audio, contrato de API y gráficas.

## API esperada

### GET `/api/health`

Respuesta 2xx cuando el backend está listo.

### POST `/api/simulate`

`multipart/form-data`:

- `source`: `voice`, `sax` o `upload`
- `audio_file`: obligatorio solo cuando `source=upload`
- `width_m`
- `length_m`
- `height_m`
- `absorption`
- `source_power_db`
- `max_order`
- `analysis_frequency_hz`

Respuesta JSON esperada:

```json
{
  "simulation_id": "abc123",
  "fs": 44100,
  "processed_audio_url": "/api/results/abc123/processed.wav",
  "metrics": {
    "edt": 1.21,
    "t20": 1.38,
    "t30": 1.43,
    "c50": 1.90,
    "c80": 3.42,
    "d50": 60.7,
    "Lp": 82.1
  },
  "rir": {
    "fs": 44100,
    "samples": [0.0, 0.001, -0.002]
  },
  "edc": {
    "fs": 44100,
    "frequency_hz": 1000,
    "db": [0.0, -0.1, -0.2]
  }
}
```

## Comportamiento sin backend

La interfaz abre y funciona como frontend, pero muestra:

> Frontend listo · motor Python pendiente

El botón Simular no genera resultados aproximados ni ficticios. Esto es intencional: se evita volver a crear un segundo modelo acústico en JavaScript.

## Vista local

Desde este directorio:

```powershell
python -m http.server 8080
```

Abrir `http://localhost:8080`.

Cuando FastAPI sirva estos archivos desde el mismo origen, `app.js` utilizará automáticamente `/api/health` y `/api/simulate`.
