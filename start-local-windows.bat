@echo off
setlocal
set "ROOT=%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python launcher was not found. Install Python 3.14 and reopen this window.
  pause
  exit /b 1
)

py -3.14 -c "import fastapi, motor, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Backend packages are missing from Python 3.14.
  echo Install them from the backend folder with: py -3.14 -m pip install -r requirements.txt
  pause
  exit /b 1
)

if not exist "%ROOT%frontend\node_modules\.bin\craco.cmd" (
  echo ERROR: Frontend packages are missing.
  echo Run frontend\start-frontend-windows.bat once to install them.
  pause
  exit /b 1
)

echo Starting ANORA locally. Keep both new terminal windows open.
echo Storefront and admin: http://localhost:3000
echo Backend health:       http://localhost:8001/api/health

start "ANORA API" /D "%ROOT%backend" cmd.exe /k "py -3.14 -m uvicorn server:app --host 127.0.0.1 --port 8001"
start "ANORA Frontend" /D "%ROOT%frontend" "%ROOT%frontend\start-frontend-windows.bat"
