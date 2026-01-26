@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║       MonitorApp - Windows Deployment Script               ║
echo ║       Version 1.0.0                                        ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] Not running as Administrator
    echo Some features may not work properly.
    echo.
)

REM Check if in correct directory
if not exist "backend\main.py" (
    echo [ERROR] Please run this script from MonitorApp root directory
    pause
    exit /b 1
)

REM Set version
set VERSION=1.0.0
set OUTPUT_DIR=MonitorApp-Deploy-v%VERSION%
set DIST_DIR=dist

echo [INFO] Deployment Options:
echo.
echo   1. Build Full Package (EXE + Frontend + Config)
echo   2. Build Backend EXE Only
echo   3. Build Frontend Only
echo   4. Create Portable Package (No installation required)
echo   5. Create Windows Service Installer
echo   6. Build All (Complete deployment)
echo   0. Exit
echo.

set /p CHOICE="Select option (1-6): "

if "%CHOICE%"=="0" goto :end
if "%CHOICE%"=="1" goto :build_full
if "%CHOICE%"=="2" goto :build_backend
if "%CHOICE%"=="3" goto :build_frontend
if "%CHOICE%"=="4" goto :create_portable
if "%CHOICE%"=="5" goto :create_service
if "%CHOICE%"=="6" goto :build_all

echo [ERROR] Invalid option
pause
exit /b 1

:build_all
echo.
echo ============================================================
echo Building Complete Deployment Package...
echo ============================================================
call :build_backend_exe
call :build_frontend_dist
call :create_portable_package
call :create_service_files
goto :success

:build_full
echo.
echo ============================================================
echo Building Full Package...
echo ============================================================
call :build_backend_exe
call :build_frontend_dist
goto :success

:build_backend
echo.
echo ============================================================
echo Building Backend EXE...
echo ============================================================
call :build_backend_exe
goto :success

:build_frontend
echo.
echo ============================================================
echo Building Frontend...
echo ============================================================
call :build_frontend_dist
goto :success

:create_portable
echo.
echo ============================================================
echo Creating Portable Package...
echo ============================================================
call :build_backend_exe
call :build_frontend_dist
call :create_portable_package
goto :success

:create_service
echo.
echo ============================================================
echo Creating Windows Service Files...
echo ============================================================
call :create_service_files
goto :success

REM ============================================================
REM Build Functions
REM ============================================================

:build_backend_exe
echo.
echo [Step 1] Installing Python dependencies...
cd backend
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet 2>nul
pip install pyinstaller --quiet
cd ..

echo [Step 2] Building Backend executable...
python -c "
import PyInstaller.__main__
import os

# Clean previous builds
import shutil
for d in ['build', 'dist\\MonitorApp-Backend']:
    if os.path.exists(d):
        shutil.rmtree(d)

PyInstaller.__main__.run([
    'backend/main.py',
    '--name=MonitorApp-Backend',
    '--onefile',
    '--console',
    '--icon=assets/icon.ico' if os.path.exists('assets/icon.ico') else '',
    '--add-data=backend/.env;.' if os.path.exists('backend/.env') else '',
    '--hidden-import=fastapi',
    '--hidden-import=uvicorn',
    '--hidden-import=uvicorn.logging',
    '--hidden-import=uvicorn.loops',
    '--hidden-import=uvicorn.loops.auto',
    '--hidden-import=uvicorn.protocols',
    '--hidden-import=uvicorn.protocols.http',
    '--hidden-import=uvicorn.protocols.http.auto',
    '--hidden-import=uvicorn.protocols.websockets',
    '--hidden-import=uvicorn.protocols.websockets.auto',
    '--hidden-import=uvicorn.lifespan',
    '--hidden-import=uvicorn.lifespan.on',
    '--hidden-import=psutil',
    '--hidden-import=websockets',
    '--hidden-import=aiohttp',
    '--hidden-import=pydantic',
    '--hidden-import=pandas',
    '--hidden-import=openpyxl',
    '--hidden-import=aiomysql',
    '--collect-all=fastapi',
    '--collect-all=uvicorn',
    '--clean',
    '--noconfirm'
])
print('Backend build completed!')
"

if not exist "dist\MonitorApp-Backend.exe" (
    echo [ERROR] Backend build failed!
    exit /b 1
)
echo [OK] Backend EXE created: dist\MonitorApp-Backend.exe
goto :eof

:build_frontend_dist
echo.
echo [Step 3] Building Frontend...
if not exist "frontend\package.json" (
    echo [WARNING] Frontend not found, skipping...
    goto :eof
)

cd frontend
echo Installing npm dependencies...
call npm install --silent 2>nul

echo Building production frontend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    cd ..
    exit /b 1
)
cd ..

if not exist "frontend\dist" (
    echo [ERROR] Frontend build output not found!
    exit /b 1
)
echo [OK] Frontend built: frontend\dist\
goto :eof

:create_portable_package
echo.
echo [Step 4] Creating Portable Package...

