from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import List, Optional
import asyncio
import logging
import json
from datetime import datetime, timezone, timedelta
import os
import pandas as pd
from io import BytesIO
import socket as socket_module
import psutil

from config import settings
from models import (ProcessAdd, ProcessInfo, Alert, ThresholdConfig, ProcessControlResponse,
                    HostInfo, HostRegister, HostProcessInfo, AgentHeartbeat, ProcessMetadataUpdate,
                    ProcessStartRequest, ProcessStopRequest, ProcessRestartRequest, ProcessDeleteRequest,
                    AlertSettings)
from process_monitor import ProcessMonitor, get_window_titles_for_pid, parse_bms_window_title
from auth import authenticate_user, create_access_token, verify_token, verify_ws_token
from security_middleware import (
    SecurityHeadersMiddleware, RequestSizeLimitMiddleware, SecurityAuditMiddleware,
    rate_limiter,
)
from host_manager import HostManager
from database_wrapper import (Database, save_process_data, save_alert,
                              get_monitored_process, save_monitored_process,
                              delete_monitored_process, get_all_monitored_processes,
                              get_line_settings_db, save_line_settings_db, get_global_line_settings_db,
                              get_alerts_by_type, get_unsent_alerts, mark_alert_as_sent,
                              get_unsent_process_alerts, get_global_line_settings_for_notification)
from restart_scheduler import restart_scheduler
from line_notify import line_notify_service
from bms_log_monitor import BMSLogMonitor, is_bms_process
# Optional push notifications (requires pywebpush)
try:
    from push_notifications import init_push_service, get_push_service, PushNotificationService
    PUSH_AVAILABLE = True
except ImportError:
    PUSH_AVAILABLE = False
    init_push_service = None
    get_push_service = lambda: None
    PushNotificationService = None

# Thailand timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

def get_thai_datetime() -> datetime:
    """Get current datetime in Thai timezone"""
    return datetime.now(THAI_TZ)

def get_thai_iso() -> str:
    """Get current datetime as ISO string in Thai timezone"""
    return get_thai_datetime().isoformat()

# Setup logging - use AppData folder to avoid permission issues in Program Files
def get_log_path():
    """Get writable log path - uses AppData on Windows"""
    if os.name == 'nt':  # Windows
        app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        log_dir = os.path.join(app_data, 'MonitorApp', 'logs')
    else:
        log_dir = os.path.dirname(settings.log_file) or 'logs'
    os.makedirs(log_dir, exist_ok=True)
    return os.path.join(log_dir, 'monitor.log')

log_file_path = get_log_path()
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file_path),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version
)

