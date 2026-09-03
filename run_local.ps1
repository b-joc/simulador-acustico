$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Iniciando Simulador Acustico en http://127.0.0.1:8000" -ForegroundColor Cyan
uv run uvicorn app.api:app --host 127.0.0.1 --port 8000
