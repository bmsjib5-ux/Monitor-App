@echo off
chcp 65001 >nul
title Create MonitorApp Distribution Package

echo ========================================
echo   Create MonitorApp Distribution Package
echo ========================================
echo.

set "PACKAGE_NAME=MonitorApp-Client"
set "DIST_DIR=%~dp0dist-package"

:: Clean previous package
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%DIST_DIR%\%PACKAGE_NAME%"

echo Copying files...

:: Copy backend
xcopy /s /e /i "%~dp0backend" "%DIST_DIR%\%PACKAGE_NAME%\backend" /exclude:%~dp0exclude-list.txt

:: Copy frontend dist (already built)
xcopy /s /e /i "%~dp0frontend\dist" "%DIST_DIR%\%PACKAGE_NAME%\frontend\dist"

:: Copy scripts
copy "%~dp0install-client.bat" "%DIST_DIR%\%PACKAGE_NAME%\"
copy "%~dp0start-client.bat" "%DIST_DIR%\%PACKAGE_NAME%\"
copy "%~dp0start-client-hidden.vbs" "%DIST_DIR%\%PACKAGE_NAME%\"
copy "%~dp0install-as-service.bat" "%DIST_DIR%\%PACKAGE_NAME%\"
copy "%~dp0uninstall-service.bat" "%DIST_DIR%\%PACKAGE_NAME%\"
copy "%~dp0README-DEPLOY.md" "%DIST_DIR%\%PACKAGE_NAME%\"

echo.
echo ========================================
echo   Package Created!
echo ========================================
echo.
echo Package location: %DIST_DIR%\%PACKAGE_NAME%
echo.
echo You can now:
echo   1. Zip the folder and distribute
echo   2. Copy to USB drive
echo   3. Share via network
echo.
echo On target PC:
echo   1. Extract the folder
echo   2. Run "install-client.bat"
echo   3. Run "start-client.bat"
echo.

:: Open the folder
explorer "%DIST_DIR%"

pause
