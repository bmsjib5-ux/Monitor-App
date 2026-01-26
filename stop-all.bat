@echo off
chcp 65001 >nul
echo ========================================
echo   MonitorApp - Stop All Services
echo ========================================
echo.

echo Stopping Backend (Python)...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq MonitorApp*" 2>nul
taskkill /F /FI "WINDOWTITLE eq MonitorApp-Backend*" 2>nul

echo Stopping Frontend (Node)...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq MonitorApp*" 2>nul
taskkill /F /FI "WINDOWTITLE eq MonitorApp-Frontend*" 2>nul

echo.
echo [OK] All services stopped
echo.
pause
