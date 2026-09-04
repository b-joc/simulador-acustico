# Simulador acústico web · v3

Aplicación web de acústica de recintos basada en **FastAPI + pyroomacoustics**. La interfaz no implementa un segundo modelo acústico en JavaScript: toda RIR, EDC, métrica y auralización se calcula en Python.

## Novedades de v3

- Presets de **tipo de recinto** recuperados de la consola web original.
- Presets didácticos de **coeficiente de absorción uniforme**.
- Geometría de fuente y cinco receptores escalada proporcionalmente para permitir recintos pequeños y grandes, conservando exactamente el caso 18 × 30 × 7.5 m del modelo de referencia.
- Visualización ampliada de EDT, T20, T30, C50, C80 y D50 mediante barras alimentadas por los resultados reales de la API.
- Laboratorio **A/B**: dos simulaciones pyroomacoustics independientes con EDC superpuestas, tabla de diferencias y audio procesado para A y B.
- Se mantiene la selección de voz, saxofón o audio propio en WAV/M4A/MP3, RIR, EDC, teoría y metodología.

> Los nombres de materiales de los presets son escenarios didácticos asociados a un único α uniforme. No sustituyen coeficientes de absorción por bandas de octava medidos para materiales reales.

## Ejecutar localmente

```powershell
uv sync
uv run uvicorn app.api:app --host 127.0.0.1 --port 8000
```

Abrir: `http://127.0.0.1:8000`

También puedes usar `run_local.bat` o `run_local.ps1`.

## Cloud Run

El servicio debe iniciar con:

```text
uvicorn app.api:app --host 0.0.0.0 --port 8080
```

Si Cloud Build está conectado a la rama `main`, un `git push` a `main` genera una nueva revisión automáticamente. Para desarrollo, trabajar primero en una rama como `feature/v3-interface`.

## Estructura

```text
app/
  acoustic_engine.py   motor científico
  api.py               API FastAPI
web/
  index.html
  styles.css
  app.js               simulación principal
  presets.js           datos de escenarios
  v3.js                 presets, barras y comparación A/B
tests/
```

## Validación

La suite incluye pruebas de:

- preprocesamiento de audio;
- geometría del caso de referencia;
- equivalencia del análisis extraído con las ecuaciones legacy;
- geometría escalada dentro de un recinto pequeño;
- entrega de WAV reproducible por la API;
- aceptación de presets de recintos pequeños por la API.
