@echo off
chcp 65001 >nul
title MonitorApp API Server

echo ============================================
echo   MonitorApp API Server v4.0.59
echo   BMS LINE Notification Testing
echo ============================================
echo.

cd /d "%~dp0"

echo Starting API server on http://localhost:8000
echo.
echo API Endpoints:
echo   GET  /api/line-oa/bms/status          - ดูสถานะ BMS
echo   POST /api/line-oa/bms/check-and-alert - ตรวจสอบและส่ง LINE
echo   POST /api/line-oa/bms/send-alert      - ส่ง custom alert
echo   POST /api/line-oa/bms/send-db-alert   - ส่งแจ้งเตือน DB
echo   POST /api/line-oa/bms/send-gateway-alert - ส่งแจ้งเตือน Gateway
echo.
echo Press Ctrl+C to stop the server
echo ============================================
echo.

python main.py

pause
