@echo off
echo ============================================================
echo Creating MonitorApp Portable Package
echo ============================================================
echo.

REM Create output directory
set OUTPUT_DIR=MonitorApp-Portable-v1.0.0
if exist "%OUTPUT_DIR%" (
    echo Cleaning old package...
    rmdir /s /q "%OUTPUT_DIR%"
)
mkdir "%OUTPUT_DIR%"

echo Copying files...

REM Copy executables
if exist "dist\MonitorApp-Backend.exe" (
    copy "dist\MonitorApp-Backend.exe" "%OUTPUT_DIR%\" >nul
    echo - Backend executable
) else (
    echo ERROR: Backend executable not found. Run build.bat first!
    pause
    exit /b 1
)

if exist "dist\MonitorApp-Agent.exe" (
    copy "dist\MonitorApp-Agent.exe" "%OUTPUT_DIR%\" >nul
    echo - Agent executable
)

REM Copy batch files
copy "start-backend.bat" "%OUTPUT_DIR%\" >nul
copy "start-frontend.bat" "%OUTPUT_DIR%\" >nul
copy "start-agent.bat" "%OUTPUT_DIR%\" >nul
echo - Batch files

REM Copy documentation
mkdir "%OUTPUT_DIR%\docs"
copy "README.md" "%OUTPUT_DIR%\docs\" >nul
copy "ONLINE_MONITORING.md" "%OUTPUT_DIR%\docs\" >nul
copy "ONLINE_SETUP_QUICKSTART.md" "%OUTPUT_DIR%\docs\" >nul
copy "QUICKSTART.md" "%OUTPUT_DIR%\docs\" >nul
copy "FEATURES.md" "%OUTPUT_DIR%\docs\" >nul
echo - Documentation

REM Copy configuration
mkdir "%OUTPUT_DIR%\config"
copy "backend\.env.example" "%OUTPUT_DIR%\config\" >nul
copy "backend\config.py" "%OUTPUT_DIR%\config\" >nul
echo - Configuration files

REM Create logs directory
mkdir "%OUTPUT_DIR%\logs"

REM Create frontend directory (if exists)
if exist "frontend\build" (
    echo - Frontend files
    xcopy "frontend\build" "%OUTPUT_DIR%\frontend\" /E /I /Q >nul
)

REM Create README for portable version
echo Creating portable README...
(
echo MonitorApp - Portable Version
echo ==============================
echo.
echo Quick Start:
echo   1. Double-click start-backend.bat to start the server
echo   2. Open browser: http://localhost:3000
echo   3. Add processes to monitor
echo.
echo For Agent Installation:
echo   1. Copy this folder to remote server
echo   2. Edit config\.env.example and save as config\.env
echo   3. Run start-agent.bat
echo.
echo Documentation:
echo   See docs\ folder for complete guides
echo.
echo System Requirements:
echo   - Windows 10/11
echo   - Python 3.8+ ^(for agent only^)
echo   - Modern web browser
echo.
) > "%OUTPUT_DIR%\START_HERE.txt"

echo.
echo ============================================================
echo Portable package created successfully!
echo ============================================================
echo.
echo Location: %OUTPUT_DIR%\
echo.
echo Creating ZIP file...

REM Create ZIP using PowerShell
powershell -command "Compress-Archive -Path '%OUTPUT_DIR%' -DestinationPath '%OUTPUT_DIR%.zip' -Force"

if exist "%OUTPUT_DIR%.zip" (
    echo.
    echo ============================================================
    echo ZIP file created: %OUTPUT_DIR%.zip
    echo ============================================================
    echo.
    echo You can distribute this ZIP file to users.
    echo Users just need to extract and run start-backend.bat
    echo.
    explorer .
) else (
    echo.
    echo Folder package is ready: %OUTPUT_DIR%\
    echo.
    explorer "%OUTPUT_DIR%"
)

pause
