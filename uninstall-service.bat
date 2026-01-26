@echo off
chcp 65001 >nul
title Uninstall MonitorApp Service

echo ========================================
echo   Uninstall MonitorApp Service
echo ========================================
echo.

:: Check for admin rights
net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This script requires Administrator privileges!
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

:: Remove scheduled task
schtasks /delete /tn "MonitorApp" /f

if errorlevel 1 (
    echo [WARNING] Task might not exist or already removed
) else (
    echo [OK] MonitorApp service removed successfully
)

echo.
pause
