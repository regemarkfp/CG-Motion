@echo off
title Build CG Motion
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Building CG Motion needs Node.js, which is not installed on this PC.
  echo  1. Download the LTS installer from https://nodejs.org
  echo  2. Install it with the default options
  echo  3. Double-click this file again
  echo.
  pause
  exit /b 1
)
echo.
echo  Step 1 of 2: getting the build tools (the first time this downloads a few hundred MB)...
echo.
call npm install
if errorlevel 1 goto failed
echo.
echo  Step 2 of 2: building the installer and the portable app...
echo.
if exist "build\RegemarkFP.pfx" goto signed
echo  (Not signed: run "Create RegemarkFP certificate.bat" once to sign CG Motion as RegemarkFP.)
set CSC_IDENTITY_AUTO_DISCOVERY=false
goto build
:signed
echo  Signing as RegemarkFP.
set "CSC_LINK=%~dp0build\RegemarkFP.pfx"
set /p CSC_KEY_PASSWORD=<"%~dp0build\RegemarkFP-password.txt"
:build
call npm run dist
if errorlevel 1 goto failed
if exist "docs\CG Motion Guide.pdf" copy /y "docs\CG Motion Guide.pdf" "dist\" >nul
if exist "build\RegemarkFP.cer" (
  copy /y "build\RegemarkFP.cer" "dist\" >nul
  copy /y "tools\Trust RegemarkFP.bat" "dist\" >nul
)
echo.
echo  Done. In the "dist" folder:
echo    CG Motion Setup ^<version^>.exe     installs CG Motion with Start menu and desktop shortcuts
echo    CG Motion ^<version^> Portable.exe  runs without installing (starts a little slower)
echo    CG Motion Guide.pdf                 the user guide (also installed next to CG Motion, Help ^> Open the guide)
if exist "dist\RegemarkFP.cer" echo    RegemarkFP.cer + Trust RegemarkFP.bat  run once on other PCs so they accept the RegemarkFP signature
echo.
start "" "%~dp0dist"
pause
exit /b 0

:failed
echo.
echo  The build stopped with an error (see above).
echo  - Check your internet connection: the first build downloads the Windows installer tools.
echo  - If the error mentions "symbolic link" or "privilege": right-click this file and choose
echo    "Run as administrator" once, or turn on Developer Mode in Windows Settings, then try again.
echo.
pause
exit /b 1
