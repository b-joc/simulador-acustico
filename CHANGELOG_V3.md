# Cambios de v3

## Interfaz

- Recupera los siete escenarios geométricos de la consola web original.
- Recupera siete presets didácticos de coeficiente de absorción uniforme.
- Añade tarjetas de presets sin calcular resultados acústicos en JavaScript.
- Añade barras visuales para EDT, T20, T30, C50, C80 y D50 usando exclusivamente resultados de la API.
- Añade laboratorio A/B con dos simulaciones Python, EDC superpuestas, tabla de métricas y dos audios procesados.
- Mantiene voz, saxofón, WAV propio, RIR, EDC, teoría y metodología.

## Motor

- La fuente y los cinco receptores ahora se escalan proporcionalmente con el recinto.
- Para 18 x 30 x 7.5 m las posiciones coinciden con las del Marimo original.
- Esto permite simular los presets pequeños sin colocar receptores fuera de la sala.
- Los rangos de la API se amplían a 6-40 m de ancho, 8-60 m de largo y 2.5-18 m de alto.

## Integridad científica

Los presets son configuraciones de entrada. No contienen un segundo motor de reverberación, RT o RIR en JavaScript. Todas las salidas acústicas continúan proviniendo de `acoustic_engine.py` / `pyroomacoustics`.

Los nombres de materiales se muestran como escenarios didácticos asociados a un único coeficiente uniforme. No deben interpretarse como datos certificados por banda de octava para materiales reales.

## v3.1

- Añade carga de archivos M4A/AAC mediante FFmpeg empaquetado con `imageio-ffmpeg`.
- Conserva WAV como formato de salida procesada para reproducción consistente en navegador.

- v3.2: añade carga de archivos MP3 mediante el mismo pipeline FFmpeg usado para M4A.
