@echo off
REM ======================================
REM MonitorApp - Backend Setup
REM ======================================

echo.
echo ====================================
echo  MonitorApp Backend Setup
echo ====================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.8 or higher from https://www.python.org/
    pause
    exit /b 1
)

echo [OK] Python found:
python --version
echo.

REM Navigate to backend directory
cd backend

REM Create virtual environment (optional but recommended)
echo [1] Creating virtual environment...
if exist "venv" (
    echo [INFO] Virtual environment already exists
) else (
    python -m venv venv
    echo [OK] Virtual environment created
)
echo.

REM Activate virtual environment
echo [2] Activating virtual environment...
call venv\Scripts\activate.bat
echo.

REM Upgrade pip
echo [3] Upgrading pip...
python -m pip install --upgrade pip --quiet
echo [OK] pip upgraded
echo.

REM Install dependencies
echo [4] Installing dependencies...
echo This may take a few minutes...
pip install -r requirements_supabase.txt
echo [OK] Dependencies installed
echo.

REM Create .env file if not exists
cd ..
if not exist ".env" (
    echo [5] Creating .env file...
    copy .env.example .env
    echo [OK] .env file created
    echo.
    echo [IMPORTANT] Please edit .env file with your Supabase credentials:
    echo   - SUPABASE_URL
    echo   - SUPABASE_KEY
    echo.
) else (
    echo [5] .env file already exists
    echo.
)

REM Create logs directory
if not exist "backend\logs" (
    mkdir backend\logs
    echo [6] Created logs directory
) else (
    echo [6] Logs directory already exists
)
echo.

REM Test Supabase connection
echo [7] Testing Supabase connection...
python test_supabase_final.py
echo.

echo ====================================
echo  Setup Complete!
echo ====================================
echo.
echo Next steps:
echo  1. Edit .env file if needed
echo  2. Run start-api.bat to start the server
echo  3. Open http://localhost:8000/docs for API documentation
echo.
pause
