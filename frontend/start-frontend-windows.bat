@echo off
setlocal
cd /d "%~dp0"
title ANORA - Frontend

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install the current Node.js LTS version from https://nodejs.org/ and reopen this window.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js LTS and reopen this window.
  pause
  exit /b 1
)

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo Created frontend .env from .env.example.
  )
)

if not exist node_modules\.bin\craco.cmd (
  echo Installing frontend packages. This may take several minutes...
  call npm install --legacy-peer-deps --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Package installation failed. Check internet access and the error above.
    pause
    exit /b 1
  )
)

echo.
echo Starting ANORA frontend. Keep this window open.
echo When ready, open http://localhost:3000 in Chrome.
echo API requests expect the backend at http://localhost:8001.
echo.
call npm start
if errorlevel 1 pause
