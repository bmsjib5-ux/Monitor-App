@echo off
echo ============================================================
echo MonitorApp - Complete Build Script
echo ============================================================
echo.

REM Check if in correct directory
if not exist "backend\main.py" (
    echo ERROR: Please run this script from MonitorApp root directory
    pause
    exit /b 1
)

REM Step 1: Install build dependencies
echo [Step 1/5] Installing build dependencies...
pip install pyinstaller --quiet
if %errorlevel% neq 0 (
    echo ERROR: Failed to install PyInstaller
    pause
    exit /b 1
)
echo Done!
echo.

REM Step 2: Build Backend and Agent executables
echo [Step 2/5] Building executables (this may take a few minutes)...
python setup.py
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo Done!
echo.

REM Step 3: Build Frontend (optional)
echo [Step 3/5] Building Frontend...
if exist "frontend\package.json" (
    cd frontend
    echo Installing frontend dependencies...
    call npm install --silent
    echo Building frontend...
    call npm run build
    if %errorlevel% neq 0 (
        echo WARNING: Frontend build failed, continuing anyway...
    ) else (
        echo Frontend build completed!
    )
    cd ..
) else (
    echo Frontend directory not found, skipping...
)
echo.

REM Step 4: Create icon if not exists
echo [Step 4/5] Preparing assets...
if not exist "assets" mkdir assets
if not exist "assets\icon.ico" (
    echo Note: Default icon not found. Using system icon.
)
echo Done!
echo.

REM Step 5: Create installer
echo [Step 5/5] Creating Windows Installer...
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
    if %errorlevel% equ 0 (
        echo.
        echo ============================================================
        echo BUILD COMPLETED SUCCESSFULLY!
        echo ============================================================
        echo.
        echo Installer location: installer_output\MonitorApp-Setup-v1.0.0.exe
        echo.
        explorer installer_output
    ) else (
        echo ERROR: Installer creation failed
    )
) else (
    echo.
    echo ============================================================
    echo Inno Setup not found!
    echo ============================================================
    echo.
    echo Executables have been built successfully:
    echo   - dist\MonitorApp-Backend.exe
    echo   - dist\MonitorApp-Agent.exe
    echo.
    echo To create installer:
    echo   1. Download Inno Setup from: https://jrsoftware.org/isinfo.php
    echo   2. Install Inno Setup
    echo   3. Run: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
    echo.
    explorer dist
)

echo.
pause