REM Clean and create output directory
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
mkdir "%OUTPUT_DIR%"
mkdir "%OUTPUT_DIR%\backend"
mkdir "%OUTPUT_DIR%\frontend"
mkdir "%OUTPUT_DIR%\config"
mkdir "%OUTPUT_DIR%\logs"
mkdir "%OUTPUT_DIR%\docs"

REM Copy backend executable
if exist "dist\MonitorApp-Backend.exe" (
    copy "dist\MonitorApp-Backend.exe" "%OUTPUT_DIR%\backend\" >nul
    echo - Backend executable copied
)

REM Copy frontend
if exist "frontend\dist" (
    xcopy "frontend\dist" "%OUTPUT_DIR%\frontend\" /E /I /Q >nul
    echo - Frontend files copied
)

REM Copy configuration
if exist "backend\.env.example" copy "backend\.env.example" "%OUTPUT_DIR%\config\.env.example" >nul
if exist "backend\.env" copy "backend\.env" "%OUTPUT_DIR%\config\.env" >nul

REM Create startup scripts
call :create_startup_scripts

REM Copy documentation
if exist "README.md" copy "README.md" "%OUTPUT_DIR%\docs\" >nul
if exist "QUICKSTART.md" copy "QUICKSTART.md" "%OUTPUT_DIR%\docs\" >nul

REM Create quick start guide
call :create_quick_start_guide

echo [OK] Portable package created: %OUTPUT_DIR%\

REM Create ZIP
echo Creating ZIP file...
powershell -command "Compress-Archive -Path '%OUTPUT_DIR%' -DestinationPath '%OUTPUT_DIR%.zip' -Force" 2>nul
if exist "%OUTPUT_DIR%.zip" (
    echo [OK] ZIP created: %OUTPUT_DIR%.zip
)
goto :eof

:create_startup_scripts
REM Create start-server.bat
(
echo @echo off
echo chcp 65001 ^>nul
echo echo Starting MonitorApp Server...
echo echo.
echo cd /d "%%~dp0"
echo.
echo REM Check if .env exists
echo if not exist "config\.env" ^(
echo     echo [WARNING] Configuration not found!
echo     echo Please copy config\.env.example to config\.env and edit it.
echo     echo.
echo     pause
echo     exit /b 1
echo ^)
echo.
echo REM Start backend
echo echo Starting Backend Server on port 3001...
echo start /B backend\MonitorApp-Backend.exe
echo.
echo timeout /t 3 /nobreak ^>nul
echo.
echo echo.
echo echo ============================================================
echo echo MonitorApp Server Started!
echo echo ============================================================
echo echo.
echo echo Backend API: http://localhost:3001
echo echo Frontend:    Open frontend\index.html in browser
echo echo             Or use: http://localhost:3001
echo echo.
echo echo Press any key to stop the server...
echo pause ^>nul
echo.
echo echo Stopping server...
echo taskkill /F /IM MonitorApp-Backend.exe 2^>nul
echo echo Server stopped.
) > "%OUTPUT_DIR%\START-SERVER.bat"

REM Create stop-server.bat
(
echo @echo off
echo echo Stopping MonitorApp Server...
echo taskkill /F /IM MonitorApp-Backend.exe 2^>nul
echo echo Server stopped.
echo pause
) > "%OUTPUT_DIR%\STOP-SERVER.bat"

echo - Startup scripts created
goto :eof

:create_quick_start_guide
(
echo ╔════════════════════════════════════════════════════════════╗
echo ║              MonitorApp - Quick Start Guide                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo INSTALLATION:
echo ─────────────
echo 1. Extract this folder to desired location ^(e.g., C:\MonitorApp^)
echo 2. Copy config\.env.example to config\.env
echo 3. Edit config\.env with your settings:
echo    - SUPABASE_URL=your_supabase_url
echo    - SUPABASE_KEY=your_supabase_key
echo.
echo STARTING THE SERVER:
echo ────────────────────
echo 1. Double-click START-SERVER.bat
echo 2. Wait for "Server Started" message
echo 3. Open browser: http://localhost:3001
echo.
echo STOPPING THE SERVER:
echo ────────────────────
echo 1. Press any key in the server window, OR
echo 2. Double-click STOP-SERVER.bat
echo.
echo FOLDER STRUCTURE:
echo ─────────────────
echo MonitorApp/
echo ├── backend/              - Server executable
echo ├── frontend/             - Web interface files
echo ├── config/               - Configuration files
echo ├── logs/                 - Log files
echo ├── docs/                 - Documentation
echo ├── START-SERVER.bat      - Start the server
echo └── STOP-SERVER.bat       - Stop the server
echo.
echo SYSTEM REQUIREMENTS:
echo ────────────────────
echo - Windows 10/11 ^(64-bit^)
echo - 4GB RAM minimum
echo - Network access for Supabase ^(if using cloud database^)
echo.
echo SUPPORT:
echo ────────
echo For issues and documentation, see the docs/ folder.
echo.
) > "%OUTPUT_DIR%\README.txt"
echo - Quick start guide created
goto :eof

