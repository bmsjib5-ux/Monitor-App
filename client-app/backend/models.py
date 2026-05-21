from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime

class RestartScheduleInfo(BaseModel):
    """Restart schedule info for API response"""
    type: Literal['none', 'interval', 'daily'] = 'none'
    intervalMinutes: Optional[int] = None
    intervalSeconds: Optional[int] = None
    dailyTime: Optional[str] = None
    enabled: bool = False

class AutoStartScheduleInfo(BaseModel):
    """Auto-start schedule info for API response (start when process is stopped)"""
    type: Literal['none', 'interval', 'daily'] = 'none'
    intervalMinutes: Optional[int] = None
    intervalSeconds: Optional[int] = None
    dailyTime: Optional[str] = None
    enabled: bool = False

class WindowInfo(BaseModel):
    """Parsed window title info for BMS processes"""
    version: Optional[str] = None
    hospital_code: Optional[str] = None
    hospital_name: Optional[str] = None
    company: Optional[str] = None
    window_title: Optional[str] = None

class ProcessInfo(BaseModel):
    name: str
    pid: int
    status: str
    cpu_percent: float
    memory_mb: float
    memory_percent: float
    disk_read_mb: float
    disk_write_mb: float
    net_sent_mb: float
    net_recv_mb: float
    uptime: str
    uptime_seconds: Optional[float] = None
    create_time: Optional[float] = None
    hospital_code: Optional[str] = None
    hospital_name: Optional[str] = None
    company_name: Optional[str] = None
    install_date: Optional[str] = None          # YYYY-MM-DD
    warranty_expiry_date: Optional[str] = None  # YYYY-MM-DD
    program_path: Optional[str] = None
    restart_schedule: Optional[RestartScheduleInfo] = None
    auto_start_schedule: Optional[AutoStartScheduleInfo] = None
    window_title: Optional[str] = None
    window_info: Optional[WindowInfo] = None
    bms_status: Optional['BMSGatewayStatus'] = None

class ProcessAdd(BaseModel):
    name: str

class ProcessMetrics(BaseModel):
    timestamp: str
    name: str
    pid: int
    cpu_percent: float
    memory_mb: float
    memory_percent: float
    disk_read_mb: float
    disk_write_mb: float
    net_sent_mb: float
    net_recv_mb: float

class Alert(BaseModel):
    timestamp: str
    process_name: str
    alert_type: str
    message: str
    value: float
    threshold: Optional[float] = None
    hospital_code: Optional[str] = None
    hospital_name: Optional[str] = None
    hostname: Optional[str] = None

class ThresholdConfig(BaseModel):
    cpu_threshold: float = 80.0
    ram_threshold: float = 80.0
    disk_io_threshold: float = 100.0
    network_threshold: float = 50.0

