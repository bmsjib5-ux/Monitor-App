@echo off
chcp 65001 >nul
title Test LINE BMS Notification

echo ============================================
echo   Test LINE BMS Notification
echo ============================================
echo.

set API_URL=http://localhost:8000

:menu
echo เลือกการทดสอบ:
echo   1. ดูสถานะ BMS Gateway
echo   2. ตรวจสอบและส่ง LINE อัตโนมัติ
echo   3. ส่งแจ้งเตือน Gateway Stopped
echo   4. ส่งแจ้งเตือน Gateway Started
echo   5. ส่งแจ้งเตือน DB Disconnected (HOSxP)
echo   6. ส่งแจ้งเตือน DB Disconnected (Gateway)
echo   7. ทดสอบ BMS Restart Logic
echo   8. ดู Pending Process Alerts (Supabase)
echo   9. ส่ง Process Alerts จาก Supabase
echo   0. ออก
echo.
set /p choice="เลือก (0-9): "

if "%choice%"=="1" goto status
if "%choice%"=="2" goto check_alert
if "%choice%"=="3" goto gateway_stopped
if "%choice%"=="4" goto gateway_started
if "%choice%"=="5" goto db_hosxp
if "%choice%"=="6" goto db_gateway
if "%choice%"=="7" goto restart_logic
if "%choice%"=="8" goto pending_alerts
if "%choice%"=="9" goto send_process_alerts
if "%choice%"=="0" goto end

echo Invalid choice
goto menu

:status
echo.
echo === ดูสถานะ BMS Gateway ===
curl -s "%API_URL%/api/line-oa/bms/status" | python -m json.tool 2>nul || curl -s "%API_URL%/api/line-oa/bms/status"
echo.
pause
goto menu

:check_alert
echo.
echo === ตรวจสอบและส่ง LINE อัตโนมัติ ===
curl -s -X POST "%API_URL%/api/line-oa/bms/check-and-alert" | python -m json.tool 2>nul || curl -s -X POST "%API_URL%/api/line-oa/bms/check-and-alert"
echo.
pause
goto menu

:gateway_stopped
echo.
echo === ส่งแจ้งเตือน Gateway Stopped ===
curl -s -X POST "%API_URL%/api/line-oa/bms/send-gateway-alert?status=stopped" | python -m json.tool 2>nul || curl -s -X POST "%API_URL%/api/line-oa/bms/send-gateway-alert?status=stopped"
echo.
pause
goto menu

:gateway_started
echo.
echo === ส่งแจ้งเตือน Gateway Started ===
curl -s -X POST "%API_URL%/api/line-oa/bms/send-gateway-alert?status=started" | python -m json.tool 2>nul || curl -s -X POST "%API_URL%/api/line-oa/bms/send-gateway-alert?status=started"
echo.
pause
goto menu

:db_hosxp
echo.
echo === ส่งแจ้งเตือน HOSxP DB Disconnected ===
curl -s -X POST "%API_URL%/api/line-oa/bms/send-db-alert?db_type=hosxp&error_message=Connection timeout" | python -m json.tool 2>nul || curl -s -X POST "%API_URL%/api/line-oa/bms/send-db-alert?db_type=hosxp"
echo.
pause
goto menu

:db_gateway
echo.
echo === ส่งแจ้งเตือน Gateway DB Disconnected ===
curl -s -X POST "%API_URL%/api/line-oa/bms/send-db-alert?db_type=gateway&error_message=Connection refused" | python -m json.tool 2>nul || curl -s -X POST "%API_URL%/api/line-oa/bms/send-db-alert?db_type=gateway"
echo.
pause
goto menu

:restart_logic
echo.
echo === ทดสอบ BMS Restart Logic ===
cd /d "%~dp0"
python -c "
from bms_log_monitor import BMSLogMonitor

bms = BMSLogMonitor('BMSHOSxPLISServices')
print(f'Log path: {bms.log_path}')
print()

status = bms.get_status()
print(f'Gateway status: {status.gateway_status}')
print(f'HOSxP DB: {status.hosxp_db_status}')
print(f'Gateway DB: {status.gateway_db_status}')
print(f'Heartbeat stale: {status.heartbeat_stale}')
print()

is_working = bms.is_any_thread_working()
print('=== Restart Check ===')
print(f'มีงานค้าง (is_working): {is_working}')
print(f'Restart ได้: {not is_working}')
"
echo.
pause
goto menu

:pending_alerts
echo.
echo === ดู Pending Process Alerts จาก Supabase ===
curl -s "%API_URL%/api/line-oa/pending-process-alerts" | python -m json.tool 2>nul || curl -s "%API_URL%/api/line-oa/pending-process-alerts"
echo.
pause
goto menu

:send_process_alerts
echo.
echo === ส่ง Process Alerts จาก Supabase ไปยัง LINE ===
echo (เฉพาะ PROCESS_STARTED และ PROCESS_STOPPED)
curl -s -X POST "%API_URL%/api/line-oa/send-process-alerts" | python -m json.tool 2>nul || curl -s -X POST "%API_URL%/api/line-oa/send-process-alerts"
echo.
pause
goto menu

:end
echo Goodbye!
exit /b 0
