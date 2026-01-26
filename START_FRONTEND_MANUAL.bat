@echo off
echo.
echo ========================================
echo Starting Frontend Server (Port 3001)
echo ========================================
echo.

REM Go to frontend directory
cd /d "%~dp0frontend"

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [WARNING] node_modules not found!
    echo Installing dependencies...
    echo This will take a few minutes...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed!
        echo Please check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed
    echo.
)

REM Show current directory
echo Current directory: %CD%
echo.

REM Check package.json
if not exist "package.json" (
    echo [ERROR] package.json not found!
    echo Make sure you are in the frontend directory
    pause
    exit /b 1
)

REM Check vite.config.ts
if not exist "vite.config.ts" (
    echo [ERROR] vite.config.ts not found!
    pause
    exit /b 1
)

echo [OK] All files found
echo.

REM Display config
echo ====================================
echo  Configuration
echo ====================================
echo  Port: 3001
echo  API:  http://localhost:8000
echo ====================================
echo.

REM Check if backend is running
echo [INFO] Checking backend API...
curl -s http://localhost:8000/ >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Backend API is not responding!
    echo.
    echo Make sure backend is running first:
    echo   1. Open another Command Prompt
    echo   2. Run: cd c:\xampp\htdocs\MonitorApp
    echo   3. Run: start-api.bat
    echo.
    echo Press any key to continue anyway...
    pause >nul
) else (
    echo [OK] Backend API is running
)
echo.

REM Check if port 3001 is already in use
netstat -ano | findstr ":3001" >nul 2>&1
if not errorlevel 1 (
    echo [WARNING] Port 3001 is already in use!
    echo.
    echo To free the port:
    echo   1. Find the PID: netstat -ano ^| findstr :3001
    echo   2. Kill it: taskkill /F /PID [PID]
    echo.
    echo Or press Ctrl+C to cancel, fix the issue, and try again
    echo.
    pause
)

REM Start Vite dev server
echo ====================================
echo  Starting Vite Dev Server...
echo ====================================
echo.
echo The server will start on: http://localhost:3001
echo.
echo Once you see "Local: http://localhost:3001",
echo open your browser to that URL
echo.
echo Press Ctrl+C to stop the server
echo ====================================
echo.

REM Run npm dev
call npm run dev

REM If stopped
echo.
echo [INFO] Frontend server stopped
pause
