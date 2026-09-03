# Refactor del simulador acustico

Este paquete separa el modelo cientifico del notebook Marimo.

## Archivos

- `app/acoustic_engine.py`: motor fisico y de postprocesamiento, sin Marimo, Matplotlib ni sounddevice.
- `simulacion_acustica_refactor.patch`: cambio minimo para que `app/simulacion_acustica.py` use el nuevo motor.
- `tests/test_acoustic_engine.py`: pruebas de regresion de geometria, preprocesamiento y ecuaciones de analisis.

## Objetivo de la primera etapa

Conservar la logica del notebook actual:

- `pyroomacoustics.ShoeBox`
- absorcion uniforme
- Image Source Method
- ray tracing
- absorcion del aire
- 20 C y 50 % HR
- fuente y cinco receptores en las posiciones actuales
- receptor central con indice 2
- bandas de octava 125--4000 Hz
- EDC de Schroeder
- EDT, T20, T30, C50, C80, D50 y Lp

## Hallazgo de validacion

El notebook actual ejecuta primero `room_sim.simulate()` y despues vuelve a llamar a
`room_sim.compute_rir()`. Con `ray_tracing=True`, la segunda llamada puede producir una
RIR distinta debido a la componente estocastica del trazado de rayos. Por tanto, el audio
auralizado y las metricas pueden corresponder a dos realizaciones diferentes.

El nuevo motor permite ambos comportamientos:

```python
simulate_acoustics(..., legacy_recompute_rir=True)
```

reproduce la estructura del notebook antiguo, mientras que:

```python
simulate_acoustics(..., legacy_recompute_rir=False)
```

reutiliza la misma RIR para audio y metricas y es la opcion recomendada para la futura web.

## Aplicar al repositorio

Copiar:

```text
app/acoustic_engine.py
```

al directorio `app/` del repositorio y, desde la raiz del repositorio, aplicar:

```powershell
git apply simulacion_acustica_refactor.patch
```

Tambien se puede modificar manualmente el notebook usando el patch como referencia.

## Pruebas

Desde la raiz del paquete de refactor:

```powershell
$env:PYTHONPATH = "app"
pytest -q tests/test_acoustic_engine.py
```

En el entorno usado para preparar este refactor, las tres pruebas pasan correctamente.

## Siguiente etapa propuesta

Una vez integrado este motor, la futura aplicacion web puede llamar a
`simulate_acoustics()` desde un backend Python (por ejemplo FastAPI). El frontend solo
tendria que enviar parametros y audio y recibir audio procesado, RIR, EDC y metricas.
