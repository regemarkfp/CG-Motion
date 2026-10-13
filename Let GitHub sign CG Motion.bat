@echo off
title Let GitHub sign CG Motion
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\github-secret.ps1"
echo.
pause
