@echo off
chcp 65001 >nul
setlocal
title Zero Protocol 2046 - Online Launcher
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH. Install it first: https://nodejs.org
  echo.
  pause
  exit /b 1
)

where dotnet >nul 2>nul
if errorlevel 1 (
  echo [ERROR] .NET SDK not found in PATH. Install it first: https://dotnet.microsoft.com/download
  echo.
  pause
  exit /b 1
)

node tools\online.mjs %*
set EXITCODE=%errorlevel%

echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] launcher exited with code %EXITCODE%. See the log above.
) else (
  echo [STOPPED] tunnel and server are down.
)
echo.
pause
endlocal
