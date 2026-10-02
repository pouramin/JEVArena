@echo off
setlocal
title JEVArena Build

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto :error
)

call npm run build
if errorlevel 1 goto :error

echo.
echo Build complete. Files are in the dist folder.
echo.
pause
exit /b 0

:error
echo.
echo Build failed. Check the error above.
echo.
pause
exit /b 1
