# Simulador acústico web — versión funcional local

Esta versión conecta el frontend HTML/CSS/JavaScript con el motor científico
`pyroomacoustics` mediante FastAPI.

## Arquitectura

```text
Navegador
   │
   ├─ HTML/CSS/JS  (interfaz, reproducción y gráficas)
   │
   └─ /api/simulate
          │
          ▼
      FastAPI
          │
          ▼
   acoustic_engine.py
          │
          ▼
   pyroomacoustics + SciPy + NumPy
```

El frontend **no calcula reverberación en JavaScript**.

## Ejecutar en Windows

1. Abre PowerShell en esta carpeta.
2. Ejecuta:

```powershell
uv sync
```

3. Inicia la aplicación:

```powershell
uv run uvicorn app.api:app --host 127.0.0.1 --port 8000
```

También puedes ejecutar `run_local.ps1` o `run_local.bat`.

4. Abre:

```text
http://127.0.0.1:8000
```

No uses `python -m http.server` para esta versión: ese comando sirve solo el
frontend y no inicia la API Python.

## Audio

- Voz humana: audio de ejemplo original, descargado y almacenado en caché la
  primera vez que se simula.
- Saxofón: mismo comportamiento.
- Audio propio: primera versión limitada a WAV para mantener una cadena de
  decodificación reproducible con SciPy.
- Límite de prototipo: 25 MB / 60 s.

## Endpoints

- `GET /api/health`
- `POST /api/simulate`
- `GET /api/results/{id}/processed.wav`

## Consistencia científica

La API usa `legacy_recompute_rir=False`: el audio auralizado, la RIR, la EDC y
las métricas provienen de la **misma realización acústica**. Esto evita la
segunda llamada estocástica a `compute_rir()` detectada en el Marimo original.

## Correccion v2: reproductor de audio procesado

Esta revision corrige un problema de interfaz de la primera entrega: la capa de espera del reproductor podia permanecer visible aunque la API ya hubiera generado `processed.wav`. El frontend ahora descarga explicitamente el resultado, verifica que contenga datos, lo convierte a un `Blob` `audio/wav` y solo entonces habilita visualmente el reproductor. El endpoint del WAV se entrega ademas con disposicion `inline` y sin cache.
