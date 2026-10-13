@echo off
title Publish CG Motion to GitHub
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Publishing to GitHub needs Git, which is not installed on this PC.
  echo  1. Download Git for Windows from https://git-scm.com/download/win
  echo  2. Install it with the default options
  echo  3. Double-click this file again
  echo.
  pause
  exit /b 1
)
if exist ".git" goto haverepo
set REPO=https://github.com/regemarkfp/CG-Motion.git
echo.
echo  Uploading to %REPO%
git init -b main
git remote add origin "%REPO%"
:haverepo
for /f "delims=" %%n in ('git config user.name') do set GN=%%n
if "%GN%"=="" (
  git config user.name "RegemarkFP"
  set /p GE=Your GitHub e-mail address: 
)
if not "%GE%"=="" git config user.email "%GE%"
echo.
echo  Saving the changes...
if not exist ".github\workflows" mkdir ".github\workflows"
copy /y "tools\github-build.yml" ".github\workflows\build.yml" >nul
git add -A
git commit -m "CG Motion update %date% %time:~0,5%" >nul
if errorlevel 1 echo  (nothing new to save since the last upload)
echo.
echo  To publish a new version for download (GitHub builds the .exe files), type its number,
echo  for example 1.1. Or just press Enter to only upload the changes.
set VER=
set /p VER=Version: 
echo.
echo  Uploading to GitHub (a sign-in window may open the first time)...
git push -u origin main
if errorlevel 1 (
  echo.
  echo  The repository on GitHub already has files ^(for example a README^). Combining them...
  git pull origin main --allow-unrelated-histories --no-rebase --no-edit -X ours
  git push -u origin main
  if errorlevel 1 goto failed
)
if not "%VER%"=="" (
  git tag -a "v%VER%" -m "CG Motion %VER%"
  git push origin "v%VER%"
  echo.
  echo  Version %VER% is being built on GitHub. In a few minutes it is under Releases on the repository page.
)
echo.
echo  Done. CG Motion is on GitHub. Run this file again after each update.
echo.
pause
exit /b 0
:failed
echo.
echo  The upload stopped (see the message above). Check the repository address and that you
echo  are signed in to the right GitHub account, then try again.
echo.
pause
exit /b 1
