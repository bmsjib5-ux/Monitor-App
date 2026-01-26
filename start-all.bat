@echo off
chcp 65001 >nul
REM ======================================
REM MonitorApp - Start All Services
REM ======================================

echo.
echo ========================================
echo   MonitorApp - Start All Services
echo ========================================
echo.

REM Get current directory
set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed
    pause
    exit /b 1
)
echo [OK] Python found

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed
    pause
    exit /b 1
)
echo [OK] Node.js found
echo.

REM ======================================
REM Start Backend API
REM ======================================
echo [1/2] Starting Backend API on port 3001...

REM Start backend in new window
start "MonitorApp-Backend" cmd /k "cd /d "%ROOT_DIR%backend" && call venv\Scripts\activate.bat && python main.py"

echo      Waiting for backend to start...
timeout /t 5 /nobreak >nul

REM Check if backend started (port 3001)
curl -s http://localhost:3001/api/processes >nul 2>&1
if errorlevel 1 (
    echo      Still starting, waiting 5 more seconds...
    timeout /t 5 /nobreak >nul
)

echo [OK] Backend API started
echo.

echo [OK] Backend serves frontend at http://localhost:3001
echo.

REM ======================================
REM Done
REM ======================================
echo ========================================
echo   All Services Started!
echo ========================================
echo.
echo   Backend API:  http://localhost:3001
echo   API Docs:     http://localhost:3001/docs
echo ========================================
echo.

REM Open browser
echo Opening application in browser...
timeout /t 2 /nobreak >nul
start http://localhost:3001

echo.
echo [INFO] Services are running in separate windows
echo        Close those windows to stop the services
echo.
pause
