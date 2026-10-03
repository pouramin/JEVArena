@echo off
setlocal
cd /d "%~dp0"
title JEVArena

echo.
echo [JEVArena] Starting local portable server...
echo [JEVArena] Close this window to stop JEVArena.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"

if errorlevel 1 (
  echo.
  echo JEVArena could not start.
  echo Please check the message above.
  echo.
  pause
)
