@echo off
echo.
echo ========================================
echo Restarting Backend Server
echo ========================================
echo.

REM Kill any existing backend processes
echo Stopping existing backend...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *uvicorn*" 2>nul
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *main:app*" 2>nul
timeout /t 2 /nobreak >nul

REM Start backend
echo.
echo Starting backend with new code...
cd backend
start "Monitor API Server" cmd /k "python main.py"
cd ..

echo.
echo ========================================
echo Backend server restarted!
echo ========================================
echo.
echo Wait 5 seconds for server to start...
timeout /t 5 /nobreak >nul
echo.
echo Testing endpoint...
curl http://localhost:8000/api/processes >nul 2>&1
if %errorlevel% == 0 (
    echo [SUCCESS] Backend is running!
    echo.
    echo Now you can:
    echo 1. Refresh browser (Ctrl+Shift+R)
    echo 2. Test Edit/Save feature
) else (
    echo [ERROR] Backend failed to start
    echo Check the backend window for errors
)
echo.
pause
