@echo off
title RegemarkFP certificate
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\make-cert.ps1"
if errorlevel 1 (
  echo.
  echo  Making the certificate failed, see the message above.
)
echo.
pause
