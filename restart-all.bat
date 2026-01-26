@echo off
echo.
echo ========================================
echo Restarting All Services
echo ========================================
echo.

REM Stop all services
echo [1/3] Stopping all services...
call stop-all.bat
timeout /t 3 /nobreak >nul

REM Start all services
echo.
echo [2/3] Starting all services...
call start-all.bat

echo.
echo [3/3] Done!
echo.
echo ========================================
echo Services Restarted
echo ========================================
echo.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:3001
echo ========================================
echo.
