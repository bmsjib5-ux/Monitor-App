@echo off
chcp 65001 >nul
echo ========================================
echo   MonitorApp - Frontend Server
echo ========================================
echo.

cd /d "%~dp0frontend"

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js found

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing npm dependencies...
    npm install
    echo.
)

echo.
echo Starting frontend on http://localhost:5173
echo Backend API should be running on http://localhost:3001
echo.
echo Press Ctrl+C to stop the server
echo.

npm run dev

pause
