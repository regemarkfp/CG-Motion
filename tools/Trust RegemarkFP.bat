@echo off
title Trust RegemarkFP
cd /d "%~dp0"
echo.
echo  This makes Windows on this PC accept programs signed by RegemarkFP (such as CG Motion).
echo  Windows will ask you to confirm - click Yes.
echo.
certutil -user -addstore Root "%~dp0RegemarkFP.cer"
certutil -user -addstore TrustedPublisher "%~dp0RegemarkFP.cer"
echo.
echo  Done.
pause