# Configure CORS - restricted to known origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Security middleware (order matters: outermost runs first)
app.add_middleware(SecurityAuditMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Initialize process monitor
monitor = ProcessMonitor()

# Initialize host manager for multi-host monitoring
host_manager = HostManager()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to WebSocket: {e}")
                disconnected.append(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            if connection in self.active_connections:
                self.active_connections.remove(connection)

manager = ConnectionManager()

# ============================================================
# Authentication API Endpoints
# ============================================================

from pydantic import BaseModel as PydanticBaseModel, field_validator
import re as re_module

# Input validation helper
_SAFE_NAME_RE = re_module.compile(r'^[\w\s\.\-\(\)]+$')

def validate_safe_name(value: str, field_name: str = "name") -> str:
    """Validate that a name contains only safe characters."""
    if not value or len(value) > 255:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: must be 1-255 characters")
    if not _SAFE_NAME_RE.match(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: contains disallowed characters")
    return value.strip()


class LoginRequest(PydanticBaseModel):
    username: str
    password: str

    @field_validator('username')
    @classmethod
    def username_valid(cls, v: str) -> str:
        if not v or len(v) > 100:
            raise ValueError('Username must be 1-100 characters')
        return v.strip()

    @field_validator('password')
    @classmethod
    def password_not_empty(cls, v: str) -> str:
        if not v:
            raise ValueError('Password is required')
        return v

@app.post("/api/auth/login")
async def login(request_body: LoginRequest, request: Request):
    """Authenticate user and return JWT token (rate-limited)"""
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"login:{client_ip}"

    # Rate limit check
    if rate_limiter.is_rate_limited(
        rate_key,
        settings.rate_limit_login_max,
        settings.rate_limit_login_window,
    ):
        logger.warning(f"Rate limit exceeded for login from {client_ip}")
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again later.",
            headers={"Retry-After": str(settings.rate_limit_login_window)},
        )

    if authenticate_user(request_body.username, request_body.password):
        rate_limiter.reset(rate_key)  # Reset on success
        token = create_access_token(request_body.username)
        return {
            "success": True,
            "token": token,
            "username": request_body.username,
            "message": "Login successful"
        }
    # Generic error message - don't reveal whether username or password was wrong
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/auth/verify")
async def verify_auth(authorization: str = Header(None)):
    """Verify if a JWT token is still valid"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided")

    # Support "Bearer <token>" format
    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization[7:]

    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {"valid": True, "username": payload.get("sub")}

# Track saved alert timestamps to prevent duplicates
saved_alert_timestamps = set()

# Local metadata storage
def _get_metadata_file_path() -> str:
    """Get path for local process metadata storage"""
    if os.name == 'nt':  # Windows
        app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        config_dir = os.path.join(app_data, 'MonitorApp', 'config')
    else:
        config_dir = os.path.join(os.path.expanduser('~'), '.monitorapp')
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, 'process_metadata.json')

def _load_process_metadata_local() -> dict:
    """Load process metadata from local file"""
    try:
        metadata_file = _get_metadata_file_path()
        if os.path.exists(metadata_file):
            with open(metadata_file, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading local metadata: {e}")
    return {}

def _save_process_metadata_local(process_name: str, hospital_code: str, hospital_name: str, hostname: str, program_path: str, window_title: str = None, window_info: dict = None):
    """Save process metadata to local file"""
    try:
        metadata = _load_process_metadata_local()
        metadata[process_name] = {
            'hospital_code': hospital_code,
            'hospital_name': hospital_name,
            'hostname': hostname,
            'program_path': program_path
        }
        if window_title:
            metadata[process_name]['window_title'] = window_title
        if window_info:
            metadata[process_name]['window_info'] = window_info
        metadata_file = _get_metadata_file_path()
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved metadata locally for {process_name}")
    except Exception as e:
        logger.error(f"Error saving local metadata: {e}")

def _get_process_metadata_local(process_name: str) -> dict:
    """Get process metadata from local storage"""
    metadata = _load_process_metadata_local()
    return metadata.get(process_name, {})

# Background task for broadcasting updates
async def broadcast_updates():
    """Continuously broadcast process updates to all connected clients"""
    global saved_alert_timestamps
    save_counter = 0  # Counter to save to database every N updates
    SAVE_INTERVAL = 2  # Save to database every 2 updates (4 seconds with 2s interval) ~5 seconds

    while True:
        try:
            # Get local processes
            local_processes = monitor.get_all_processes()
            local_alerts = monitor.get_recent_alerts(limit=10)

            # Get remote host processes
            remote_processes = host_manager.get_all_processes()
            remote_hosts = host_manager.get_all_hosts()

            # Save process data to database periodically
            save_counter += 1
            if save_counter >= SAVE_INTERVAL:
                save_counter = 0
                # Get hostname once for all processes
                current_hostname = socket_module.gethostname()
                for process in local_processes:
                    try:
                        process_data = {
                            'name': process.name,
                            'pid': process.pid,
                            'status': process.status,
                            'cpu_percent': process.cpu_percent,
                            'memory_mb': process.memory_mb,
                            'memory_percent': process.memory_percent,
                            'disk_read_mb': process.disk_read_mb,
                            'disk_write_mb': process.disk_write_mb,
                            'net_sent_mb': process.net_sent_mb,
                            'net_recv_mb': process.net_recv_mb,
                            'uptime_seconds': process.uptime_seconds,
                            'client_version': settings.app_version,
                            'window_title': process.window_title,
                            'window_info': process.window_info,
                            # IMPORTANT: hostname is required for correct matching
                            'hostname': current_hostname,
                            # BMS Gateway status from log files
                            'bms_status': process.bms_status.dict() if process.bms_status else None
                        }
                        await save_process_data(process_data)
                    except Exception as e:
                        logger.error(f"Error saving process data for {process.name}: {e}")

                # Save alerts to database (prevent duplicates)
                for alert in local_alerts:
                    alert_key = f"{alert.timestamp}_{alert.process_name}_{alert.alert_type}"
                    if alert_key not in saved_alert_timestamps:
                        try:
                            alert_data = {
                                'process_name': alert.process_name,
                                'type': alert.alert_type,
                                'message': alert.message,
                                'value': alert.value,
                                'threshold': getattr(alert, 'threshold', None),
                                'hospital_code': getattr(alert, 'hospital_code', None),
                                'hospital_name': getattr(alert, 'hospital_name', None),
                                'hostname': getattr(alert, 'hostname', None) or current_hostname
                            }
                            await save_alert(alert_data)
                            saved_alert_timestamps.add(alert_key)
                            # Keep set from growing too large
                            if len(saved_alert_timestamps) > 1000:
                                saved_alert_timestamps = set(list(saved_alert_timestamps)[-500:])
                        except Exception as e:
                            logger.error(f"Error saving alert: {e}")

                logger.debug(f"Saved {len(local_processes)} processes to database")

            # Enrich local processes with restart schedule
            hostname = socket_module.gethostname()
            enriched_local_processes = []
            for p in local_processes:
                p_dict = p.dict()
                schedule = restart_scheduler.get_schedule(p.name, hostname)
                if schedule:
                    p_dict['restart_schedule'] = {
                        'type': schedule.get('type', 'none'),
                        'intervalMinutes': schedule.get('intervalMinutes'),
                        'intervalSeconds': schedule.get('intervalSeconds'),
                        'dailyTime': schedule.get('dailyTime'),
                        'enabled': schedule.get('enabled', False)
                    }
                # Get auto-start schedule
                auto_start_schedule = restart_scheduler.get_auto_start_schedule(p.name, hostname)
                if auto_start_schedule:
                    p_dict['auto_start_schedule'] = {
                        'type': auto_start_schedule.get('type', 'none'),
                        'intervalMinutes': auto_start_schedule.get('intervalMinutes'),
                        'intervalSeconds': auto_start_schedule.get('intervalSeconds'),
                        'dailyTime': auto_start_schedule.get('dailyTime'),
                        'enabled': auto_start_schedule.get('enabled', False)
                    }
                enriched_local_processes.append(p_dict)

            # Combine data
            message = {
                "type": "update",
                "timestamp": get_thai_iso(),
                "local_processes": enriched_local_processes,
                "remote_processes": [p.dict() for p in remote_processes],
                "hosts": [h.dict() for h in remote_hosts],
                "alerts": [a.dict() for a in local_alerts]
            }

            await manager.broadcast(message)
            await asyncio.sleep(settings.update_interval)
        except Exception as e:
            logger.error(f"Error in broadcast_updates: {e}")
            await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup"""
    # Connect to MySQL database
    try:
        await Database.connect()
        await Database.init_tables()
        logger.info("Database connected and tables initialized")
    except Exception as e:
        logger.warning(f"Database connection failed: {e}. Running without database.")

    # Load saved alert settings and apply to monitor
    try:
        saved_settings = _load_alert_settings()
        monitor.update_thresholds({
            "cpu": saved_settings.get('cpuThreshold', 80),
            "ram": saved_settings.get('ramThreshold', 80),
            "disk_io": saved_settings.get('diskIoThreshold', 100),
            "network": saved_settings.get('networkThreshold', 50)
        })
        monitor.update_alert_settings(saved_settings)
        logger.info("Alert settings loaded from file")
    except Exception as e:
        logger.warning(f"Could not load alert settings: {e}")

    # Start restart scheduler and set monitor reference
    restart_scheduler.set_monitor(monitor)
    await restart_scheduler.start()
    logger.info("Restart scheduler started")

    # Load metadata for all monitored processes from database
    try:
        for process_name in list(monitor.monitored_processes.keys()):
            metadata = await get_monitored_process(process_name)
            if metadata:
                monitor.monitored_processes[process_name]['hospital_code'] = metadata.get('hospital_code')
                monitor.monitored_processes[process_name]['hospital_name'] = metadata.get('hospital_name')
                monitor.monitored_processes[process_name]['hostname'] = metadata.get('hostname') or socket_module.gethostname()
                monitor.monitored_processes[process_name]['program_path'] = metadata.get('program_path')
                logger.info(f"Loaded metadata for {process_name}: hospital={metadata.get('hospital_name')}")
    except Exception as e:
        logger.warning(f"Could not load process metadata from database: {e}")

    # Initialize Push Notification Service (optional)
    if PUSH_AVAILABLE and init_push_service:
        try:
            if settings.use_supabase:
                from database_supabase import db as supabase_db
                push_svc = init_push_service(supabase_db)
                logger.info("Push notification service initialized")
        except Exception as e:
            logger.warning(f"Could not initialize push service: {e}")
    else:
        logger.info("Push notifications disabled (pywebpush not installed)")

    asyncio.create_task(broadcast_updates())
    logger.info("Application started")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown"""
    # Stop restart scheduler
    await restart_scheduler.stop()

    # Disconnect from database
    try:
        await Database.disconnect()
    except Exception as e:
        logger.error(f"Error disconnecting database: {e}")
    logger.info("Application shutting down")

# REST API Endpoints

@app.get("/health")
async def health_check():
    """Health check endpoint for Electron app"""
    return {"status": "ok"}

@app.get("/api/status")
async def api_status():
    """API status endpoint"""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running"
    }

@app.get("/api/hostname")
async def get_hostname():
    """Get the hostname of the current machine"""
    import socket
    return {"hostname": socket.gethostname()}

@app.get("/api/processes", response_model=List[ProcessInfo])
async def get_processes():
    """Get all monitored processes with metadata"""
    try:
        processes = monitor.get_all_processes()
        hostname = socket_module.gethostname()

        # Enrich with metadata from database
        enriched_processes = []
        for process in processes:
            process_dict = process.dict()

            # Get metadata from database
            metadata = await get_monitored_process(process.name)
            if metadata:
                process_dict['hospital_code'] = metadata.get('hospital_code')
                process_dict['hospital_name'] = metadata.get('hospital_name')
                process_dict['program_path'] = metadata.get('program_path')

            # Get restart schedule from scheduler
            schedule = restart_scheduler.get_schedule(process.name, hostname)
            if schedule:
                process_dict['restart_schedule'] = {
                    'type': schedule.get('type', 'none'),
                    'intervalMinutes': schedule.get('intervalMinutes'),
                    'intervalSeconds': schedule.get('intervalSeconds'),
                    'dailyTime': schedule.get('dailyTime'),
                    'enabled': schedule.get('enabled', False)
                }

            # Get auto-start schedule from scheduler
            auto_start_schedule = restart_scheduler.get_auto_start_schedule(process.name, hostname)
            if auto_start_schedule:
                process_dict['auto_start_schedule'] = {
                    'type': auto_start_schedule.get('type', 'none'),
                    'intervalMinutes': auto_start_schedule.get('intervalMinutes'),
                    'intervalSeconds': auto_start_schedule.get('intervalSeconds'),
                    'dailyTime': auto_start_schedule.get('dailyTime'),
                    'enabled': auto_start_schedule.get('enabled', False)
                }

            enriched_processes.append(ProcessInfo(**process_dict))

        return enriched_processes
    except Exception as e:
        logger.error(f"Error getting processes: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/processes")
async def add_process(process: ProcessAdd):
    """Add a process to monitor"""
    try:
        success = monitor.add_process(process.name)
        if success:
            # Load metadata from database into monitor's in-memory storage
            metadata = await get_monitored_process(process.name)
            if metadata and process.name in monitor.monitored_processes:
                monitor.monitored_processes[process.name]['hospital_code'] = metadata.get('hospital_code')
                monitor.monitored_processes[process.name]['hospital_name'] = metadata.get('hospital_name')
                monitor.monitored_processes[process.name]['hostname'] = metadata.get('hostname') or socket_module.gethostname()
                monitor.monitored_processes[process.name]['program_path'] = metadata.get('program_path')
                logger.info(f"Loaded metadata for {process.name}: hospital={metadata.get('hospital_name')}")
            return {"message": f"Process {process.name} added successfully"}
        else:
            raise HTTPException(status_code=404, detail=f"Process {process.name} not found")
    except Exception as e:
        logger.error(f"Error adding process: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/api/processes/{process_name}")
async def remove_process(process_name: str, request: ProcessDeleteRequest = None):
    """Remove a process from monitoring"""
    try:
        # Get pid and hostname from request body if provided
        pid = request.pid if request else None
        hostname = request.hostname if request else None

        # Try to remove from local monitor (may fail if not monitored locally)
        local_removed = monitor.remove_process(process_name, pid)

        # Also try to delete metadata from database (for Supabase records)
        # Use hostname to ensure we only delete the specific machine's process
        db_deleted = False
        try:
            await delete_monitored_process(process_name, pid, hostname)
            db_deleted = True
        except Exception as db_error:
            logger.warning(f"Could not delete from database: {db_error}")

        if local_removed or db_deleted:
            return {"message": f"Process {process_name} (PID: {pid}, hostname: {hostname}) removed successfully", "local_removed": local_removed, "db_deleted": db_deleted}
        else:
            raise HTTPException(status_code=404, detail=f"Process {process_name} with PID {pid} not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing process: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.patch("/api/processes/{process_name}/metadata")
async def update_process_metadata(process_name: str, metadata: ProcessMetadataUpdate):
    """Update process metadata (hospital code, name and program path)"""
    try:
        # Check if process is being monitored
        processes = monitor.get_all_processes()
        process_names = [p.name for p in processes]

        if process_name not in process_names:
            raise HTTPException(status_code=404, detail=f"Process {process_name} not being monitored")

        # Validate hospital_code (required and must be 5 digits)
        if not metadata.hospital_code:
            raise HTTPException(status_code=400, detail="Hospital code is required (รหัสสถานพยาบาลห้ามว่าง)")
        if not metadata.hospital_code.isdigit() or len(metadata.hospital_code) != 5:
            raise HTTPException(status_code=400, detail="Hospital code must be exactly 5 digits")

        # Step 1: Save to LOCAL first (in-memory + local storage)
        hostname = metadata.hostname or socket_module.gethostname()

        # Get window info for this process
        window_title = None
        window_info_dict = None
        if metadata.pid:
            titles = get_window_titles_for_pid(metadata.pid)
            if titles:
                window_title = titles[0]
                window_info = parse_bms_window_title(window_title)
                if window_info:
                    window_info_dict = window_info.model_dump()

        # Update monitor's in-memory process data for LINE notifications
        if process_name in monitor.monitored_processes:
            monitor.monitored_processes[process_name]['hospital_code'] = metadata.hospital_code
            monitor.monitored_processes[process_name]['hospital_name'] = metadata.hospital_name
            monitor.monitored_processes[process_name]['hostname'] = hostname
            monitor.monitored_processes[process_name]['program_path'] = metadata.program_path
            if window_title:
                monitor.monitored_processes[process_name]['window_title'] = window_title
            if window_info_dict:
                monitor.monitored_processes[process_name]['window_info'] = window_info_dict
            logger.info(f"Updated in-memory metadata for {process_name}: hospital={metadata.hospital_name}")

        # Save to local file (including window info)
        _save_process_metadata_local(process_name, metadata.hospital_code, metadata.hospital_name, hostname, metadata.program_path, window_title, window_info_dict)

        # Step 2: Try to save to Supabase (non-blocking, don't fail if error)
        supabase_error = None
        try:
            await save_monitored_process(
                process_name=process_name,
                pid=metadata.pid,
                hospital_code=metadata.hospital_code,
                hospital_name=metadata.hospital_name,
                hostname=hostname,
                program_path=metadata.program_path,
                is_edit=metadata.is_edit or False,
                window_title=window_title,
                window_info=window_info_dict,
                client_version=settings.app_version
            )
            logger.info(f"Saved to Supabase: {process_name} with client_version={settings.app_version}")
        except Exception as db_error:
            supabase_error = str(db_error)
            logger.warning(f"Could not save to Supabase (will retry later): {db_error}")

        # Update restart schedule if provided
        if metadata.restart_schedule:
            restart_scheduler.update_schedule(
                process_name=process_name,
                hostname=metadata.hostname or socket_module.gethostname(),
                schedule=metadata.restart_schedule.model_dump(),
                program_path=metadata.program_path
            )

        # Update auto-start schedule if provided
        if metadata.auto_start_schedule:
            restart_scheduler.update_auto_start_schedule(
                process_name=process_name,
                hostname=metadata.hostname or socket_module.gethostname(),
                schedule=metadata.auto_start_schedule.model_dump(),
                program_path=metadata.program_path
            )

        # Return success with optional warning about Supabase
        response = {
            "message": f"บันทึกข้อมูลสำเร็จ",
            "hospital_code": metadata.hospital_code,
            "hospital_name": metadata.hospital_name,
            "program_path": metadata.program_path,
            "restart_schedule": metadata.restart_schedule.model_dump() if metadata.restart_schedule else None,
            "auto_start_schedule": metadata.auto_start_schedule.model_dump() if metadata.auto_start_schedule else None,
            "local_saved": True
        }
        if supabase_error:
            response["supabase_warning"] = "ไม่สามารถบันทึกไปยัง Cloud ได้ (ข้อมูลถูกบันทึกในเครื่องแล้ว)"
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating process metadata: {e}")
        raise HTTPException(status_code=500, detail="เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง")

@app.get("/api/processes/{process_name}/history")
async def get_process_history(process_name: str):
    """Get historical metrics for a process"""
    try:
        history = monitor.get_process_history(process_name)
        return [h.dict() for h in history]
    except Exception as e:
        logger.error(f"Error getting process history: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/available-processes")
async def list_available_processes():
    """List all running processes on the system"""
    try:
        processes = monitor.list_available_processes()
        return processes
    except Exception as e:
        logger.error(f"Error listing available processes: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/processes/{process_name}/window-info")
async def get_process_window_info(process_name: str, pid: Optional[int] = None):
    """Get window title and parsed info for a running process"""
    try:
        # Find the process by name
        target_pid = pid

        if not target_pid:
            # Search for process by name
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    if proc.info['name'] == process_name:
                        target_pid = proc.info['pid']
                        break
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

        if not target_pid:
            return {
                "window_title": None,
                "window_info": None,
                "message": f"Process {process_name} not found running"
            }

        # Get window titles for this PID
        titles = get_window_titles_for_pid(target_pid)

        if not titles:
            return {
                "window_title": None,
                "window_info": None,
                "pid": target_pid,
                "message": "No visible windows found for this process"
            }

        # Find the best window title (prefer BMS/HOSxP/Gateway titles with most info)
        best_window_title = None
        best_window_info = None
        best_score = -1

        # Priority keywords for BMS applications
        priority_keywords = ['BMS', 'HOSxP', 'Gateway', 'PACs', 'LIS']

        # Negative keywords - titles containing these are likely not the main window
        negative_keywords = ['DB :', 'PostgreSQL', 'MySQL', 'sa@', 'localhost', '127.0.0.1']

        def calculate_info_score(info, title):
            """Calculate score based on how much info is available"""
            if not info:
                return 0
            score = 0
            if info.version:
                score += 1
            if info.hospital_code:
                score += 3  # Hospital code is most important
            if info.hospital_name:
                score += 3  # Hospital name is most important
            if info.company:
                score += 1

            # Bonus for title containing priority keywords
            title_upper = title.upper()
            if any(kw.upper() in title_upper for kw in priority_keywords):
                score += 2

            # Penalty for database connection strings
            if any(neg.upper() in title_upper for neg in negative_keywords):
                score -= 5

            return score

        for title in titles:
            parsed = parse_bms_window_title(title)
            current_score = calculate_info_score(parsed, title)

            # Prefer title with higher score (more parsed info)
            if current_score > best_score:
                best_window_title = title
                best_window_info = parsed
                best_score = current_score

        # Use best found or fallback to first title
        window_title = best_window_title or titles[0]
        window_info = best_window_info or parse_bms_window_title(window_title)

        return {
            "window_title": window_title,
            "window_info": window_info.model_dump() if window_info else None,
            "pid": target_pid,
            "all_titles": titles  # Include all window titles for debugging
        }

    except Exception as e:
        logger.error(f"Error getting window info for {process_name}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/processes/{process_name}/bms-status")
async def get_process_bms_status(process_name: str):
    """Get BMS Gateway status from log files for a monitored process"""
    try:
        # Get window title first for better BMS detection
        window_title = None
        if process_name in monitor.monitored_processes:
            proc_data = monitor.monitored_processes[process_name]
            pid = proc_data['pid']
            titles = get_window_titles_for_pid(pid)
            if titles:
                window_title = titles[0]

        # Get BMS status
        bms_status = monitor.get_bms_status(process_name, window_title)

        if bms_status is None:
            return {
                "success": False,
                "message": f"Process {process_name} is not a BMS Gateway or log path not found",
                "bms_status": None
            }

        return {
            "success": True,
            "message": "BMS status retrieved successfully",
            "bms_status": bms_status.model_dump()
        }

    except Exception as e:
        logger.error(f"Error getting BMS status for {process_name}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/alerts", response_model=List[Alert])
async def get_alerts(limit: int = 50):
    """Get recent alerts"""
    try:
        alerts = monitor.get_recent_alerts(limit=limit)
        return alerts
    except Exception as e:
        logger.error(f"Error getting alerts: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/thresholds")
async def update_thresholds(thresholds: ThresholdConfig):
    """Update alert thresholds"""
    try:
        threshold_dict = {
            "cpu": thresholds.cpu_threshold,
            "ram": thresholds.ram_threshold,
            "disk_io": thresholds.disk_io_threshold,
            "network": thresholds.network_threshold
        }
        monitor.update_thresholds(threshold_dict)
        return {"message": "Thresholds updated successfully", "thresholds": threshold_dict}
    except Exception as e:
        logger.error(f"Error updating thresholds: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/thresholds")
async def get_thresholds():
    """Get current alert thresholds"""
    return monitor.thresholds

@app.get("/api/export/csv")
async def export_csv():
    """Export monitoring data as CSV"""
    try:
        data = []
        for process_name in monitor.monitored_processes.keys():
            history = monitor.get_process_history(process_name)
            for metric in history:
                data.append(metric.dict())

        if not data:
            raise HTTPException(status_code=404, detail="No data to export")

        df = pd.DataFrame(data)
        csv_buffer = BytesIO()
        df.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)

        filename = f"monitor_data_{get_thai_datetime().strftime('%Y%m%d_%H%M%S')}.csv"

        return StreamingResponse(
            csv_buffer,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Error exporting CSV: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/export/excel")
async def export_excel():
    """Export monitoring data as Excel"""
    try:
        data = []
        for process_name in monitor.monitored_processes.keys():
            history = monitor.get_process_history(process_name)
            for metric in history:
                data.append(metric.dict())

        if not data:
            raise HTTPException(status_code=404, detail="No data to export")

        df = pd.DataFrame(data)
        excel_buffer = BytesIO()

        with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Monitor Data')

        excel_buffer.seek(0)

        filename = f"monitor_data_{get_thai_datetime().strftime('%Y%m%d_%H%M%S')}.xlsx"

        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Error exporting Excel: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Process Control Endpoints

@app.post("/api/processes/{process_name}/stop", response_model=ProcessControlResponse)
async def stop_process(process_name: str, request: ProcessStopRequest = None):
    """Stop a monitored process - validates by pid, hostname, hospital_code"""
    try:
        force = request.force if request else False
        pid = request.pid if request else None
        hostname = request.hostname if request else None
        hospital_code = request.hospital_code if request else None

        # Validate: ensure the process matches the given criteria
        if pid or hostname or hospital_code:
            import socket
            current_hostname = socket.gethostname()

            # Check hostname matches current machine
            if hostname and hostname != current_hostname:
                raise HTTPException(
                    status_code=400,
                    detail=f"Hostname mismatch: request is for '{hostname}' but current machine is '{current_hostname}'"
                )

            # Validate hospital_code if provided
            if hospital_code:
                try:
                    meta = await get_monitored_process(process_name, hospital_code)
                    if not meta:
                        raise HTTPException(
                            status_code=404,
                            detail=f"Process {process_name} with hospital_code {hospital_code} not found in database"
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.warning(f"Could not verify hospital_code: {e}")

        result = monitor.stop_process(process_name, force=force, pid=pid)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["message"])
        return ProcessControlResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping process: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/processes/{process_name}/start", response_model=ProcessControlResponse)
async def start_process(process_name: str, request: ProcessStartRequest = None):
    """Start a process - validates by hostname, hospital_code"""
    try:
        executable_path = None
        hostname = request.hostname if request else None
        hospital_code = request.hospital_code if request else None

        # Validate hostname matches current machine
        if hostname:
            import socket
            current_hostname = socket.gethostname()
            if hostname != current_hostname:
                raise HTTPException(
                    status_code=400,
                    detail=f"Hostname mismatch: request is for '{hostname}' but current machine is '{current_hostname}'"
                )

        # Get executable_path from request or from database
        if request and request.executable_path:
            executable_path = request.executable_path
        else:
            # Try to get from process_history table
            try:
                meta = await get_monitored_process(process_name, hospital_code)
                if meta:
                    # Validate hospital_code matches
                    if hospital_code and meta.get('hospital_code') != hospital_code:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Hospital code mismatch for {process_name}"
                        )
                    if meta.get('program_path'):
                        executable_path = meta.get('program_path')
                        logger.info(f"Found executable path from database: {executable_path}")
                elif hospital_code:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Process {process_name} with hospital_code {hospital_code} not found in database"
                    )
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Could not get metadata for {process_name}: {e}")

        result = monitor.start_process(process_name, executable_path=executable_path)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["message"])
        return ProcessControlResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting process: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/processes/{process_name}/restart", response_model=ProcessControlResponse)
async def restart_process(process_name: str, request: ProcessRestartRequest = None):
    """Restart a monitored process - validates by pid, hostname, hospital_code"""
    try:
        force = request.force if request else False
        pid = request.pid if request else None
        hostname = request.hostname if request else None
        hospital_code = request.hospital_code if request else None
        executable_path = request.executable_path if request else None

        # Validate hostname matches current machine
        if hostname:
            import socket
            current_hostname = socket.gethostname()
            if hostname != current_hostname:
                raise HTTPException(
                    status_code=400,
                    detail=f"Hostname mismatch: request is for '{hostname}' but current machine is '{current_hostname}'"
                )

        # Get executable_path from database if not provided
        if not executable_path:
            try:
                meta = await get_monitored_process(process_name, hospital_code)
                if meta:
                    # Validate hospital_code matches
                    if hospital_code and meta.get('hospital_code') != hospital_code:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Hospital code mismatch for {process_name}"
                        )
                    if meta.get('program_path'):
                        executable_path = meta.get('program_path')
                        logger.info(f"Found executable path from database: {executable_path}")
                elif hospital_code:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Process {process_name} with hospital_code {hospital_code} not found in database"
                    )
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Could not get metadata for {process_name}: {e}")

        result = monitor.restart_process(process_name, executable_path=executable_path, force_stop=force, pid=pid)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["message"])
        return ProcessControlResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restarting process: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# ============================================================
# Agent/Multi-Host Monitoring API Endpoints
# ============================================================

async def verify_agent_api_key(x_api_key: str = Header(None)):
    """Verify agent API key"""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required")

    host_id = host_manager.verify_api_key(x_api_key)
    if not host_id:
        raise HTTPException(status_code=403, detail="Invalid API key")

    return host_id

@app.post("/api/agents/register")
async def register_agent(host_data: HostRegister, x_api_key: str = Header(None)):
    """Register a new monitoring agent"""
    try:
        # For initial registration, we can use a master key or allow open registration
        # For production, you should implement proper authentication here

        host_id, api_key = host_manager.register_host(
            hostname=host_data.hostname,
            ip_address=host_data.ip_address,
            os_type=host_data.os_type,
            agent_version=host_data.agent_version
        )

        return {
            "success": True,
            "host_id": host_id,
            "api_key": api_key,
            "message": f"Agent registered successfully: {host_data.hostname}"
        }
    except Exception as e:
        logger.error(f"Error registering agent: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/agents/heartbeat")
async def agent_heartbeat(heartbeat: AgentHeartbeat, x_api_key: str = Header(None)):
    """Receive heartbeat from agent"""
    try:
        host_id = await verify_agent_api_key(x_api_key)

        if host_id != heartbeat.host_id:
            raise HTTPException(status_code=403, detail="Host ID mismatch")

        host_manager.update_heartbeat(heartbeat)
        return {"success": True, "message": "Heartbeat received"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing heartbeat: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/agents/{host_id}/processes")
async def get_agent_monitored_processes(host_id: str, x_api_key: str = Header(None)):
    """Get list of processes that agent should monitor"""
    try:
        verified_host_id = await verify_agent_api_key(x_api_key)

        if verified_host_id != host_id:
            raise HTTPException(status_code=403, detail="Host ID mismatch")

        processes = host_manager.get_monitored_processes(host_id)
        return {"processes": processes}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting monitored processes: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/agents/{host_id}/metrics")
async def receive_agent_metrics(host_id: str, metrics_data: dict, x_api_key: str = Header(None)):
    """Receive metrics from agent"""
    try:
        verified_host_id = await verify_agent_api_key(x_api_key)

        if verified_host_id != host_id:
            raise HTTPException(status_code=403, detail="Host ID mismatch")

        hostname = metrics_data.get("hostname", "unknown")
        processes = metrics_data.get("processes", [])

        host_manager.update_process_metrics(host_id, hostname, processes)
        return {"success": True, "message": "Metrics received"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving metrics: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# ============================================================
# Multi-Host Management API Endpoints
# ============================================================

@app.get("/api/hosts", response_model=List[HostInfo])
async def get_all_hosts():
    """Get all registered hosts"""
    try:
        hosts = host_manager.get_all_hosts()
        # Don't expose API keys
        for host in hosts:
            host.api_key = None
        return hosts
    except Exception as e:
        logger.error(f"Error getting hosts: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/hosts/{host_id}", response_model=HostInfo)
async def get_host(host_id: str):
    """Get specific host info"""
    try:
        host = host_manager.get_host(host_id)
        if not host:
            raise HTTPException(status_code=404, detail="Host not found")

        # Don't expose API key
        host.api_key = None
        return host
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting host: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/api/hosts/{host_id}")
async def remove_host(host_id: str):
    """Remove a host and all its data"""
    try:
        success = host_manager.remove_host(host_id)
        if success:
            return {"message": f"Host {host_id} removed successfully"}
        else:
            raise HTTPException(status_code=404, detail="Host not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing host: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/hosts/{host_id}/processes", response_model=List[HostProcessInfo])
async def get_host_processes(host_id: str):
    """Get all processes for a specific host"""
    try:
        processes = host_manager.get_all_processes_by_host(host_id)
        return processes
    except Exception as e:
        logger.error(f"Error getting host processes: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/hosts/{host_id}/processes")
async def add_host_process(host_id: str, process: ProcessAdd):
    """Add a process to monitor on a specific host"""
    try:
        success = host_manager.add_monitored_process(host_id, process.name)
        if success:
            return {"message": f"Process {process.name} added to host {host_id}"}
        else:
            raise HTTPException(status_code=404, detail="Host not found or process already monitored")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding process to host: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/api/hosts/{host_id}/processes/{process_name}")
async def remove_host_process(host_id: str, process_name: str):
    """Remove a process from monitoring on a specific host"""
    try:
        success = host_manager.remove_monitored_process(host_id, process_name)
        if success:
            return {"message": f"Process {process_name} removed from host {host_id}"}
        else:
            raise HTTPException(status_code=404, detail="Host or process not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing process from host: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/hosts/{host_id}/processes/{process_name}/history")
async def get_host_process_history(host_id: str, process_name: str):
    """Get historical metrics for a process on a specific host"""
    try:
        history = host_manager.get_process_history(host_id, process_name)
        return history
    except Exception as e:
        logger.error(f"Error getting process history: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/multi-host/processes", response_model=List[HostProcessInfo])
async def get_all_host_processes():
    """Get all processes from all hosts"""
    try:
        processes = host_manager.get_all_processes()
        return processes
    except Exception as e:
        logger.error(f"Error getting all host processes: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/stats")
async def get_statistics():
    """Get overall monitoring statistics"""
    try:
        local_stats = {
            "local_processes": len(monitor.monitored_processes)
        }
        remote_stats = host_manager.get_statistics()

        return {
            "local": local_stats,
            "remote": remote_stats,
            "total_processes": local_stats["local_processes"] + remote_stats["total_processes"]
        }
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")



# ============================================================
# Database Settings API Endpoints
# ============================================================

from pydantic import BaseModel

class DatabaseConfigUpdate(BaseModel):
    db_host: str
    db_port: int
    db_user: str
    db_password: str
    db_name: str

@app.get("/api/database/status")
async def get_database_status():
    """Get current database connection status"""
    try:
        if Database._pool is None:
            return {
                "connected": False,
                "host": settings.db_host,
                "port": settings.db_port,
                "database": settings.db_name,
                "tables": [],
                "error": "Not connected"
            }
        
        tables = await Database.fetch_all("SHOW TABLES")
        table_names = [list(t.values())[0] for t in tables]
        
        return {
            "connected": True,
            "host": settings.db_host,
            "port": settings.db_port,
            "database": settings.db_name,
            "tables": table_names,
            "error": None
        }
    except Exception as e:
        return {
            "connected": False,
            "host": settings.db_host,
            "port": settings.db_port,
            "database": settings.db_name,
            "tables": [],
            "error": str(e)
        }

@app.get("/api/database/config")
async def get_database_config():
    """Get current database configuration (without password)"""
    return {
        "db_host": settings.db_host,
        "db_port": settings.db_port,
        "db_user": settings.db_user,
        "db_password": "********",
        "db_name": settings.db_name
    }

@app.post("/api/database/test")
async def test_database_connection(config: DatabaseConfigUpdate):
    """Test database connection with provided credentials"""
    import aiomysql
    try:
        conn = await aiomysql.connect(
            host=config.db_host,
            port=config.db_port,
            user=config.db_user,
            password=config.db_password,
            db=config.db_name,
            charset="utf8mb4",
            connect_timeout=5
        )
        
        async with conn.cursor() as cur:
            await cur.execute("SHOW TABLES")
            tables = await cur.fetchall()
        
        conn.close()
        
        return {
            "success": True,
            "message": f"Connected successfully to {config.db_host}:{config.db_port}/{config.db_name}",
            "tables": [t[0] for t in tables]
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "tables": []
        }

@app.post("/api/database/reconnect")
async def reconnect_database():
    """Reconnect to database with current settings"""
    try:
        # Disconnect first
        if Database._pool:
            await Database.disconnect()
        
        # Reconnect
        await Database.connect()
        await Database.init_tables()
        
        return {
            "success": True,
            "message": "Database reconnected successfully"
        }
    except Exception as e:
        logger.error(f"Database reconnection failed: {e}")
        return {
            "success": False,
            "message": str(e)
        }

@app.post("/api/database/init-tables")
async def init_database_tables():
    """Initialize/create database tables"""
    try:
        if Database._pool is None:
            raise HTTPException(status_code=400, detail="Database not connected")
        
        await Database.init_tables()
        
        tables = await Database.fetch_all("SHOW TABLES")
        table_names = [list(t.values())[0] for t in tables]
        
        return {
            "success": True,
            "message": "Tables initialized successfully",
            "tables": table_names
        }
    except Exception as e:
        logger.error(f"Error initializing tables: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================
# Supabase Test API Endpoints
# ============================================================

@app.get("/api/supabase/test")
async def test_supabase_connection():
    """Test Supabase connection and list tables"""
    from datetime import datetime

    try:
        # Import supabase database module
        if settings.use_supabase:
            from database_supabase import db as supabase_db

            # Test connection by querying tables
            tables_info = []

            # List of expected tables
            expected_tables = [
                'process_history',
                'alerts',
                'thresholds',
                'monitored_processes',
                'process_downtime',
                'system_info',
                'notification_log',
                'maintenance_schedule'
            ]

            for table_name in expected_tables:
                try:
                    result = await supabase_db.select(table_name, limit=1)
                    # Try to get count
                    count_result = await supabase_db._request(
                        "GET",
                        table_name,
                        params={"select": "count", "head": "true"}
                    )

                    row_count = len(result) if result else 0

                    tables_info.append({
                        "name": table_name,
                        "rowCount": row_count,
                        "status": "ok" if result else "empty"
                    })
                except Exception as e:
                    tables_info.append({
                        "name": table_name,
                        "rowCount": None,
                        "status": "error"
                    })

            return {
                "connected": True,
                "message": "Connected to Supabase successfully",
                "supabaseUrl": settings.supabase_url,
                "tables": tables_info,
                "timestamp": get_thai_datetime().strftime("%Y-%m-%d %H:%M:%S")
            }
        else:
            return {
                "connected": False,
                "message": "Supabase is not enabled. Set USE_SUPABASE=true in .env",
                "supabaseUrl": "",
                "tables": [],
                "timestamp": get_thai_datetime().strftime("%Y-%m-%d %H:%M:%S")
            }

    except Exception as e:
        logger.error(f"Supabase connection test failed: {e}")
        return {
            "connected": False,
            "message": str(e),
            "supabaseUrl": settings.supabase_url if settings.use_supabase else "",
            "tables": [],
            "timestamp": get_thai_datetime().strftime("%Y-%m-%d %H:%M:%S")
        }

@app.get("/api/supabase/query/{table_name}")
async def query_supabase_table(table_name: str, limit: int = 10):
    """Query a Supabase table"""
    try:
        if not settings.use_supabase:
            raise HTTPException(status_code=400, detail="Supabase is not enabled")

        from database_supabase import db as supabase_db

        result = await supabase_db.select(table_name, limit=limit)

        return {
            "table": table_name,
            "count": len(result) if result else 0,
            "data": result or [],
            "limit": limit
        }

    except Exception as e:
        logger.error(f"Supabase query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/supabase/init-tables")
async def init_supabase_tables():
    """Initialize Supabase tables (run migration)"""
    try:
        if not settings.use_supabase:
            raise HTTPException(status_code=400, detail="Supabase is not enabled")

        from database_supabase import db as supabase_db

        await supabase_db.init_tables()

        return {
            "success": True,
            "message": "Tables initialized. Note: Full migration should be run in Supabase SQL Editor."
        }

    except Exception as e:
        logger.error(f"Supabase init tables failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/supabase/test-insert")
async def test_supabase_insert():
    """Insert test data into Supabase"""
    from datetime import datetime

    try:
        if not settings.use_supabase:
            raise HTTPException(status_code=400, detail="Supabase is not enabled")

        from database_supabase import db as supabase_db

        # Insert test data into process_history
        test_data = {
            "process_name": "test_process.exe",
            "pid": 99999,
            "status": "running",
            "cpu_percent": 25.5,
            "memory_mb": 512.0,
            "memory_percent": 5.0,
            "disk_read_mb": 1.5,
            "disk_write_mb": 0.5,
            "net_sent_mb": 0.1,
            "net_recv_mb": 0.2
        }

        result = await supabase_db.insert("process_history", test_data)

        if result:
            return {
                "success": True,
                "message": f"Test data inserted successfully at {get_thai_datetime().strftime('%H:%M:%S')}",
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "Insert returned no result (table might not exist)"
            }

    except Exception as e:
        logger.error(f"Supabase test insert failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/api/supabase/test-data")
async def delete_supabase_test_data():
    """Delete test data from Supabase"""
    try:
        if not settings.use_supabase:
            raise HTTPException(status_code=400, detail="Supabase is not enabled")

        from database_supabase import db as supabase_db

        await supabase_db.delete("process_history", {"process_name": "test_process.exe"})

        return {
            "success": True,
            "message": "Test data deleted successfully"
        }

    except Exception as e:
        logger.error(f"Supabase delete test data failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================
# Local Database (MySQL/MariaDB) Test API Endpoints
# ============================================================

@app.get("/api/localdb/test")
async def test_localdb_connection():
    """Test Local MySQL/MariaDB connection and list tables"""
    import aiomysql
    from datetime import datetime as dt

    try:
        # Try to connect
        conn = await aiomysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            db=settings.db_name,
            charset="utf8mb4",
            connect_timeout=5
        )

        tables_info = []

        async with conn.cursor() as cur:
            # Get all tables
            await cur.execute("SHOW TABLES")
            tables = await cur.fetchall()

            for table in tables:
                table_name = table[0]
                try:
                    # Get row count
                    await cur.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                    count_result = await cur.fetchone()
                    row_count = count_result[0] if count_result else 0

                    # Get table engine
                    await cur.execute(f"SHOW TABLE STATUS LIKE '{table_name}'")
                    status = await cur.fetchone()
                    engine = status[1] if status else "Unknown"

                    tables_info.append({
                        "name": table_name,
                        "rowCount": row_count,
                        "engine": engine,
                        "status": "ok" if row_count > 0 else "empty"
                    })
                except Exception as e:
                    tables_info.append({
                        "name": table_name,
                        "rowCount": None,
                        "engine": "Unknown",
                        "status": "error"
                    })

        conn.close()

        return {
            "connected": True,
            "message": f"Connected to MySQL/MariaDB successfully",
            "host": settings.db_host,
            "port": settings.db_port,
            "database": settings.db_name,
            "tables": tables_info,
            "timestamp": dt.now().strftime("%Y-%m-%d %H:%M:%S")
        }

    except Exception as e:
        logger.error(f"LocalDB connection test failed: {e}")
        return {
            "connected": False,
            "message": str(e),
            "host": settings.db_host,
            "port": settings.db_port,
            "database": settings.db_name,
            "tables": [],
            "timestamp": dt.now().strftime("%Y-%m-%d %H:%M:%S")
        }

@app.get("/api/localdb/query/{table_name}")
async def query_localdb_table(table_name: str, limit: int = 10):
    """Query a local MySQL table"""
    try:
        if Database._pool is None:
            raise HTTPException(status_code=400, detail="Database not connected")

        # Sanitize table name to prevent SQL injection
        safe_tables = ['process_history', 'alerts', 'thresholds', 'monitored_processes']
        if table_name not in safe_tables:
            raise HTTPException(status_code=400, detail=f"Table '{table_name}' not allowed")

        result = await Database.fetch_all(f"SELECT * FROM `{table_name}` ORDER BY id DESC LIMIT %s", (limit,))

        # Convert datetime objects to strings
        serialized_result = []
        for row in result:
            serialized_row = {}
            for key, value in row.items():
                if hasattr(value, 'isoformat'):
                    serialized_row[key] = value.isoformat()
                else:
                    serialized_row[key] = value
            serialized_result.append(serialized_row)

        return {
            "table": table_name,
            "count": len(serialized_result),
            "data": serialized_result,
            "limit": limit
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LocalDB query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/localdb/init-tables")
async def init_localdb_tables():
    """Initialize Local MySQL tables"""
    try:
        # Connect if not connected
        if Database._pool is None:
            await Database.connect()

        await Database.init_tables()

        # Get tables after init
        tables = await Database.fetch_all("SHOW TABLES")
        table_names = [list(t.values())[0] for t in tables]

        return {
            "success": True,
            "message": "Tables initialized successfully",
            "tables": table_names
        }

    except Exception as e:
        logger.error(f"LocalDB init tables failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/localdb/test-insert")
async def test_localdb_insert():
    """Insert test data into local MySQL"""
    from datetime import datetime as dt

    try:
        if Database._pool is None:
            await Database.connect()

        # Insert test process history
        test_data = {
            "name": "test_process.exe",
            "pid": 9999,
            "status": "running",
            "cpu_percent": 25.5,
            "memory_mb": 512.0,
            "memory_percent": 5.0,
            "disk_read_mb": 10.5,
            "disk_write_mb": 5.2,
            "net_sent_mb": 1.0,
            "net_recv_mb": 2.0
        }

        await save_process_data(test_data)

        # Insert test alert
        test_alert = {
            "process_name": "test_process.exe",
            "type": "cpu_high",
            "message": "Test alert: CPU usage is high",
            "value": 85.0,
            "threshold": 80.0
        }

        await save_alert(test_alert)

        return {
            "success": True,
            "message": "Test data inserted: 1 process history + 1 alert"
        }

    except Exception as e:
        logger.error(f"LocalDB test insert failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/api/localdb/test-data")
async def delete_localdb_test_data():
    """Delete test data from local MySQL"""
    try:
        if Database._pool is None:
            raise HTTPException(status_code=400, detail="Database not connected")

        # Delete test data
        await Database.execute("DELETE FROM process_history WHERE process_name = %s", ("test_process.exe",))
        await Database.execute("DELETE FROM alerts WHERE process_name = %s", ("test_process.exe",))

        return {
            "success": True,
            "message": "Test data deleted successfully"
        }

    except Exception as e:
        logger.error(f"LocalDB delete test data failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates (requires JWT token via protocol header)"""
    # Verify JWT token from Sec-WebSocket-Protocol header or query param
    payload = await verify_ws_token(websocket)

    # Determine subprotocol to echo back if auth was via protocol
    accepted_protocol = None
    protocols = websocket.headers.get("sec-websocket-protocol", "")
    for proto in protocols.split(","):
        proto = proto.strip()
        if proto.startswith("auth."):
            accepted_protocol = proto
            break

    if payload is None:
        # Allow unauthenticated connections from localhost (client mode)
        client_host = websocket.client.host if websocket.client else ""
        if client_host not in ("127.0.0.1", "localhost", "::1"):
            await websocket.close(code=1008, reason="Authentication required")
            return

    if accepted_protocol:
        await websocket.accept(subprotocol=accepted_protocol)
        manager.active_connections.append(websocket)
        logger.info(f"WebSocket client connected (protocol auth). Total: {len(manager.active_connections)}")
    else:
        await manager.connect(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

# ============================================================
# Alert Settings API Endpoints
# ============================================================

# Store alert settings in memory (per-session) and file (persistent)
import json as json_module

def _get_alert_settings_file():
    """Get path for alert settings file"""
    if os.name == 'nt':  # Windows
        app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        config_dir = os.path.join(app_data, 'MonitorApp', 'config')
    else:
        config_dir = os.path.join(os.path.expanduser('~'), '.monitorapp')
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, 'alert_settings.json')

def _load_alert_settings():
    """Load alert settings from file"""
    try:
        filepath = _get_alert_settings_file()
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json_module.load(f)
    except Exception as e:
        logger.error(f"Error loading alert settings: {e}")
    # Default settings
    return {
        "cpuAlertEnabled": True,
        "ramAlertEnabled": True,
        "diskIoAlertEnabled": True,
        "networkAlertEnabled": True,
        "processStoppedAlertEnabled": True,
        "cpuThreshold": 80.0,
        "ramThreshold": 80.0,
        "diskIoThreshold": 100.0,
        "networkThreshold": 50.0,
        "processStoppedMinutes": 5,
        "processStoppedSeconds": 0
    }

def _save_alert_settings(settings_data: dict):
    """Save alert settings to file"""
    try:
        filepath = _get_alert_settings_file()
        with open(filepath, 'w', encoding='utf-8') as f:
            json_module.dump(settings_data, f, indent=2, ensure_ascii=False)
        logger.info("Alert settings saved")
    except Exception as e:
        logger.error(f"Error saving alert settings: {e}")

@app.get("/api/alert-settings")
async def get_alert_settings():
    """Get current alert settings"""
    return _load_alert_settings()

@app.post("/api/alert-settings")
async def update_alert_settings_endpoint(settings_data: AlertSettings):
    """Update alert settings"""
    settings_dict = settings_data.model_dump()
    _save_alert_settings(settings_dict)

    # Update the process monitor thresholds
    monitor.update_thresholds({
        "cpu": settings_dict['cpuThreshold'],
        "ram": settings_dict['ramThreshold'],
        "disk_io": settings_dict['diskIoThreshold'],
        "network": settings_dict['networkThreshold']
    })

    # Update the alert settings (enabled/disabled flags and durations)
    monitor.update_alert_settings(settings_dict)

    return {"success": True, "message": "Alert settings updated"}


# ============== LINE Official Account API ==============

@app.get("/api/line-oa/status")
async def get_line_oa_status():
    """Get LINE OA configuration status"""
    settings_data = _load_line_settings()
    token = settings_data.get("channel_access_token", "")
    channel_secret = settings_data.get("channel_secret", "")

    # Mask tokens for security (show first 10 and last 4 chars)
    masked_token = ""
    if token and len(token) > 20:
        masked_token = token[:10] + "..." + token[-4:]
    elif token:
        masked_token = token[:4] + "..." if len(token) > 4 else "****"

    masked_secret = ""
    if channel_secret and len(channel_secret) > 10:
        masked_secret = channel_secret[:4] + "..." + channel_secret[-4:]
    elif channel_secret:
        masked_secret = "****"

    return {
        "configured": line_notify_service.is_configured(),
        "enabled": line_notify_service.enabled,
        "hasToken": bool(token),
        "hasChannelSecret": bool(channel_secret),
        "maskedToken": masked_token,
        "maskedSecret": masked_secret,
        "userCount": len(line_notify_service.user_ids),
        "groupCount": len(line_notify_service.group_ids),
        "webhookUrl": settings_data.get("webhook_url", "")
    }

@app.get("/api/line-oa/debug")
async def debug_line_oa():
    """Debug LINE OA configuration - shows why notifications may not work"""
    settings_data = _load_line_settings()

    # Check each condition
    has_token = bool(settings_data.get("channel_access_token"))
    is_enabled = settings_data.get("enabled", False)
    user_ids = settings_data.get("user_ids", [])
    group_ids = settings_data.get("group_ids", [])
    has_recipients = len(user_ids) > 0 or len(group_ids) > 0

    # Check service state
    service_has_token = bool(line_notify_service.channel_access_token)
    service_enabled = line_notify_service.enabled
    service_users = len(line_notify_service.user_ids)
    service_groups = len(line_notify_service.group_ids)
    service_configured = line_notify_service.is_configured()

    # Build diagnosis
    issues = []
    if not has_token:
        issues.append("❌ ไม่มี Channel Access Token - ต้องตั้งค่าใน Master Mode")
    if not is_enabled:
        issues.append("❌ LINE OA ถูกปิดใช้งาน (enabled=false)")
    if not has_recipients:
        issues.append("❌ ไม่มี User ID หรือ Group ID - ต้องเพิ่ม bot เป็นเพื่อนและส่งข้อความมา")
    if not service_configured:
        issues.append("❌ Service ยังไม่พร้อมใช้งาน - ลอง Restart Backend หรือ Sync LINE Settings")

    if not issues:
        issues.append("✅ LINE OA พร้อมใช้งาน")

    return {
        "file_settings": {
            "has_token": has_token,
            "enabled": is_enabled,
            "user_count": len(user_ids),
            "group_count": len(group_ids)
        },
        "service_state": {
            "has_token": service_has_token,
            "enabled": service_enabled,
            "user_count": service_users,
            "group_count": service_groups,
            "is_configured": service_configured
        },
        "cooldown_seconds": line_notify_service.cooldown_seconds,
        "sent_alerts_count": len(line_notify_service.sent_alerts),
        "diagnosis": issues
    }

@app.post("/api/line-oa/configure")
async def configure_line_oa(token: str = None, enabled: bool = True, channel_secret: str = None):
    """Configure LINE OA with Channel Access Token"""
    settings_data = _load_line_settings()
    user_ids = settings_data.get("user_ids", [])

    # Update token if provided, otherwise use existing
    if token:
        settings_data["channel_access_token"] = token
        line_notify_service.configure(token, user_ids, enabled)
    elif settings_data.get("channel_access_token"):
        # Use existing token but update enabled status
        line_notify_service.configure(settings_data["channel_access_token"], user_ids, enabled)
    else:
        return {"success": False, "message": "Channel Access Token is required"}

    # Update channel secret if provided
    if channel_secret:
        settings_data["channel_secret"] = channel_secret

    # Update enabled status
    settings_data["enabled"] = enabled

    _save_line_settings(settings_data)
    return {"success": True, "message": "LINE OA configured successfully"}

@app.post("/api/line-oa/test-token")
async def test_line_token(token: str):
    """Test LINE OA token by getting bot info"""
    import httpx

    if not token:
        return {"success": False, "message": "Token is required"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.line.me/v2/bot/info",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0
            )

        if response.status_code == 200:
            data = response.json()
            return {
                "success": True,
                "channelName": data.get("displayName", "LINE OA"),
                "message": f"เชื่อมต่อสำเร็จ: {data.get('displayName', 'LINE OA')}"
            }
        else:
            return {
                "success": False,
                "message": f"ไม่สามารถเชื่อมต่อได้ (HTTP {response.status_code})"
            }
    except Exception as e:
        logger.error(f"Error testing LINE token: {e}")
        return {"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}

@app.post("/api/line-oa/add-user")
async def add_line_user(user_id: str):
    """Add a user ID to receive notifications"""
    if not user_id:
        return {"success": False, "message": "User ID is required"}

    line_notify_service.add_user_id(user_id)
    # Save to settings file
    settings_data = _load_line_settings()
    if "user_ids" not in settings_data:
        settings_data["user_ids"] = []
    if user_id not in settings_data["user_ids"]:
        settings_data["user_ids"].append(user_id)
    _save_line_settings(settings_data)
    return {"success": True, "message": f"User added. Total users: {len(line_notify_service.user_ids)}"}

@app.post("/api/line-oa/remove-user")
async def remove_line_user(user_id: str):
    """Remove a user ID from notifications"""
    if not user_id:
        return {"success": False, "message": "User ID is required"}

    line_notify_service.remove_user_id(user_id)
    # Save to settings file
    settings_data = _load_line_settings()
    if "user_ids" in settings_data and user_id in settings_data["user_ids"]:
        settings_data["user_ids"].remove(user_id)
    _save_line_settings(settings_data)
    return {"success": True, "message": f"User removed. Total users: {len(line_notify_service.user_ids)}"}

@app.get("/api/line-oa/users")
async def get_line_users():
    """Get list of user IDs"""
    return {
        "users": [{"id": uid, "display": f"{uid[:10]}...{uid[-4:]}" if len(uid) > 14 else uid}
                  for uid in line_notify_service.user_ids]
    }

@app.post("/api/line-oa/add-group")
async def add_line_group(group_id: str):
    """Add a group ID to receive notifications"""
    if not group_id:
        return {"success": False, "message": "Group ID is required"}

    line_notify_service.add_group_id(group_id)
    # Save to settings file
    settings_data = _load_line_settings()
    if "group_ids" not in settings_data:
        settings_data["group_ids"] = []
    if group_id not in settings_data["group_ids"]:
        settings_data["group_ids"].append(group_id)
    _save_line_settings(settings_data)
    return {"success": True, "message": f"Group added. Total groups: {len(line_notify_service.group_ids)}"}

@app.post("/api/line-oa/remove-group")
async def remove_line_group(group_id: str):
    """Remove a group ID from notifications"""
    if not group_id:
        return {"success": False, "message": "Group ID is required"}

    line_notify_service.remove_group_id(group_id)
    # Save to settings file
    settings_data = _load_line_settings()
    if "group_ids" in settings_data and group_id in settings_data["group_ids"]:
        settings_data["group_ids"].remove(group_id)
    _save_line_settings(settings_data)
    return {"success": True, "message": f"Group removed. Total groups: {len(line_notify_service.group_ids)}"}

@app.get("/api/line-oa/groups")
async def get_line_groups():
    """Get list of group IDs"""
    return {
        "groups": [{"id": gid, "display": f"{gid[:10]}...{gid[-4:]}" if len(gid) > 14 else gid}
                   for gid in line_notify_service.group_ids]
    }

@app.post("/api/line-oa/test")
async def test_line_oa():
    """Test LINE OA connection"""
    result = await line_notify_service.test_connection()
    return result

@app.post("/api/line-oa/toggle")
async def toggle_line_oa(enabled: bool):
    """Enable or disable LINE OA"""
    line_notify_service.enabled = enabled
    # Update settings file
    settings_data = _load_line_settings()
    settings_data["enabled"] = enabled
    _save_line_settings(settings_data)
    return {"success": True, "enabled": enabled}

@app.post("/api/line-oa/webhook")
async def line_webhook(request: Request):
    """LINE Webhook endpoint for receiving events"""
    import hashlib
    import hmac
    import base64

    try:
        body = await request.body()
        body_str = body.decode('utf-8')

        # Get channel secret for signature verification
        settings_data = _load_line_settings()
        channel_secret = settings_data.get("channel_secret", "")

        # Verify signature if channel secret is configured
        if channel_secret:
            signature = request.headers.get("X-Line-Signature", "")
            hash_value = hmac.new(
                channel_secret.encode('utf-8'),
                body,
                hashlib.sha256
            ).digest()
            expected_signature = base64.b64encode(hash_value).decode('utf-8')

            if signature != expected_signature:
                logger.warning("LINE webhook signature verification failed")
                return {"status": "error", "message": "Invalid signature"}

        # Parse webhook events
        import json
        data = json.loads(body_str)
        events = data.get("events", [])

        for event in events:
            event_type = event.get("type", "")
            source = event.get("source", {})
            source_type = source.get("type", "")
            user_id = source.get("userId", "")
            group_id = source.get("groupId", "")

            # Handle join event (bot added to group)
            if event_type == "join" and group_id:
                logger.info(f"LINE join event - bot added to group: {group_id}")
                # Auto-add group ID
                line_notify_service.add_group_id(group_id)
                if "group_ids" not in settings_data:
                    settings_data["group_ids"] = []
                if group_id not in settings_data["group_ids"]:
                    settings_data["group_ids"].append(group_id)
                    _save_line_settings(settings_data)
                    logger.info(f"Auto-added LINE group: {group_id}")

            # Handle leave event (bot removed from group)
            elif event_type == "leave" and group_id:
                logger.info(f"LINE leave event - bot removed from group: {group_id}")
                line_notify_service.remove_group_id(group_id)
                if "group_ids" in settings_data and group_id in settings_data["group_ids"]:
                    settings_data["group_ids"].remove(group_id)
                    _save_line_settings(settings_data)
                    logger.info(f"Removed LINE group: {group_id}")

            # Handle follow event (user added bot as friend)
            elif event_type == "follow" and user_id:
                logger.info(f"LINE follow event from user: {user_id}")
                # Auto-add user ID
                line_notify_service.add_user_id(user_id)
                if "user_ids" not in settings_data:
                    settings_data["user_ids"] = []
                if user_id not in settings_data["user_ids"]:
                    settings_data["user_ids"].append(user_id)
                    _save_line_settings(settings_data)
                    logger.info(f"Auto-added LINE user: {user_id}")

            # Handle unfollow event (user blocked bot)
            elif event_type == "unfollow" and user_id:
                logger.info(f"LINE unfollow event from user: {user_id}")
                line_notify_service.remove_user_id(user_id)
                if "user_ids" in settings_data and user_id in settings_data["user_ids"]:
                    settings_data["user_ids"].remove(user_id)
                    _save_line_settings(settings_data)
                    logger.info(f"Removed LINE user: {user_id}")

            # Handle message event from group
            elif event_type == "message" and source_type == "group" and group_id:
                logger.info(f"LINE message from group: {group_id}")
                # Auto-add group if not exists
                if group_id not in line_notify_service.group_ids:
                    line_notify_service.add_group_id(group_id)
                    if "group_ids" not in settings_data:
                        settings_data["group_ids"] = []
                    if group_id not in settings_data["group_ids"]:
                        settings_data["group_ids"].append(group_id)
                        _save_line_settings(settings_data)
                        logger.info(f"Auto-added LINE group from message: {group_id}")

            # Handle message event from user
            elif event_type == "message" and user_id:
                logger.info(f"LINE message from user: {user_id}")
                # Auto-add user if not exists
                if user_id not in line_notify_service.user_ids:
                    line_notify_service.add_user_id(user_id)
                    if "user_ids" not in settings_data:
                        settings_data["user_ids"] = []
                    if user_id not in settings_data["user_ids"]:
                        settings_data["user_ids"].append(user_id)
                        _save_line_settings(settings_data)
                        logger.info(f"Auto-added LINE user from message: {user_id}")

        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error processing LINE webhook: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/line-oa/webhook-url")
async def update_webhook_url(webhook_url: str):
    """Update webhook URL in settings"""
    settings_data = _load_line_settings()
    settings_data["webhook_url"] = webhook_url
    _save_line_settings(settings_data)
    return {"success": True, "message": "Webhook URL updated", "webhookUrl": webhook_url}

@app.get("/api/line-oa/alerts/{alert_type}")
async def get_line_alerts_by_type(alert_type: str, limit: int = 100):
    """Get alerts by type (e.g., PROCESS_STARTED, PROCESS_STOPPED, CPU, RAM)"""
    try:
        alerts = await get_alerts_by_type(alert_type, limit)
        return {"success": True, "alerts": alerts, "count": len(alerts)}
    except Exception as e:
        logger.error(f"Error getting alerts by type: {e}")
        return {"success": False, "message": str(e), "alerts": []}

@app.post("/api/line-oa/send-from-alerts")
async def send_line_from_alerts(alert_type: str = "PROCESS_STARTED", limit: int = 10):
    """Send LINE notifications from alerts table filtered by alert_type

    Args:
        alert_type: Type of alert to send (default: PROCESS_STARTED)
        limit: Maximum number of alerts to process (default: 10)

    Returns:
        Result of sending notifications
    """
    if not line_notify_service.is_configured():
        return {"success": False, "message": "LINE OA ยังไม่ได้ตั้งค่า"}

    try:
        # Get alerts by type
        alerts = await get_alerts_by_type(alert_type, limit)

        if not alerts:
            return {"success": True, "message": f"ไม่พบ alerts ประเภท {alert_type}", "sent": 0}

        sent_count = 0
        errors = []

        for alert in alerts:
            try:
                process_name = alert.get("process_name", "Unknown")
                message = alert.get("message", "")
                hostname = alert.get("hostname")
                hospital_name = alert.get("hospital_name")

                # Send LINE notification
                success = await line_notify_service.send_alert(
                    process_name=process_name,
                    alert_type=alert_type,
                    message=message,
                    hostname=hostname,
                    hospital_name=hospital_name
                )

                if success:
                    sent_count += 1
                    # Try to mark as sent (optional - column may not exist)
                    alert_id = alert.get("id")
                    if alert_id:
                        await mark_alert_as_sent(alert_id)

            except Exception as e:
                errors.append(f"Alert {alert.get('id')}: {str(e)}")

        return {
            "success": sent_count > 0,
            "message": f"ส่งแจ้งเตือนสำเร็จ {sent_count}/{len(alerts)} รายการ",
            "sent": sent_count,
            "total": len(alerts),
            "errors": errors if errors else None
        }

    except Exception as e:
        logger.error(f"Error sending LINE from alerts: {e}")
        return {"success": False, "message": str(e)}

@app.post("/api/line-oa/send-unsent-alerts")
async def send_unsent_line_alerts(alert_type: str = None, limit: int = 10):
    """Send LINE notifications for alerts that haven't been sent yet

    Args:
        alert_type: Optional filter by alert type (e.g., PROCESS_STARTED)
        limit: Maximum number of alerts to process (default: 10)

    Returns:
        Result of sending notifications
    """
    if not line_notify_service.is_configured():
        return {"success": False, "message": "LINE OA ยังไม่ได้ตั้งค่า"}

    try:
        # Get unsent alerts
        alerts = await get_unsent_alerts(alert_type, limit)

        if not alerts:
            msg = f"ไม่พบ alerts ที่ยังไม่ได้ส่ง"
            if alert_type:
                msg += f" ประเภท {alert_type}"
            return {"success": True, "message": msg, "sent": 0}

        sent_count = 0
        errors = []

        for alert in alerts:
            try:
                process_name = alert.get("process_name", "Unknown")
                a_type = alert.get("alert_type", "UNKNOWN")
                message = alert.get("message", "")
                hostname = alert.get("hostname")
                hospital_name = alert.get("hospital_name")

                # Send LINE notification
                success = await line_notify_service.send_alert(
                    process_name=process_name,
                    alert_type=a_type,
                    message=message,
                    hostname=hostname,
                    hospital_name=hospital_name
                )

                if success:
                    sent_count += 1
                    # Mark as sent
                    alert_id = alert.get("id")
                    if alert_id:
                        await mark_alert_as_sent(alert_id)

            except Exception as e:
                errors.append(f"Alert {alert.get('id')}: {str(e)}")

        return {
            "success": sent_count > 0,
            "message": f"ส่งแจ้งเตือนสำเร็จ {sent_count}/{len(alerts)} รายการ",
            "sent": sent_count,
            "total": len(alerts),
            "errors": errors if errors else None
        }

    except Exception as e:
        logger.error(f"Error sending unsent LINE alerts: {e}")
        return {"success": False, "message": str(e)}


@app.post("/api/line-oa/send-process-alerts")
async def send_process_alerts_from_supabase(limit: int = 50):
    """Send LINE notifications for PROCESS_STARTED and PROCESS_STOPPED alerts from Supabase

    This API:
    1. Fetches unsent alerts from Supabase where alert_type = PROCESS_STARTED or PROCESS_STOPPED
    2. Gets LINE settings from Supabase (line_settings table)
    3. Sends notifications to configured LINE users/groups
    4. Marks alerts as sent in Supabase

    Args:
        limit: Maximum number of alerts to process (default: 50)

    Returns:
        Result of sending notifications including count of sent/failed
    """
    try:
        # Step 1: Get LINE settings from Supabase
        line_settings = await get_global_line_settings_for_notification()

        if not line_settings:
            return {
                "success": False,
                "message": "ไม่พบการตั้งค่า LINE ใน Supabase",
                "sent": 0
            }

        # Check if LINE is enabled
        if not line_settings.get("enabled", False):
            return {
                "success": False,
                "message": "LINE notification ถูกปิดอยู่",
                "sent": 0
            }

        # Configure LINE service with settings from Supabase
        channel_access_token = line_settings.get("channel_access_token", "")
        user_ids = line_settings.get("user_ids", [])
        group_ids = line_settings.get("group_ids", [])

        if not channel_access_token:
            return {
                "success": False,
                "message": "ไม่พบ Channel Access Token",
                "sent": 0
            }

        if not user_ids and not group_ids:
            return {
                "success": False,
                "message": "ไม่พบ User ID หรือ Group ID สำหรับรับข้อความ",
                "sent": 0
            }

        # Configure the LINE service
        line_notify_service.configure(
            channel_access_token=channel_access_token,
            user_ids=user_ids if isinstance(user_ids, list) else [],
            group_ids=group_ids if isinstance(group_ids, list) else [],
            enabled=True
        )

        # Step 2: Get unsent process alerts from Supabase
        alerts = await get_unsent_process_alerts(limit)

        if not alerts:
            return {
                "success": True,
                "message": "ไม่พบ alerts ที่ยังไม่ได้ส่ง (PROCESS_STARTED/PROCESS_STOPPED)",
                "sent": 0,
                "total": 0
            }

        # Step 3: Send notifications
        sent_count = 0
        errors = []

        for alert in alerts:
            try:
                process_name = alert.get("process_name", "Unknown")
                alert_type = alert.get("alert_type", "UNKNOWN")
                message = alert.get("message", "")
                hostname = alert.get("hostname")
                hospital_name = alert.get("hospital_name")

                # Send LINE notification
                success = await line_notify_service.send_alert(
                    process_name=process_name,
                    alert_type=alert_type,
                    message=message,
                    hostname=hostname,
                    hospital_name=hospital_name
                )

                if success:
                    sent_count += 1
                    # Mark as sent in Supabase
                    alert_id = alert.get("id")
                    if alert_id:
                        await mark_alert_as_sent(alert_id)
                    logger.info(f"Sent LINE alert: {alert_type} - {process_name}")
                else:
                    errors.append(f"Alert {alert.get('id')}: ส่งไม่สำเร็จ")

            except Exception as e:
                errors.append(f"Alert {alert.get('id')}: {str(e)}")
                logger.error(f"Error sending alert {alert.get('id')}: {e}")

        return {
            "success": sent_count > 0,
            "message": f"ส่งแจ้งเตือนสำเร็จ {sent_count}/{len(alerts)} รายการ",
            "sent": sent_count,
            "total": len(alerts),
            "alert_types": ["PROCESS_STARTED", "PROCESS_STOPPED"],
            "line_settings_source": "supabase",
            "errors": errors if errors else None
        }

    except Exception as e:
        logger.error(f"Error in send_process_alerts_from_supabase: {e}")
        return {"success": False, "message": str(e), "sent": 0}


@app.get("/api/line-oa/pending-process-alerts")
async def get_pending_process_alerts(limit: int = 50):
    """Get pending PROCESS_STARTED and PROCESS_STOPPED alerts that haven't been sent to LINE

    Returns:
        List of pending alerts from Supabase
    """
    try:
        alerts = await get_unsent_process_alerts(limit)
        return {
            "success": True,
            "alerts": alerts,
            "count": len(alerts),
            "alert_types": ["PROCESS_STARTED", "PROCESS_STOPPED"]
        }
    except Exception as e:
        logger.error(f"Error getting pending process alerts: {e}")
        return {"success": False, "message": str(e), "alerts": [], "count": 0}


def _get_line_settings_path():
    """Get path for LINE settings file"""
    if os.name == 'nt':
        app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        settings_dir = os.path.join(app_data, 'MonitorApp', 'data')
    else:
        settings_dir = os.path.join(os.path.dirname(__file__), 'data')
    os.makedirs(settings_dir, exist_ok=True)
    return os.path.join(settings_dir, 'line_settings.json')

def _load_line_settings() -> dict:
    """Load LINE settings from local file"""
    import json
    settings_path = _get_line_settings_path()
    try:
        if os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading LINE settings: {e}")
    return {"channel_access_token": "", "channel_secret": "", "user_ids": [], "enabled": False}

def _save_line_settings(settings_data: dict):
    """Save LINE settings to local file and Supabase"""
    import json
    settings_path = _get_line_settings_path()
    try:
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings_data, f, indent=2)
        logger.debug("LINE settings saved to local file")
    except Exception as e:
        logger.error(f"Error saving LINE settings to file: {e}")

    # Also save to Supabase (async)
    try:
        hostname = socket_module.gethostname()
        asyncio.create_task(_save_line_settings_to_supabase(settings_data, hostname))
    except Exception as e:
        logger.error(f"Error scheduling Supabase save: {e}")

async def _save_line_settings_to_supabase(settings_data: dict, hostname: str):
    """Save LINE settings to Supabase database"""
    try:
        result = await save_line_settings_db(settings_data, hostname)
        if result:
            logger.info(f"LINE settings saved to Supabase for {hostname}")
        else:
            logger.warning(f"Failed to save LINE settings to Supabase")
    except Exception as e:
        logger.error(f"Error saving LINE settings to Supabase: {e}")

def _init_line_oa():
    """Initialize LINE OA from saved settings"""
    settings_data = _load_line_settings()
    if settings_data.get("channel_access_token"):
        # Ensure user_ids/group_ids are lists (Supabase may return bool/None)
        user_ids = settings_data.get("user_ids", [])
        group_ids = settings_data.get("group_ids", [])
        if not isinstance(user_ids, list):
            user_ids = []
        if not isinstance(group_ids, list):
            group_ids = []
        line_notify_service.configure(
            channel_access_token=settings_data["channel_access_token"],
            user_ids=user_ids,
            group_ids=group_ids,
            enabled=settings_data.get("enabled", False)
        )
        logger.info(f"LINE OA initialized. Users: {len(line_notify_service.user_ids)}, Groups: {len(line_notify_service.group_ids)}")

# Initialize LINE OA on startup
_init_line_oa()


# ============================================================
# LINE Settings Sync API (for syncing settings across clients)
# ============================================================

@app.get("/api/line-settings/global")
async def get_global_line_settings():
    """Get global LINE settings from Supabase for syncing to all clients.

    This returns the most recently updated LINE settings from Supabase,
    which can be used by client machines to sync their local settings.
    """
    try:
        settings_data = await get_global_line_settings_db()
        if settings_data:
            # Mask sensitive data for security
            masked_token = ""
            masked_secret = ""
            if settings_data.get("channel_access_token"):
                token = settings_data["channel_access_token"]
                masked_token = f"{token[:10]}...{token[-4:]}" if len(token) > 14 else "***"
            if settings_data.get("channel_secret"):
                secret = settings_data["channel_secret"]
                masked_secret = f"{secret[:4]}...{secret[-4:]}" if len(secret) > 8 else "***"

            return {
                "success": True,
                "settings": {
                    "channel_access_token": settings_data.get("channel_access_token", ""),
                    "channel_secret": settings_data.get("channel_secret", ""),
                    "user_ids": settings_data.get("user_ids", []),
                    "group_ids": settings_data.get("group_ids", []),
                    "enabled": settings_data.get("enabled", False),
                    "webhook_url": settings_data.get("webhook_url", ""),
                    "source_hostname": settings_data.get("hostname", "unknown")
                },
                "masked_token": masked_token,
                "masked_secret": masked_secret
            }
        else:
            return {
                "success": False,
                "message": "ไม่พบการตั้งค่า LINE ใน Supabase"
            }
    except Exception as e:
        logger.error(f"Error getting global LINE settings: {e}")
        return {
            "success": False,
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        }


@app.post("/api/line-settings/sync")
async def sync_line_settings():
    """Sync LINE settings from Supabase to local machine.

    This fetches the global LINE settings from Supabase and saves them
    to the local machine, then reinitializes the LINE OA service.
    """
    try:
        # Get global settings from Supabase
        settings_data = await get_global_line_settings_db()
        if not settings_data:
            return {
                "success": False,
                "message": "ไม่พบการตั้งค่า LINE ใน Supabase"
            }

        # Prepare local settings data
        local_settings = {
            "channel_access_token": settings_data.get("channel_access_token", ""),
            "channel_secret": settings_data.get("channel_secret", ""),
            "user_ids": settings_data.get("user_ids", []),
            "group_ids": settings_data.get("group_ids", []),
            "enabled": settings_data.get("enabled", False),
            "webhook_url": settings_data.get("webhook_url", "")
        }

        # Save to local file
        _save_line_settings_local_only(local_settings)

        # Reinitialize LINE OA service
        if local_settings.get("channel_access_token"):
            line_notify_service.configure(
                channel_access_token=local_settings["channel_access_token"],
                user_ids=local_settings.get("user_ids", []),
                group_ids=local_settings.get("group_ids", []),
                enabled=local_settings.get("enabled", False)
            )

        source_hostname = settings_data.get("hostname", "unknown")
        logger.info(f"LINE settings synced from Supabase (source: {source_hostname})")

        return {
            "success": True,
            "message": f"ซิงค์การตั้งค่า LINE สำเร็จ (จาก {source_hostname})",
            "source_hostname": source_hostname,
            "user_count": len(local_settings.get("user_ids", [])),
            "group_count": len(local_settings.get("group_ids", [])),
            "enabled": local_settings.get("enabled", False)
        }
    except Exception as e:
        logger.error(f"Error syncing LINE settings: {e}")
        return {
            "success": False,
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        }


def _save_line_settings_local_only(settings_data: dict):
    """Save LINE settings to local file only (without syncing to Supabase)"""
    import json
    settings_path = _get_line_settings_path()
    try:
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings_data, f, indent=2)
        logger.debug("LINE settings saved to local file (sync)")
    except Exception as e:
        logger.error(f"Error saving LINE settings to file: {e}")


# ============================================================
# BMS Status LINE Notification API
# ============================================================

class BMSAlertRequest(PydanticBaseModel):
    """Request model for BMS alert notification"""
    process_name: str
    alert_type: str  # DB_DISCONNECTED, GATEWAY_STOPPED, GATEWAY_ERROR, CUSTOM
    message: Optional[str] = None
    hospital_name: Optional[str] = None
    hostname: Optional[str] = None


@app.get("/api/line-oa/bms/status")
async def get_bms_status_for_line(process_name: str = "BMSHOSxPLISServices"):
    """Get current BMS Gateway status for LINE notification

    Args:
        process_name: Name of BMS process to check

    Returns:
        BMS Gateway status including DB connections, heartbeat, and thread status
    """
    try:
        bms_monitor = BMSLogMonitor(process_name)
        status = bms_monitor.get_status()

        return {
            "success": True,
            "process_name": process_name,
            "status": status.to_dict(),
            "is_idle": not bms_monitor.is_any_thread_working(),
            "log_path": bms_monitor.log_path
        }
    except Exception as e:
        logger.error(f"Error getting BMS status: {e}")
        return {"success": False, "message": str(e)}


@app.post("/api/line-oa/bms/check-and-alert")
async def check_bms_and_send_alert(process_name: str = "BMSHOSxPLISServices"):
    """Check BMS status and send LINE alert if there's an issue

    Checks for:
    - HOSxP DB disconnected
    - Gateway DB disconnected
    - Gateway stopped
    - Heartbeat stale

    Only sends alert if LINE is configured and issue is detected.
    """
    if not line_notify_service.is_configured():
        return {"success": False, "message": "LINE OA ยังไม่ได้ตั้งค่า", "alerts_sent": 0}

    try:
        bms_monitor = BMSLogMonitor(process_name)
        status = bms_monitor.get_status()

        alerts_sent = 0
        issues_found = []

        # Check HOSxP DB connection
        if status.hosxp_db_status == 'disconnected':
            issues_found.append({
                "type": "DB_DISCONNECTED",
                "message": f"HOSxP DB ไม่สามารถเชื่อมต่อได้: {status.hosxp_db_last_error or 'Unknown error'}"
            })

        # Check Gateway DB connection
        if status.gateway_db_status == 'disconnected':
            issues_found.append({
                "type": "DB_DISCONNECTED",
                "message": f"Gateway DB ไม่สามารถเชื่อมต่อได้: {status.gateway_db_last_error or 'Unknown error'}"
            })

        # Check Gateway status
        if status.gateway_status == 'stopped':
            issues_found.append({
                "type": "GATEWAY_STOPPED",
                "message": "Gateway หยุดทำงาน"
            })

        # Check heartbeat stale
        if status.heartbeat_stale and status.gateway_status != 'stopped':
            issues_found.append({
                "type": "GATEWAY_ERROR",
                "message": "Gateway ไม่ตอบสนอง (Heartbeat หยุด)"
            })

        # Send alerts for each issue
        hostname = socket_module.gethostname()
        for issue in issues_found:
            success = await line_notify_service.send_alert(
                process_name=process_name,
                alert_type=issue["type"],
                message=issue["message"],
                hostname=hostname,
                hospital_name=None  # Will be filled from monitored process if available
            )
            if success:
                alerts_sent += 1

        return {
            "success": True,
            "process_name": process_name,
            "issues_found": len(issues_found),
            "alerts_sent": alerts_sent,
            "issues": issues_found,
            "gateway_status": status.gateway_status,
            "hosxp_db_status": status.hosxp_db_status,
            "gateway_db_status": status.gateway_db_status
        }

    except Exception as e:
        logger.error(f"Error checking BMS and sending alert: {e}")
        return {"success": False, "message": str(e), "alerts_sent": 0}


@app.post("/api/line-oa/bms/send-alert")
async def send_bms_alert(request: BMSAlertRequest):
    """Send custom BMS alert to LINE

    Args:
        request: BMSAlertRequest with process_name, alert_type, message, etc.

    Alert types:
    - DB_DISCONNECTED: Database connection lost
    - GATEWAY_STOPPED: Gateway process stopped
    - GATEWAY_ERROR: Gateway error or not responding
    - GATEWAY_STARTED: Gateway started (green alert)
    - CUSTOM: Custom message
    """
    if not line_notify_service.is_configured():
        return {"success": False, "message": "LINE OA ยังไม่ได้ตั้งค่า"}

    try:
        # Default message based on alert type
        message = request.message
        if not message:
            alert_messages = {
                "DB_DISCONNECTED": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้",
                "GATEWAY_STOPPED": "Gateway หยุดทำงาน",
                "GATEWAY_ERROR": "Gateway พบข้อผิดพลาด",
                "GATEWAY_STARTED": "Gateway เริ่มทำงานแล้ว",
                "CUSTOM": "แจ้งเตือนจาก BMS Gateway"
            }
            message = alert_messages.get(request.alert_type, request.alert_type)

        hostname = request.hostname or socket_module.gethostname()

        success = await line_notify_service.send_alert(
            process_name=request.process_name,
            alert_type=request.alert_type,
            message=message,
            hostname=hostname,
            hospital_name=request.hospital_name
        )

        if success:
            logger.info(f"BMS alert sent: {request.alert_type} - {message}")
            return {"success": True, "message": "ส่งแจ้งเตือนสำเร็จ"}
        else:
            return {"success": False, "message": "ไม่สามารถส่งแจ้งเตือนได้"}

    except Exception as e:
        logger.error(f"Error sending BMS alert: {e}")
        return {"success": False, "message": str(e)}


@app.post("/api/line-oa/bms/send-db-alert")
async def send_bms_db_alert(
    process_name: str = "BMSHOSxPLISServices",
    db_type: str = "hosxp",  # hosxp or gateway
    error_message: Optional[str] = None
):
    """Send BMS Database connection alert to LINE

    Args:
        process_name: BMS process name
        db_type: Database type (hosxp or gateway)
        error_message: Optional error message
    """
    if not line_notify_service.is_configured():
        return {"success": False, "message": "LINE OA ยังไม่ได้ตั้งค่า"}

    try:
        db_name = "HOSxP" if db_type.lower() == "hosxp" else "Gateway"
        message = error_message or f"{db_name} DB ไม่สามารถเชื่อมต่อได้"

        hostname = socket_module.gethostname()

        success = await line_notify_service.send_alert(
            process_name=process_name,
            alert_type="DB_DISCONNECTED",
            message=message,
            hostname=hostname
        )

        return {
            "success": success,
            "message": "ส่งแจ้งเตือนสำเร็จ" if success else "ไม่สามารถส่งแจ้งเตือนได้",
            "db_type": db_type
        }

    except Exception as e:
        logger.error(f"Error sending BMS DB alert: {e}")
        return {"success": False, "message": str(e)}


@app.post("/api/line-oa/bms/send-gateway-alert")
async def send_bms_gateway_alert(
    process_name: str = "BMSHOSxPLISServices",
    status: str = "stopped",  # stopped, started, error
    message: Optional[str] = None
):
    """Send BMS Gateway status alert to LINE

    Args:
        process_name: BMS process name
        status: Gateway status (stopped, started, error)
        message: Optional custom message
    """
    if not line_notify_service.is_configured():
        return {"success": False, "message": "LINE OA ยังไม่ได้ตั้งค่า"}

    try:
        status_messages = {
            "stopped": ("GATEWAY_STOPPED", "Gateway หยุดทำงาน"),
            "started": ("GATEWAY_STARTED", "Gateway เริ่มทำงานแล้ว"),
            "error": ("GATEWAY_ERROR", "Gateway พบข้อผิดพลาด")
        }

        alert_type, default_message = status_messages.get(
            status.lower(),
            ("GATEWAY_ERROR", f"Gateway status: {status}")
        )

        hostname = socket_module.gethostname()

        success = await line_notify_service.send_alert(
            process_name=process_name,
            alert_type=alert_type,
            message=message or default_message,
            hostname=hostname
        )

        return {
            "success": success,
            "message": "ส่งแจ้งเตือนสำเร็จ" if success else "ไม่สามารถส่งแจ้งเตือนได้",
            "gateway_status": status
        }

    except Exception as e:
        logger.error(f"Error sending BMS Gateway alert: {e}")
        return {"success": False, "message": str(e)}


# ============================================================
# Clear Cache API (for cleaning old/orphaned data)
# ============================================================

@app.post("/api/clear-cache")
async def clear_cache():
    """Clear local cache data only (logs and local config).
    This does NOT delete any data from Supabase - only clears local files.
    """
    try:
        # Get list of currently monitored process names
        current_processes = list(monitor.monitored_processes.keys())

        results = {
            "logs_cleared": False,
            "local_metadata_cleaned": 0,
            "local_cache_cleared": False,
            "kept_processes": current_processes
        }

        # 1. Clear old log files (local only)
        try:
            log_paths = [
                os.path.join(os.environ.get('LOCALAPPDATA', ''), 'MonitorApp', 'logs'),
                os.path.join(os.path.dirname(__file__), 'logs')
            ]
            for log_dir in log_paths:
                if os.path.exists(log_dir):
                    for log_file in os.listdir(log_dir):
                        if log_file.endswith('.log'):
                            log_path = os.path.join(log_dir, log_file)
                            try:
                                # Truncate log file instead of delete (keep file handle valid)
                                with open(log_path, 'w') as f:
                                    f.write('')
                                results["logs_cleared"] = True
                            except Exception as e:
                                logger.warning(f"Could not clear log {log_path}: {e}")
        except Exception as e:
            logger.warning(f"Error clearing logs: {e}")

        # 2. Clear local config cache for processes not in current list (local only - NO Supabase)
        try:
            config_dir = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'MonitorApp', 'config')
            if os.path.exists(config_dir):
                metadata_file = os.path.join(config_dir, 'process_metadata.json')
                if os.path.exists(metadata_file):
                    import json
                    with open(metadata_file, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)

                    # Filter out processes not in current list
                    original_count = len(metadata)
                    filtered_metadata = {k: v for k, v in metadata.items() if k in current_processes}
                    removed_count = original_count - len(filtered_metadata)

                    with open(metadata_file, 'w', encoding='utf-8') as f:
                        json.dump(filtered_metadata, f, indent=2, ensure_ascii=False)

                    results["local_metadata_cleaned"] = removed_count
                    results["local_cache_cleared"] = True
                    logger.info(f"Cleaned local metadata: removed {removed_count}, kept {len(filtered_metadata)} processes")
        except Exception as e:
            logger.warning(f"Error clearing local cache: {e}")

        # 3. Clear alert settings cache for removed processes (local only)
        try:
            config_dir = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'MonitorApp', 'config')
            if os.path.exists(config_dir):
                alert_file = os.path.join(config_dir, 'alert_settings.json')
                if os.path.exists(alert_file):
                    # Just log that we checked it, don't modify alert settings
                    logger.info("Alert settings file exists, keeping intact")
        except Exception as e:
            logger.warning(f"Error checking alert settings: {e}")

        logger.info(f"Local cache cleared: {results}")
        return {
            "success": True,
            "message": "Local cache cleared successfully (Supabase data preserved)",
            "details": results
        }

    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================
