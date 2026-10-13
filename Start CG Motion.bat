@echo off
title CG Motion
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  CG Motion needs Node.js, which is not installed on this PC.
  echo  1. Download the LTS installer from https://nodejs.org
  echo  2. Install it with the default options
  echo  3. Double-click this file again
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo  First run: downloading the app shell and Lottie player. This takes a few minutes and only happens once.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  The download failed. Check your internet connection and run this file again.
    pause
    exit /b 1
  )
)
start "" "node_modules\electron\dist\electron.exe" .
