@echo off
title CG Motion (safe mode)
cd /d "%~dp0"
rem Starts CG Motion without graphics acceleration and with the default panel layout.
if not exist "node_modules\electron\dist\electron.exe" (
  echo Run "Start CG Motion.bat" once first.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" . --safe
