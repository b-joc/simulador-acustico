# API FastAPI

La interfaz llama a `/api/health` al cargar. Si responde correctamente, muestra
`Motor Python conectado`.

`POST /api/simulate` recibe multipart/form-data con:

- source: voice | sax | upload
- audio_file: WAV, obligatorio para upload
- width_m, length_m, height_m
- absorption
- source_power_db
- max_order
- analysis_frequency_hz

La respuesta incluye el enlace al WAV procesado, RIR, EDC y métricas acústicas.

FastAPI sirve también el frontend desde el mismo origen, por lo que no se
requiere configuración CORS para el uso local o el despliegue monolítico.