class ExportRequest(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    process_names: Optional[List[str]] = None

class ProcessControlRequest(BaseModel):
    process_name: str
    executable_path: Optional[str] = None
    force: Optional[bool] = False

class ProcessControlResponse(BaseModel):
    success: bool
    message: str
    pid: Optional[int] = None

class ProcessStartRequest(BaseModel):
    """Request to start a process"""
    pid: Optional[int] = None
    hostname: Optional[str] = None
    hospital_code: Optional[str] = None
    executable_path: Optional[str] = None

class ProcessStopRequest(BaseModel):
    """Request to stop a process"""
    pid: Optional[int] = None
    hostname: Optional[str] = None
    hospital_code: Optional[str] = None
    force: Optional[bool] = False

class ProcessRestartRequest(BaseModel):
    """Request to restart a process"""
    pid: Optional[int] = None
    hostname: Optional[str] = None
    hospital_code: Optional[str] = None
    executable_path: Optional[str] = None
    force: Optional[bool] = False

class ProcessDeleteRequest(BaseModel):
    """Request to delete a process from monitoring"""
    hospital_code: Optional[str] = None
    pid: Optional[int] = None
    hostname: Optional[str] = None

class RestartSchedule(BaseModel):
    """Restart schedule configuration"""
    type: Literal['none', 'interval', 'daily'] = 'none'
    intervalMinutes: Optional[int] = None
    intervalSeconds: Optional[int] = None
    dailyTime: Optional[str] = None  # HH:mm format
    enabled: bool = False

class AutoStartSchedule(BaseModel):
    """Auto-start schedule configuration (start when process is stopped)"""
    type: Literal['none', 'interval', 'daily'] = 'none'
    intervalMinutes: Optional[int] = None
    intervalSeconds: Optional[int] = None
    dailyTime: Optional[str] = None  # HH:mm format
    enabled: bool = False

class ProcessMetadataUpdate(BaseModel):
    """Update process metadata (hospital code, name and program path)"""
    pid: Optional[int] = None
    hostname: Optional[str] = None
    hospital_code: Optional[str] = None
    hospital_name: Optional[str] = None
    company_name: Optional[str] = None
    install_date: Optional[str] = None          # YYYY-MM-DD
    warranty_expiry_date: Optional[str] = None  # YYYY-MM-DD
    program_path: Optional[str] = None
    is_edit: Optional[bool] = False  # True for Edit, False for Add
    restart_schedule: Optional[RestartSchedule] = None
    auto_start_schedule: Optional[AutoStartSchedule] = None

# Online Monitoring Models
class HostInfo(BaseModel):
    """Information about a monitored host/agent"""
    host_id: str
    hostname: str
    ip_address: Optional[str] = None
    os_type: str = "Windows"
    agent_version: str = "1.0.0"
    status: str = "online"  # online, offline, error
    last_seen: Optional[str] = None
    api_key: Optional[str] = None

class HostRegister(BaseModel):
    """Request to register a new host/agent"""
    hostname: str
    ip_address: Optional[str] = None
    os_type: str = "Windows"
    agent_version: str = "1.0.0"

class HostProcessInfo(BaseModel):
    """Process info with host context"""
    host_id: str
    hostname: str
    name: str
    pid: int
    status: str
    cpu_percent: float
    memory_mb: float
    memory_percent: float
    disk_read_mb: float
    disk_write_mb: float
    net_sent_mb: float
    net_recv_mb: float
    uptime: str
    create_time: Optional[float] = None

class AgentHeartbeat(BaseModel):
    """Heartbeat message from agent"""
    host_id: str
    timestamp: str
    status: str = "online"
    process_count: int = 0

class AlertSettings(BaseModel):
    """Alert settings configuration"""
    cpuAlertEnabled: bool = True
    ramAlertEnabled: bool = True
    diskIoAlertEnabled: bool = True
    networkAlertEnabled: bool = True
    processStoppedAlertEnabled: bool = True
    cpuThreshold: float = 80.0
    ramThreshold: float = 80.0
    diskIoThreshold: float = 100.0
    networkThreshold: float = 50.0
    processStoppedMinutes: int = 5
    processStoppedSeconds: int = 0


# BMS Gateway Status Models
class BMSGatewayStatus(BaseModel):
    """Status of BMS HOSxP LIS Gateway from log files"""
    process_name: str
    log_path: str

    # Gateway status
    gateway_status: Literal['running', 'stopped', 'unknown'] = 'unknown'
    gateway_last_event: Optional[str] = None
    gateway_last_event_time: Optional[str] = None

    # Heartbeat
    last_heartbeat: Optional[str] = None
    heartbeat_stale: bool = False

    # DB Connection status
    hosxp_db_status: Literal['connected', 'disconnected', 'unknown'] = 'unknown'
    hosxp_db_host: Optional[str] = None
    hosxp_db_last_error: Optional[str] = None

    gateway_db_status: Literal['connected', 'disconnected', 'unknown'] = 'unknown'
    gateway_db_host: Optional[str] = None
    gateway_db_last_error: Optional[str] = None

    # Thread info
    active_threads: int = 0
    thread_errors: List[str] = []

    # Timestamps
    last_check: Optional[str] = None
    last_error_time: Optional[str] = None
