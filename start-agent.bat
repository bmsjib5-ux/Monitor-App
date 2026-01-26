@echo off
echo ========================================
echo MonitorApp Remote Agent
echo ========================================
echo.

cd backend

REM Check if virtual environment exists
if not exist "venv\" (
    echo Virtual environment not found. Creating...
    python -m venv venv
    echo.
    echo Installing dependencies...
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)

echo.
echo Starting MonitorApp Agent...
echo Press Ctrl+C to stop
echo.

python agent.py

pause
