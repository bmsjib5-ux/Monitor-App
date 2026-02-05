@echo off
chcp 65001 >nul
title Send LINE Test Message

echo ============================================
echo   Send LINE Test Notification
echo ============================================
echo.

set API_URL=http://localhost:8000

echo กำลังส่งข้อความทดสอบไปยัง LINE...
echo.

curl -s -X POST "%API_URL%/api/line-oa/test" | python -m json.tool 2>nul || curl -s -X POST "%API_URL%/api/line-oa/test"

echo.
echo ============================================
pause
