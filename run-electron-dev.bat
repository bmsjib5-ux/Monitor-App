@echo off
title MonitorApp - Electron Dev Mode
echo ========================================
echo   MonitorApp Electron Development
echo ========================================
echo.

cd /d "%~dp0frontend"

echo Checking dependencies...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting Electron in development mode...
echo (Backend will start automatically)
echo.
call npm run electron:dev

pause
