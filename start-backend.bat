@echo off
chcp 65001 >nul
echo ========================================
echo   MonitorApp - Backend Server
echo ========================================
echo.

cd /d "%~dp0backend"

if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
    echo.
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

if not exist "venv\Lib\site-packages\fastapi\" (
    echo Installing dependencies...
    pip install -r requirements.txt
    echo.
)

echo Starting backend server on port 3001...
echo.
echo   API:  http://localhost:3001
echo   Docs: http://localhost:3001/docs
echo.
echo Press Ctrl+C to stop the server
echo.

python main.py

pause