:create_service_files
echo.
echo [Step 5] Creating Windows Service Files...

REM Create service installer using NSSM or sc command
mkdir "service" 2>nul

REM Create service install script
(
echo @echo off
echo REM MonitorApp Windows Service Installer
echo REM Requires Administrator privileges
echo.
echo net session ^>nul 2^>^&1
echo if %%errorLevel%% neq 0 ^(
echo     echo [ERROR] Please run as Administrator!
echo     pause
echo     exit /b 1
echo ^)
echo.
echo set SERVICE_NAME=MonitorAppService
echo set DISPLAY_NAME=MonitorApp Monitor Service
echo set EXE_PATH=%%~dp0..\backend\MonitorApp-Backend.exe
echo.
echo echo Installing MonitorApp as Windows Service...
echo echo.
echo.
echo REM Check if service exists
echo sc query %%SERVICE_NAME%% ^>nul 2^>^&1
echo if %%errorLevel%% equ 0 ^(
echo     echo Service already exists. Stopping and removing...
echo     sc stop %%SERVICE_NAME%% ^>nul 2^>^&1
echo     timeout /t 2 /nobreak ^>nul
echo     sc delete %%SERVICE_NAME%%
echo     timeout /t 2 /nobreak ^>nul
echo ^)
echo.
echo REM Create new service
echo sc create %%SERVICE_NAME%% binPath= "\"%%EXE_PATH%%\"" DisplayName= "%%DISPLAY_NAME%%" start= auto
echo.
echo if %%errorLevel%% equ 0 ^(
echo     echo [OK] Service installed successfully!
echo     echo.
echo     echo Starting service...
echo     sc start %%SERVICE_NAME%%
echo     echo.
echo     echo Service Status:
echo     sc query %%SERVICE_NAME%%
echo ^) else ^(
echo     echo [ERROR] Failed to install service!
echo ^)
echo.
echo pause
) > "service\install-service.bat"

REM Create service uninstall script
(
echo @echo off
echo REM MonitorApp Windows Service Uninstaller
echo.
echo net session ^>nul 2^>^&1
echo if %%errorLevel%% neq 0 ^(
echo     echo [ERROR] Please run as Administrator!
echo     pause
echo     exit /b 1
echo ^)
echo.
echo set SERVICE_NAME=MonitorAppService
echo.
echo echo Uninstalling MonitorApp Service...
echo.
echo sc stop %%SERVICE_NAME%% ^>nul 2^>^&1
echo timeout /t 2 /nobreak ^>nul
echo sc delete %%SERVICE_NAME%%
echo.
echo if %%errorLevel%% equ 0 ^(
echo     echo [OK] Service uninstalled successfully!
echo ^) else ^(
echo     echo [WARNING] Service may not have been installed.
echo ^)
echo.
echo pause
) > "service\uninstall-service.bat"

REM Create service management script
(
echo @echo off
echo REM MonitorApp Service Manager
echo.
echo set SERVICE_NAME=MonitorAppService
echo.
echo echo ╔════════════════════════════════════════╗
echo echo ║   MonitorApp Service Manager           ║
echo echo ╚════════════════════════════════════════╝
echo echo.
echo echo   1. Start Service
echo echo   2. Stop Service
echo echo   3. Restart Service
echo echo   4. Check Status
echo echo   0. Exit
echo echo.
echo.
echo set /p CHOICE="Select option: "
echo.
echo if "%%CHOICE%%"=="1" sc start %%SERVICE_NAME%%
echo if "%%CHOICE%%"=="2" sc stop %%SERVICE_NAME%%
echo if "%%CHOICE%%"=="3" ^(
echo     sc stop %%SERVICE_NAME%%
echo     timeout /t 2 /nobreak ^>nul
echo     sc start %%SERVICE_NAME%%
echo ^)
echo if "%%CHOICE%%"=="4" sc query %%SERVICE_NAME%%
echo.
echo pause
) > "service\manage-service.bat"

echo [OK] Service files created in: service\
goto :eof

:success
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║              DEPLOYMENT COMPLETED SUCCESSFULLY!            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Output files:
if exist "dist\MonitorApp-Backend.exe" echo   - Backend EXE: dist\MonitorApp-Backend.exe
if exist "frontend\dist" echo   - Frontend: frontend\dist\
if exist "%OUTPUT_DIR%" echo   - Portable: %OUTPUT_DIR%\
if exist "%OUTPUT_DIR%.zip" echo   - ZIP Package: %OUTPUT_DIR%.zip
if exist "service\install-service.bat" echo   - Service Files: service\
echo.
echo Next steps:
echo   1. Copy the portable package or ZIP to target machine
echo   2. Configure .env file with your settings
echo   3. Run START-SERVER.bat to start the application
echo.

:end
pause
exit /b 0
