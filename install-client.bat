@echo off
chcp 65001 >nul
title MonitorApp Client Installation

echo ========================================
echo   MonitorApp Client Installation
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed!
    echo Please install Python 3.10+ from https://python.org
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

echo [OK] Python found
python --version

:: Create data directory
if not exist "backend\data" mkdir "backend\data"

:: Install Python dependencies
echo.
echo Installing Python dependencies...
cd backend
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo To start the application:
echo   1. Run "start-client.bat"
echo   2. Open browser to http://localhost:3001
echo   3. Select "Client Mode"
echo.
pause
