@echo off
setlocal
title JEVArena

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is required to run JEVArena.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo [JEVArena] Installing dependencies for the first run...
  echo.
  call npm install
  if errorlevel 1 goto :error
)

echo.
echo [JEVArena] Starting local server...
echo [JEVArena] Your browser will open automatically.
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173/JEVArena/"
call npm run dev -- --host 127.0.0.1

exit /b 0

:error
echo.
echo JEVArena could not start. Check the error above.
echo.
pause
exit /b 1
