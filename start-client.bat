@echo off
chcp 65001 >nul
title MonitorApp Client

echo ========================================
echo   MonitorApp Client - Starting...
echo ========================================
echo.

cd /d "%~dp0backend"

:: Check if port 3001 is in use
netstat -ano | findstr ":3001" >nul 2>&1
if not errorlevel 1 (
    echo [WARNING] Port 3001 is already in use
    echo Please close any application using port 3001
    echo.
)

echo Starting MonitorApp Backend on port 3001...
echo.
echo Browser will open automatically...
echo Press Ctrl+C to stop the server
echo.

:: Open browser after 3 seconds
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3001"

:: Start the backend
python main.py

pause
