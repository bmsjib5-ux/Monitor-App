@echo off
chcp 65001 >nul
title Build MonitorApp Installer

echo ========================================
echo   Build MonitorApp Installer
echo ========================================
echo.

:: Check if Inno Setup is installed
set "ISCC="
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
)

if "%ISCC%"=="" (
    echo [ERROR] Inno Setup 6 is not installed!
    echo.
    echo Please download and install Inno Setup from:
    echo https://jrsoftware.org/isdl.php
    echo.
    echo After installing, run this script again.
    echo.
    start https://jrsoftware.org/isdl.php
    pause
    exit /b 1
)

echo [OK] Found Inno Setup at: %ISCC%
echo.

:: Check if frontend is built
if not exist "frontend\dist\index.html" (
    echo [WARNING] Frontend not built. Building now...
    cd frontend
    call npm run build
    cd ..
    if not exist "frontend\dist\index.html" (
        echo [ERROR] Failed to build frontend!
        pause
        exit /b 1
    )
)

echo [OK] Frontend build found
echo.

:: Create output directory
if not exist "installer-output" mkdir "installer-output"

:: Build the installer
echo Building installer...
echo.
"%ISCC%" installer.iss

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to build installer!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Installer created at:
echo   installer-output\MonitorApp-Setup-1.0.0.exe
echo.

:: Open output folder
explorer "installer-output"

pause
