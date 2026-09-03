@echo off
cd /d "%~dp0"
echo Iniciando Simulador Acustico en http://127.0.0.1:8000
uv run uvicorn app.api:app --host 127.0.0.1 --port 8000
pause
