@echo off
chcp 65001 >nul
echo ============================================
echo    Monitor App - Database Setup
echo ============================================
echo.

cd /d "%~dp0backend"

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
echo [INFO] Installing dependencies...
pip install aiomysql -q

REM Run database setup
echo.
echo [INFO] Setting up database...
python setup_database.py

echo.
echo ============================================
echo    Setup Complete!
echo ============================================
pause