# Web Push Notification API
# ============================================================

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: Optional[str] = None
    hospital_code: Optional[str] = None


@app.post("/api/push/subscribe")
async def subscribe_push(subscription: PushSubscriptionRequest):
    """Subscribe to push notifications"""
    push_svc = get_push_service()
    if not push_svc:
        raise HTTPException(status_code=503, detail="Push service not available")

    try:
        sub_id = await push_svc.subscribe(
            endpoint=subscription.endpoint,
            p256dh=subscription.p256dh,
            auth=subscription.auth,
            user_agent=subscription.user_agent,
            hospital_code=subscription.hospital_code
        )

        if sub_id:
            return {"success": True, "subscription_id": sub_id}
        else:
            return {"success": False, "message": "Failed to subscribe"}

    except Exception as e:
        logger.error(f"Push subscribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/push/unsubscribe")
async def unsubscribe_push(data: dict):
    """Unsubscribe from push notifications"""
    push_svc = get_push_service()
    if not push_svc:
        raise HTTPException(status_code=503, detail="Push service not available")

    endpoint = data.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint is required")

    try:
        success = await push_svc.unsubscribe(endpoint)
        return {"success": success}
    except Exception as e:
        logger.error(f"Push unsubscribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/push/test")
async def test_push_notification(data: dict):
    """Send a test push notification"""
    push_svc = get_push_service()
    if not push_svc:
        raise HTTPException(status_code=503, detail="Push service not available")

    try:
        # Get subscription from request or send to all
        subscription = data.get("subscription")

        if subscription:
            # Send to specific subscription
            success = await push_svc.send_notification(
                subscription=subscription,
                title="ทดสอบการแจ้งเตือน",
                body="Push Notification ทำงานปกติ!",
                tag="test-notification"
            )
            return {"success": success, "sent_to": 1 if success else 0}
        else:
            # Send test alert to all subscribers
            sent = await push_svc.send_alert_notification(
                alert_type="TEST",
                process_name="MonitorApp",
                message="ทดสอบการแจ้งเตือน Push Notification",
                hospital_name="Test Hospital"
            )
            return {"success": sent > 0, "sent_to": sent}

    except Exception as e:
        logger.error(f"Push test error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Serve Frontend Static Files (must be AFTER all API routes)
# ============================================================

# Get frontend dist path (relative to backend folder)
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

# Mount static files if frontend is built
if FRONTEND_DIST.exists():
    # Serve static assets
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    # Serve index.html for root and all non-API routes (SPA support)
    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't serve frontend for API routes
        if full_path.startswith("api/") or full_path.startswith("ws"):
            raise HTTPException(status_code=404, detail="Not found")

        # Try to serve static file
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))

        # Fallback to index.html for SPA routing
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    logger.info(f"Frontend static files mounted from {FRONTEND_DIST}")
else:
    logger.warning(f"Frontend dist not found at {FRONTEND_DIST}. Run 'npm run build' in frontend folder.")

    @app.get("/")
    async def no_frontend():
        return HTMLResponse(content="""
        <html>
        <head><title>MonitorApp API</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>MonitorApp API Server</h1>
            <p>Backend is running on port {port}</p>
            <p><strong>Frontend not built.</strong></p>
            <p>To build frontend:</p>
            <pre>cd frontend && npm install && npm run build</pre>
            <p>Or run frontend dev server:</p>
            <pre>cd frontend && npm run dev</pre>
            <hr>
            <p><a href="/docs">API Documentation</a></p>
        </body>
        </html>
        """.format(port=settings.port), status_code=200)


if __name__ == "__main__":
    import uvicorn
    uvicorn_kwargs = {
        "app": "main:app",
        "host": settings.host,
        "port": settings.port,
        "reload": False,
        "log_level": settings.log_level.lower(),
    }
    # Enable HTTPS if SSL cert/key configured
    if settings.ssl_certfile and settings.ssl_keyfile:
        uvicorn_kwargs["ssl_certfile"] = settings.ssl_certfile
        uvicorn_kwargs["ssl_keyfile"] = settings.ssl_keyfile
        logger.info("Starting with HTTPS/TLS enabled")
    uvicorn.run(**uvicorn_kwargs)
