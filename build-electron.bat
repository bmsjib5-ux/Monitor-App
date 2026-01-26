@echo off
title MonitorApp - Electron Build
echo ========================================
echo   MonitorApp Electron Build Script
echo ========================================
echo.

cd /d "%~dp0frontend"

echo [1/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Building React app...
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build React app
    pause
    exit /b 1
)

echo.
echo [3/4] Building Electron app (Windows)...
call npm run electron:build:win
if errorlevel 1 (
    echo ERROR: Failed to build Electron app
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Output files are in: frontend\release
echo.
echo Available builds:
echo   - MonitorApp Setup.exe (Installer)
echo   - MonitorApp-Portable-*.exe (Portable)
echo.

explorer "%~dp0frontend\release"
pause
