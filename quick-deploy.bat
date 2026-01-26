@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║       MonitorApp - Quick Deploy (One-Click)                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if in correct directory
if not exist "backend\main.py" (
    echo [ERROR] Please run this script from MonitorApp root directory
    pause
    exit /b 1
)

set VERSION=1.0.0
set OUTPUT_DIR=MonitorApp-v%VERSION%

echo This script will create a complete deployable package.
echo.
echo Press any key to start or Ctrl+C to cancel...
pause >nul

echo.
echo ============================================================
echo Step 1: Installing Python dependencies...
echo ============================================================
cd backend
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat 2>nul
pip install -r requirements.txt --quiet 2>nul
pip install pyinstaller --quiet 2>nul
cd ..
echo [OK] Python dependencies installed

echo.
echo ============================================================
echo Step 2: Building Backend executable...
echo ============================================================
echo This may take 2-5 minutes...

pyinstaller --noconfirm --onefile --console ^
    --name "MonitorApp-Backend" ^
    --hidden-import=fastapi ^
    --hidden-import=uvicorn ^
    --hidden-import=uvicorn.logging ^
    --hidden-import=uvicorn.loops ^
    --hidden-import=uvicorn.loops.auto ^
    --hidden-import=uvicorn.protocols ^
    --hidden-import=uvicorn.protocols.http ^
    --hidden-import=uvicorn.protocols.http.auto ^
    --hidden-import=uvicorn.protocols.websockets ^
    --hidden-import=uvicorn.protocols.websockets.auto ^
    --hidden-import=uvicorn.lifespan ^
    --hidden-import=uvicorn.lifespan.on ^
    --hidden-import=psutil ^
    --hidden-import=websockets ^
    --hidden-import=aiohttp ^
    --hidden-import=pydantic ^
    --hidden-import=pandas ^
    --hidden-import=openpyxl ^
    --collect-all=fastapi ^
    --collect-all=uvicorn ^
    backend/main.py 2>nul

if not exist "dist\MonitorApp-Backend.exe" (
    echo [ERROR] Backend build failed!
    echo Please check if PyInstaller is installed correctly.
    pause
    exit /b 1
)
echo [OK] Backend executable created

echo.
echo ============================================================
echo Step 3: Building Frontend...
echo ============================================================
if exist "frontend\package.json" (
    cd frontend
    call npm install --silent 2>nul
    call npm run build 2>nul
    cd ..
    if exist "frontend\dist" (
        echo [OK] Frontend built successfully
    ) else (
        echo [WARNING] Frontend build failed, continuing...
    )
) else (
    echo [WARNING] Frontend not found, skipping...
)

echo.
echo ============================================================
echo Step 4: Creating deployment package...
echo ============================================================

REM Clean and create output directory
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
mkdir "%OUTPUT_DIR%"
mkdir "%OUTPUT_DIR%\backend"
mkdir "%OUTPUT_DIR%\frontend"
mkdir "%OUTPUT_DIR%\config"
mkdir "%OUTPUT_DIR%\logs"

REM Copy backend
copy "dist\MonitorApp-Backend.exe" "%OUTPUT_DIR%\backend\" >nul
echo - Backend executable

REM Copy frontend
if exist "frontend\dist" (
    xcopy "frontend\dist" "%OUTPUT_DIR%\frontend\" /E /I /Q >nul
    echo - Frontend files
)

REM Copy config
if exist "backend\.env.example" (
    copy "backend\.env.example" "%OUTPUT_DIR%\config\.env.example" >nul
    echo - Configuration template
)
if exist "backend\.env" (
    copy "backend\.env" "%OUTPUT_DIR%\config\.env" >nul
    echo - Configuration file
)

REM Create START script
(
echo @echo off
echo chcp 65001 ^>nul
echo echo Starting MonitorApp...
echo cd /d "%%~dp0"
echo.
echo if not exist "config\.env" ^(
echo     if exist "config\.env.example" ^(
echo         copy "config\.env.example" "config\.env" ^>nul
echo         echo Created default configuration file.
echo         echo Please edit config\.env before running again.
echo         notepad "config\.env"
echo         pause
echo         exit /b 0
echo     ^)
echo ^)
echo.
echo echo Starting server on http://localhost:3001
echo echo Press Ctrl+C to stop
echo echo.
echo backend\MonitorApp-Backend.exe
echo.
echo pause
) > "%OUTPUT_DIR%\START.bat"

REM Create STOP script
(
echo @echo off
echo echo Stopping MonitorApp...
echo taskkill /F /IM MonitorApp-Backend.exe 2^>nul
echo echo Done.
echo timeout /t 2 ^>nul
) > "%OUTPUT_DIR%\STOP.bat"

REM Create README
(
echo =============================================
echo   MonitorApp v%VERSION%
echo =============================================
echo.
echo QUICK START:
echo 1. Edit config\.env with your Supabase settings
echo 2. Double-click START.bat
echo 3. Open http://localhost:3001 in browser
echo.
echo FILES:
echo - START.bat  : Start the server
echo - STOP.bat   : Stop the server
echo - config\    : Configuration files
echo - logs\      : Log files
echo.
echo CONFIGURATION:
echo Edit config\.env file:
echo - SUPABASE_URL=your_url
echo - SUPABASE_KEY=your_key
echo.
) > "%OUTPUT_DIR%\README.txt"

echo - Startup scripts

echo.
echo ============================================================
echo Step 5: Creating ZIP package...
echo ============================================================
powershell -command "Compress-Archive -Path '%OUTPUT_DIR%' -DestinationPath '%OUTPUT_DIR%.zip' -Force" 2>nul
if exist "%OUTPUT_DIR%.zip" (
    echo [OK] ZIP package created
) else (
    echo [WARNING] ZIP creation failed
)

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║              DEPLOYMENT COMPLETED!                         ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Output:
echo   Folder: %OUTPUT_DIR%\
if exist "%OUTPUT_DIR%.zip" echo   ZIP:    %OUTPUT_DIR%.zip
echo.
echo To deploy:
echo   1. Copy %OUTPUT_DIR%.zip to target machine
echo   2. Extract ZIP
echo   3. Edit config\.env
echo   4. Run START.bat
echo.
echo Opening output folder...
explorer "%OUTPUT_DIR%"

pause
