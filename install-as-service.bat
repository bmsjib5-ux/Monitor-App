@echo off
chcp 65001 >nul
title Install MonitorApp as Windows Service

echo ========================================
echo   Install MonitorApp as Windows Service
echo ========================================
echo.
echo This will install MonitorApp to run automatically at startup
echo.

:: Check for admin rights
net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This script requires Administrator privileges!
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

:: Get current directory
set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

:: Create a scheduled task to run at startup
echo Creating scheduled task...

schtasks /create /tn "MonitorApp" /tr "\"%INSTALL_DIR%\start-client-hidden.vbs\"" /sc onlogon /rl highest /f

if errorlevel 1 (
    echo [ERROR] Failed to create scheduled task
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Service Installation Complete!
echo ========================================
echo.
echo MonitorApp will now start automatically when you log in.
echo.
echo To start now: Run "start-client.bat"
echo To uninstall: Run "uninstall-service.bat"
echo.
pause
