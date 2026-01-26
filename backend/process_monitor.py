import psutil
import time
import subprocess
import os
import json
import asyncio
import ctypes
from ctypes import wintypes
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from collections import defaultdict, deque
from models import ProcessInfo, ProcessMetrics, Alert, WindowInfo, BMSGatewayStatus
from config import settings
from bms_log_monitor import BMSLogMonitor, is_bms_process
import logging

logger = logging.getLogger(__name__)

# LINE Notify service will be imported dynamically to avoid circular imports
_line_notify_service = None

def get_line_notify_service():
    """Get LINE Notify service instance (lazy import to avoid circular imports)"""
    global _line_notify_service
    if _line_notify_service is None:
        try:
            from line_notify import line_notify_service
            _line_notify_service = line_notify_service
        except ImportError:
            logger.warning("LINE Notify service not available")
    return _line_notify_service

def send_line_notification_async(coro):
    """Helper to run async LINE notification in background"""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(coro)
        else:
            loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop, create new one
        asyncio.run(coro)

# Thailand timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

def get_thai_iso() -> str:
    """Get current datetime as ISO string in Thai timezone"""
    return datetime.now(THAI_TZ).isoformat()

def get_window_titles_for_pid(pid: int) -> List[str]:
    """Get all window titles for a given process ID using Windows API"""
    titles = []

    if os.name != 'nt':
        return titles

    try:
        # Windows API functions
        user32 = ctypes.windll.user32

        # Define callback type
        EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

        def enum_windows_callback(hwnd, lparam):
            # Get the process ID for this window
            window_pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))

            if window_pid.value == pid:
                # Check if window is visible
                if user32.IsWindowVisible(hwnd):
                    # Get window title length
                    length = user32.GetWindowTextLengthW(hwnd)
                    if length > 0:
                        # Get window title
                        buffer = ctypes.create_unicode_buffer(length + 1)
                        user32.GetWindowTextW(hwnd, buffer, length + 1)
                        if buffer.value:
                            titles.append(buffer.value)
            return True

        # Enumerate all windows
        user32.EnumWindows(EnumWindowsProc(enum_windows_callback), 0)

    except Exception as e:
        logger.debug(f"Error getting window titles for PID {pid}: {e}")

    return titles

def parse_bms_window_title(title: str) -> Optional[WindowInfo]:
    """Parse BMS HOSxP window title to extract info

    Supported formats:
    1. "BMS-HOSxP PACs Service HL7 Gateway : 2.68.04.22 : 11304 รพ.กระทุ่มแบน"
    2. "BMS-HOSxP XE 4.0 [PACs Service]"
    3. "BMS-HOSxP PACs Service HL7 Gateway : 2.68.04.22 : 11304 รพ.XXX"
    4. "BMSHOSxP4 LIS HL7 Gateway 1.68.3.21 - 11304 รพ.กระทุ่มแบน Company Inter"
    5. "HOSxP Blood Bank HL7 Gateway - 10710 รพ.สกลนคร Company AI"
    6. "HOSxP Cobas HL7 Gateway V 68.12.23"
    7. "BMS Drug Counting Machine Gateway" (no version/hospital in title)
    """
    if not title:
        return None

    # Check for BMS or HOSxP in title (case insensitive)
    title_upper = title.upper()
    if 'BMS' not in title_upper and 'HOSXP' not in title_upper:
        return None

    try:
        version = None
        hospital_code = None
        hospital_name = None
        company = None

        import re

        # Extract version - multiple patterns
        # Pattern 1: x.xx.xx.xx (e.g., 2.68.04.22)
        version_match = re.search(r'(\d+\.\d+\.\d+\.\d+)', title)
        if version_match:
            version = version_match.group(1)
        else:
            # Pattern 2: XE x.x (e.g., XE 4.0)
            xe_match = re.search(r'XE\s*(\d+\.\d+)', title, re.IGNORECASE)
            if xe_match:
                version = f"XE {xe_match.group(1)}"
            else:
                # Pattern 3: V x.x.x (e.g., V 68.12.23)
                v_match = re.search(r'\bV\s*(\d+\.\d+\.\d+)\b', title, re.IGNORECASE)
                if v_match:
                    version = v_match.group(1)
                else:
                    # Pattern 4: Just x.x.x or x.x
                    simple_ver = re.search(r'\b(\d+\.\d+(?:\.\d+)?)\b', title)
                    if simple_ver:
                        version = simple_ver.group(1)

        # Extract hospital code (5 digits after colon/dash or standalone)
        code_match = re.search(r'[-:]\s*(\d{5})\s', title)
        if not code_match:
            code_match = re.search(r'\s(\d{5})\s', title)
        if code_match:
            hospital_code = code_match.group(1)

        # Extract hospital name and company (after hospital code)
        # Format: "11304 รพ.กระทุ่มแบน Company Inter" -> hospital_name="รพ.กระทุ่มแบน", company="Inter"
        name_match = re.search(r'\d{5}\s+(.+)$', title)
        if name_match:
            full_name = name_match.group(1).strip()

            # Check if "Company" keyword exists - split hospital name and company
            company_match = re.search(r'^(.+?)\s+Company\s+(.+)$', full_name, re.IGNORECASE)
            if company_match:
                hospital_name = company_match.group(1).strip()
                company = company_match.group(2).strip()
            else:
                hospital_name = full_name

        # Return WindowInfo if we found any data (version is most important)
        if version or hospital_code or hospital_name:
            return WindowInfo(
                version=version,
                hospital_code=hospital_code,
                hospital_name=hospital_name,
                company=company,
                window_title=title
            )

        # Even if no parsed data, return with just window_title for BMS processes
        return WindowInfo(window_title=title)

    except Exception as e:
        logger.debug(f"Error parsing window title '{title}': {e}")
        return None

# Path to store monitored processes list - use AppData on Windows to avoid permission issues
def get_data_path():
    """Get writable data path - uses AppData on Windows"""
    if os.name == 'nt':  # Windows
        app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        return os.path.join(app_data, 'MonitorApp', 'data', 'monitored_processes.json')
    else:
        return os.path.join(os.path.dirname(__file__), "data", "monitored_processes.json")

MONITORED_PROCESSES_FILE = get_data_path()

class ProcessMonitor:
    def __init__(self):
        self.monitored_processes: Dict[str, Dict] = {}
        self.process_history: Dict[str, deque] = defaultdict(lambda: deque(maxlen=settings.history_length))
        self.alerts: deque = deque(maxlen=100)
        self.thresholds = {
            "cpu": settings.cpu_threshold,
            "ram": settings.ram_threshold,
            "disk_io": settings.disk_io_threshold,
            "network": settings.network_threshold
        }
        # Store previous metrics for delta calculations
        self.prev_metrics: Dict[int, Dict] = {}
        # Track previous process status for detecting stop events
        self.prev_process_status: Dict[str, str] = {}
        # Track when process stopped for duration-based alerts
        self.process_stopped_time: Dict[str, float] = {}
        # Track if we already sent stopped alert for this process
        self.process_stopped_alerted: Dict[str, bool] = {}

        # Alert settings (enabled/disabled flags and thresholds)
        self.alert_settings = {
            "cpu_alert_enabled": True,
            "ram_alert_enabled": True,
            "disk_io_alert_enabled": True,
            "network_alert_enabled": True,
            "process_stopped_alert_enabled": True,
            "process_stopped_minutes": 0,
            "process_stopped_seconds": 0
        }

        # BMS Log Monitors - track BMS Gateway status from log files
        self.bms_monitors: Dict[str, BMSLogMonitor] = {}
        # Track previous BMS DB status for alerting
        self.prev_bms_hosxp_status: Dict[str, str] = {}
        self.prev_bms_gateway_status: Dict[str, str] = {}

        # Load saved processes on startup
        self._load_saved_processes()

    def _ensure_data_dir(self):
        """Ensure data directory exists"""
        data_dir = os.path.dirname(MONITORED_PROCESSES_FILE)
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)

    def _save_processes_list(self):
        """Save current monitored process names to file"""
        try:
            self._ensure_data_dir()
            process_names = list(self.monitored_processes.keys())
            with open(MONITORED_PROCESSES_FILE, 'w', encoding='utf-8') as f:
                json.dump({"processes": process_names}, f, ensure_ascii=False, indent=2)
            logger.info(f"Saved {len(process_names)} processes to file")
        except Exception as e:
            logger.error(f"Error saving processes list: {e}")

    def _load_saved_processes(self):
        """Load and add previously monitored processes"""
        try:
            if os.path.exists(MONITORED_PROCESSES_FILE):
                with open(MONITORED_PROCESSES_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    process_names = data.get("processes", [])

                logger.info(f"Loading {len(process_names)} saved processes...")
                for process_name in process_names:
                    # Use save=False to avoid saving while loading
                    if self.add_process(process_name, save=False):
                        logger.info(f"Restored monitoring for: {process_name}")
                    else:
                        logger.warning(f"Could not restore: {process_name} (process may not be running)")
        except Exception as e:
            logger.error(f"Error loading saved processes: {e}")

    def add_process(self, process_name: str, save: bool = True) -> bool:
        """Add a process to monitor by name"""
        try:
            # Find process by name
            found = False
            for proc in psutil.process_iter(['name', 'pid']):
                try:
                    if proc.info['name'].lower() == process_name.lower():
                        pid = proc.info['pid']
                        if pid not in self.monitored_processes.values():
                            self.monitored_processes[process_name] = {
                                'pid': pid,
                                'process': proc,
                                'create_time': proc.create_time()
                            }
                            found = True
                            logger.info(f"Added process {process_name} (PID: {pid}) to monitoring")
                            # Save to file when added
                            if save:
                                self._save_processes_list()
                            break
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            return found
        except Exception as e:
            logger.error(f"Error adding process {process_name}: {e}")
            return False

    def remove_process(self, process_name: str, pid: Optional[int] = None) -> bool:
        """Remove a process from monitoring by name and optionally pid"""
        if process_name in self.monitored_processes:
            stored_pid = self.monitored_processes[process_name]['pid']
            # If pid is specified, only remove if it matches
            if pid is not None and stored_pid != pid:
                logger.info(f"PID mismatch for {process_name}: stored={stored_pid}, requested={pid}")
                return False
            del self.monitored_processes[process_name]
            if stored_pid in self.prev_metrics:
                del self.prev_metrics[stored_pid]
            if process_name in self.process_history:
                del self.process_history[process_name]
            logger.info(f"Removed process {process_name} (PID: {stored_pid}) from monitoring")
            # Save to file when removed
            self._save_processes_list()
            return True
        return False

    def get_process_info(self, process_name: str) -> Optional[ProcessInfo]:
        """Get current information for a monitored process"""
        if process_name not in self.monitored_processes:
            return None

        try:
            proc_data = self.monitored_processes[process_name]
            proc = proc_data['process']
            pid = proc_data['pid']

            # Refresh process info
            if not proc.is_running():
                # Process stopped, try to find it again
                if not self.add_process(process_name):
                    # Check if this is a new stop event (status changed from running to stopped)
                    prev_status = self.prev_process_status.get(process_name, "running")
                    if prev_status == "running":
                        logger.warning(f"Process {process_name} (PID: {pid}) has stopped!")

                    # Update status tracking
                    self.prev_process_status[process_name] = "stopped"

                    # Always call this while stopped - it handles timing internally
                    self._create_process_stopped_alert(process_name, pid)

                    return ProcessInfo(
                        name=process_name,
                        pid=pid,
                        status="stopped",
                        cpu_percent=0.0,
                        memory_mb=0.0,
                        memory_percent=0.0,
                        disk_read_mb=0.0,
                        disk_write_mb=0.0,
                        net_sent_mb=0.0,
                        net_recv_mb=0.0,
                        uptime="Not Running"
                    )
                proc = self.monitored_processes[process_name]['process']
                pid = self.monitored_processes[process_name]['pid']
                # Process restarted - update status
                if self.prev_process_status.get(process_name) == "stopped":
                    self._create_process_started_alert(process_name, pid)
                    logger.info(f"Process {process_name} (PID: {pid}) has restarted!")

            # Get CPU percentage
            cpu_percent = proc.cpu_percent(interval=0.1)

            # Get memory info
            mem_info = proc.memory_info()
            memory_mb = mem_info.rss / (1024 * 1024)
            memory_percent = proc.memory_percent()

            # Get disk I/O
            disk_read_mb = 0.0
            disk_write_mb = 0.0
            try:
                io_counters = proc.io_counters()
                if pid in self.prev_metrics and 'io_counters' in self.prev_metrics[pid]:
                    prev_io = self.prev_metrics[pid]['io_counters']
                    prev_time = self.prev_metrics[pid]['time']
                    time_delta = time.time() - prev_time

                    if time_delta > 0:
                        disk_read_mb = (io_counters.read_bytes - prev_io.read_bytes) / (1024 * 1024) / time_delta
                        disk_write_mb = (io_counters.write_bytes - prev_io.write_bytes) / (1024 * 1024) / time_delta

                # Store current metrics for next delta
                if pid not in self.prev_metrics:
                    self.prev_metrics[pid] = {}
                self.prev_metrics[pid]['io_counters'] = io_counters
                self.prev_metrics[pid]['time'] = time.time()
            except (psutil.AccessDenied, AttributeError):
                pass

            # Get network I/O (process-specific network stats not available in psutil)
            # Using system-wide as approximation
            net_sent_mb = 0.0
            net_recv_mb = 0.0
            try:
                # For now, we'll estimate based on system network usage
                # A more accurate approach would require packet sniffing or Windows-specific APIs
                net_io = psutil.net_io_counters()
                if pid in self.prev_metrics and 'net_io' in self.prev_metrics[pid]:
                    prev_net = self.prev_metrics[pid]['net_io']
                    prev_time = self.prev_metrics[pid].get('net_time', time.time())
                    time_delta = time.time() - prev_time

                    if time_delta > 0:
                        # This is system-wide, not process-specific
                        net_sent_mb = (net_io.bytes_sent - prev_net.bytes_sent) / (1024 * 1024) / time_delta
                        net_recv_mb = (net_io.bytes_recv - prev_net.bytes_recv) / (1024 * 1024) / time_delta

                self.prev_metrics[pid]['net_io'] = net_io
                self.prev_metrics[pid]['net_time'] = time.time()
            except:
                pass

            # Calculate uptime
            create_time = proc_data['create_time']
            uptime_seconds = time.time() - create_time
            uptime = str(timedelta(seconds=int(uptime_seconds)))

            # Get window title info (for BMS processes)
            window_title = None
            window_info = None
            try:
                titles = get_window_titles_for_pid(pid)
                if titles:
                    window_title = titles[0]  # Use first visible window
                    logger.debug(f"Got window title for {process_name} (PID {pid}): {window_title}")
                    # Try to parse BMS-specific info
                    window_info = parse_bms_window_title(window_title)
                    if window_info:
                        logger.debug(f"Parsed window_info for {process_name}: version={window_info.version}")
            except Exception as e:
                logger.warning(f"Could not get window title for {process_name}: {e}")

            # Get BMS status from log files (if this is a BMS process)
            bms_status = self.get_bms_status(process_name, window_title)

            process_info = ProcessInfo(
                name=process_name,
                pid=pid,
                status=proc.status(),
                cpu_percent=round(cpu_percent, 2),
                memory_mb=round(memory_mb, 2),
                memory_percent=round(memory_percent, 2),
                disk_read_mb=round(disk_read_mb, 2),
                disk_write_mb=round(disk_write_mb, 2),
                net_sent_mb=round(net_sent_mb, 2),
                net_recv_mb=round(net_recv_mb, 2),
                uptime=uptime,
                uptime_seconds=int(uptime_seconds),
                create_time=create_time,
                window_title=window_title,
                window_info=window_info,
                bms_status=bms_status
            )

            # Update status tracking - process is running
            self.prev_process_status[process_name] = "running"

            # Check thresholds and create alerts
            self._check_thresholds(process_info)

            # Add to history
            metrics = ProcessMetrics(
                timestamp=get_thai_iso(),
                name=process_name,
                pid=pid,
                cpu_percent=process_info.cpu_percent,
                memory_mb=process_info.memory_mb,
                memory_percent=process_info.memory_percent,
                disk_read_mb=process_info.disk_read_mb,
                disk_write_mb=process_info.disk_write_mb,
                net_sent_mb=process_info.net_sent_mb,
                net_recv_mb=process_info.net_recv_mb
            )
            self.process_history[process_name].append(metrics)

            return process_info

        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.error(f"Error getting info for {process_name}: {e}")
            return None

    def _create_process_stopped_alert(self, process_name: str, pid: int):
        """Create alert when a process stops (with duration check)"""
        # Check if process stopped alert is enabled
        if not self.alert_settings.get("process_stopped_alert_enabled", True):
            return

        # Check if we already sent alert for this process
        if self.process_stopped_alerted.get(process_name, False):
            return

        # Get configured wait duration in seconds
        wait_minutes = self.alert_settings.get("process_stopped_minutes", 5)
        wait_seconds = self.alert_settings.get("process_stopped_seconds", 0)
        wait_duration = (wait_minutes * 60) + wait_seconds

        # Record when process stopped (if not already recorded)
        if process_name not in self.process_stopped_time:
            self.process_stopped_time[process_name] = time.time()
            logger.info(f"Process {process_name} stopped. Will alert after {wait_minutes}m {wait_seconds}s")
            return

        # Check if process has been stopped long enough
        stopped_duration = time.time() - self.process_stopped_time[process_name]
        if stopped_duration < wait_duration:
            remaining = wait_duration - stopped_duration
            logger.debug(f"Process {process_name} stopped for {stopped_duration:.0f}s, alert in {remaining:.0f}s")
            return

        # Create the alert
        timestamp = get_thai_iso()
        stopped_mins = int(stopped_duration // 60)
        stopped_secs = int(stopped_duration % 60)
        alert = Alert(
            timestamp=timestamp,
            process_name=process_name,
            alert_type="PROCESS_STOPPED",
            message=f"โปรแกรม {process_name} (PID: {pid}) หยุดทำงานแล้ว {stopped_mins} นาที {stopped_secs} วินาที!",
            value=stopped_duration,
            threshold=float(wait_duration)
        )
        self.alerts.append(alert)
        self.process_stopped_alerted[process_name] = True
        logger.warning(f"Alert created: Process {process_name} stopped for {stopped_mins}m {stopped_secs}s")

        # Send LINE notification
        line_service = get_line_notify_service()
        if line_service and line_service.is_configured():
            # Get process metadata for hospital info
            proc_data = self.monitored_processes.get(process_name, {})
            hostname = proc_data.get('hostname')
            hospital_name = proc_data.get('hospital_name')
            try:
                send_line_notification_async(
                    line_service.send_process_stopped_alert(
                        process_name=process_name,
                        hostname=hostname,
                        hospital_name=hospital_name,
                        stopped_duration_seconds=stopped_duration
                    )
                )
            except Exception as e:
                logger.error(f"Error sending LINE notification: {e}")

    def _create_process_started_alert(self, process_name: str, pid: int):
        """Create alert when a process starts/restarts"""
        # Reset stopped tracking when process starts
        if process_name in self.process_stopped_time:
            del self.process_stopped_time[process_name]
        if process_name in self.process_stopped_alerted:
            del self.process_stopped_alerted[process_name]

        timestamp = get_thai_iso()
        alert = Alert(
            timestamp=timestamp,
            process_name=process_name,
            alert_type="PROCESS_STARTED",
            message=f"โปรแกรม {process_name} (PID: {pid}) เริ่มทำงานแล้ว",
            value=0.0,
            threshold=0.0
        )
        self.alerts.append(alert)
        logger.info(f"Alert created: Process {process_name} started")

        # Send LINE notification
        line_service = get_line_notify_service()
        if line_service and line_service.is_configured():
            # Get process metadata for hospital info
            proc_data = self.monitored_processes.get(process_name, {})
            hostname = proc_data.get('hostname')
            hospital_name = proc_data.get('hospital_name')
            try:
                send_line_notification_async(
                    line_service.send_process_started_alert(
                        process_name=process_name,
                        hostname=hostname,
                        hospital_name=hospital_name
                    )
                )
            except Exception as e:
                logger.error(f"Error sending LINE notification: {e}")

    def _check_thresholds(self, process_info: ProcessInfo):
        """Check if process metrics exceed thresholds and create alerts"""
        timestamp = get_thai_iso()

        # Get process metadata for LINE notifications
        proc_data = self.monitored_processes.get(process_info.name, {})
        hostname = proc_data.get('hostname')
        hospital_name = proc_data.get('hospital_name')

        # Check CPU alert (if enabled)
        if self.alert_settings.get("cpu_alert_enabled", True):
            if process_info.cpu_percent > self.thresholds["cpu"]:
                alert = Alert(
                    timestamp=timestamp,
                    process_name=process_info.name,
                    alert_type="CPU",
                    message=f"CPU usage is {process_info.cpu_percent}% (threshold: {self.thresholds['cpu']}%)",
                    value=process_info.cpu_percent,
                    threshold=self.thresholds["cpu"]
                )
                self.alerts.append(alert)
                self._send_threshold_line_notification(
                    process_info.name, "CPU", process_info.cpu_percent,
                    self.thresholds["cpu"], hostname, hospital_name
                )

        # Check RAM alert (if enabled)
        if self.alert_settings.get("ram_alert_enabled", True):
            if process_info.memory_percent > self.thresholds["ram"]:
                alert = Alert(
                    timestamp=timestamp,
                    process_name=process_info.name,
                    alert_type="RAM",
                    message=f"RAM usage is {process_info.memory_percent}% (threshold: {self.thresholds['ram']}%)",
                    value=process_info.memory_percent,
                    threshold=self.thresholds["ram"]
                )
                self.alerts.append(alert)
                self._send_threshold_line_notification(
                    process_info.name, "RAM", process_info.memory_percent,
                    self.thresholds["ram"], hostname, hospital_name
                )

        # Check Disk I/O alert (if enabled)
        if self.alert_settings.get("disk_io_alert_enabled", True):
            total_disk_io = process_info.disk_read_mb + process_info.disk_write_mb
            if total_disk_io > self.thresholds["disk_io"]:
                alert = Alert(
                    timestamp=timestamp,
                    process_name=process_info.name,
                    alert_type="Disk I/O",
                    message=f"Disk I/O is {total_disk_io:.2f} MB/s (threshold: {self.thresholds['disk_io']} MB/s)",
                    value=total_disk_io,
                    threshold=self.thresholds["disk_io"]
                )
                self.alerts.append(alert)
                self._send_threshold_line_notification(
                    process_info.name, "Disk I/O", total_disk_io,
                    self.thresholds["disk_io"], hostname, hospital_name
                )

        # Check Network alert (if enabled)
        if self.alert_settings.get("network_alert_enabled", True):
            total_network = process_info.net_sent_mb + process_info.net_recv_mb
            if total_network > self.thresholds["network"]:
                alert = Alert(
                    timestamp=timestamp,
                    process_name=process_info.name,
                    alert_type="Network",
                    message=f"Network usage is {total_network:.2f} MB/s (threshold: {self.thresholds['network']} MB/s)",
                    value=total_network,
                    threshold=self.thresholds["network"]
                )
                self.alerts.append(alert)
                self._send_threshold_line_notification(
                    process_info.name, "Network", total_network,
                    self.thresholds["network"], hostname, hospital_name
                )

    def _send_threshold_line_notification(self, process_name: str, alert_type: str,
                                          value: float, threshold: float,
                                          hostname: str = None, hospital_name: str = None):
        """Send LINE notification for threshold alert

        NOTE: Currently disabled - LINE notifications are only sent for PROCESS_STOPPED and PROCESS_STARTED.
        Threshold alerts (CPU, RAM, Disk I/O, Network) are recorded but NOT sent to LINE.
        """
        # Disabled: Only send LINE for PROCESS_STOPPED and PROCESS_STARTED
        # line_service = get_line_notify_service()
        # if line_service and line_service.is_configured():
        #     try:
        #         send_line_notification_async(
        #             line_service.send_threshold_alert(
        #                 process_name=process_name,
        #                 alert_type=alert_type,
        #                 value=value,
        #                 threshold=threshold,
        #                 hostname=hostname,
        #                 hospital_name=hospital_name
        #             )
        #         )
        #     except Exception as e:
        #         logger.error(f"Error sending LINE threshold notification: {e}")
        pass

    def get_all_processes(self) -> List[ProcessInfo]:
        """Get information for all monitored processes"""
        processes = []
        for process_name in list(self.monitored_processes.keys()):
            info = self.get_process_info(process_name)
            if info:
                processes.append(info)
        return processes

    def get_process_history(self, process_name: str) -> List[ProcessMetrics]:
        """Get historical metrics for a process"""
        return list(self.process_history.get(process_name, []))

    def get_recent_alerts(self, limit: int = 20) -> List[Alert]:
        """Get recent alerts"""
        return list(self.alerts)[-limit:]

    def update_thresholds(self, thresholds: Dict[str, float]):
        """Update alert thresholds"""
        self.thresholds.update(thresholds)
        logger.info(f"Updated thresholds: {self.thresholds}")

    def update_alert_settings(self, settings_dict: Dict):
        """Update alert settings (enabled/disabled flags and durations)"""
        if "cpuAlertEnabled" in settings_dict:
            self.alert_settings["cpu_alert_enabled"] = settings_dict["cpuAlertEnabled"]
        if "ramAlertEnabled" in settings_dict:
            self.alert_settings["ram_alert_enabled"] = settings_dict["ramAlertEnabled"]
        if "diskIoAlertEnabled" in settings_dict:
            self.alert_settings["disk_io_alert_enabled"] = settings_dict["diskIoAlertEnabled"]
        if "networkAlertEnabled" in settings_dict:
            self.alert_settings["network_alert_enabled"] = settings_dict["networkAlertEnabled"]
        if "processStoppedAlertEnabled" in settings_dict:
            self.alert_settings["process_stopped_alert_enabled"] = settings_dict["processStoppedAlertEnabled"]
        if "processStoppedMinutes" in settings_dict:
            self.alert_settings["process_stopped_minutes"] = settings_dict["processStoppedMinutes"]
        if "processStoppedSeconds" in settings_dict:
            self.alert_settings["process_stopped_seconds"] = settings_dict["processStoppedSeconds"]
        logger.info(f"Updated alert settings: {self.alert_settings}")

    def list_available_processes(self) -> List[Dict[str, str]]:
        """List all running processes on the system"""
        processes = []
        for proc in psutil.process_iter(['name', 'pid']):
            try:
                processes.append({
                    'name': proc.info['name'],
                    'pid': proc.info['pid']
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return sorted(processes, key=lambda x: x['name'].lower())

    def stop_process(self, process_name: str, force: bool = False, pid: Optional[int] = None) -> Dict[str, any]:
        """Stop a monitored process

        Args:
            process_name: Name of the process to stop
            force: If True, force kill instead of graceful termination
            pid: Optional specific PID to stop (validates against monitored PID)
        """
        if process_name not in self.monitored_processes:
            return {"success": False, "message": f"Process {process_name} is not being monitored"}

        try:
            proc_data = self.monitored_processes[process_name]
            monitored_pid = proc_data['pid']
            proc = proc_data['process']

            # If specific PID is requested, validate it matches
            if pid is not None and pid != monitored_pid:
                # Try to find and stop the specific PID directly
                try:
                    target_proc = psutil.Process(pid)
                    target_name = target_proc.name().lower()
                    if target_name == process_name.lower() or process_name.lower() in target_name:
                        if force:
                            target_proc.kill()
                            logger.info(f"Force killed process {process_name} (PID: {pid})")
                            message = f"Process {process_name} (PID: {pid}) was force killed"
                        else:
                            target_proc.terminate()
                            logger.info(f"Terminated process {process_name} (PID: {pid})")
                            message = f"Process {process_name} (PID: {pid}) was terminated"
                        return {"success": True, "message": message, "pid": pid}
                    else:
                        return {"success": False, "message": f"PID {pid} does not match process {process_name}"}
                except psutil.NoSuchProcess:
                    return {"success": False, "message": f"Process with PID {pid} no longer exists"}
                except psutil.AccessDenied:
                    return {"success": False, "message": f"Access denied. Cannot stop process with PID {pid}. Try running as administrator."}

            if not proc.is_running():
                return {"success": False, "message": f"Process {process_name} is not running"}

            if force:
                # Force kill
                proc.kill()
                logger.info(f"Force killed process {process_name} (PID: {monitored_pid})")
                message = f"Process {process_name} was force killed"
            else:
                # Graceful termination
                proc.terminate()
                logger.info(f"Terminated process {process_name} (PID: {monitored_pid})")
                message = f"Process {process_name} was terminated"

            return {"success": True, "message": message, "pid": monitored_pid}

        except psutil.NoSuchProcess:
            return {"success": False, "message": f"Process {process_name} no longer exists"}
        except psutil.AccessDenied:
            return {"success": False, "message": f"Access denied. Cannot stop process {process_name}. Try running as administrator."}
        except Exception as e:
            logger.error(f"Error stopping process {process_name}: {e}")
            return {"success": False, "message": f"Error: {str(e)}"}

    def start_process(self, process_name: str, executable_path: Optional[str] = None) -> Dict[str, any]:
        """Start a process by executable path or name"""
        try:
            # Log the executable path for debugging
            if executable_path:
                logger.info(f"start_process called with executable_path: {executable_path}, exists: {os.path.exists(executable_path)}")
            else:
                logger.info(f"start_process called for {process_name} without executable_path")

            # If executable path is provided, use it
            if executable_path and os.path.exists(executable_path):
                if os.name == 'nt':  # Windows
                    process = subprocess.Popen([executable_path],
                                              shell=True,
                                              creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
                else:  # Unix-like
                    process = subprocess.Popen([executable_path])

                # Add to monitoring
                time.sleep(1)  # Wait for process to start
                if self.add_process(process_name):
                    logger.info(f"Started process {process_name} from {executable_path}")
                    return {"success": True, "message": f"Process {process_name} started successfully", "pid": process.pid}
                else:
                    return {"success": False, "message": f"Process started but could not be added to monitoring"}

            # If executable path provided but doesn't exist
            elif executable_path and not os.path.exists(executable_path):
                logger.warning(f"Executable path does not exist: {executable_path}")
                return {"success": False, "message": f"Executable path does not exist: {executable_path}"}

            # Try to find and start the process by name (Windows-specific)
            elif os.name == 'nt':
                # Try common executable extensions
                for ext in ['.exe', '.bat', '.cmd']:
                    try:
                        process = subprocess.Popen([process_name + ext if not process_name.endswith(ext) else process_name],
                                                  shell=True,
                                                  creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
                        time.sleep(1)
                        if self.add_process(process_name):
                            logger.info(f"Started process {process_name}")
                            return {"success": True, "message": f"Process {process_name} started successfully", "pid": process.pid}
                    except:
                        continue

                return {"success": False, "message": f"Could not start process. Please provide executable path."}
            else:
                return {"success": False, "message": f"Please provide executable path to start process"}

        except Exception as e:
            logger.error(f"Error starting process {process_name}: {e}")
            return {"success": False, "message": f"Error: {str(e)}"}

    def restart_process(self, process_name: str, executable_path: Optional[str] = None, force_stop: bool = False, pid: Optional[int] = None) -> Dict[str, any]:
        """Restart a monitored process"""
        if process_name not in self.monitored_processes:
            return {"success": False, "message": f"Process {process_name} is not being monitored"}

        try:
            # Get executable path if not provided
            if not executable_path:
                proc_data = self.monitored_processes[process_name]
                proc = proc_data['process']
                if proc.is_running():
                    try:
                        executable_path = proc.exe()
                    except (psutil.AccessDenied, psutil.NoSuchProcess):
                        return {"success": False, "message": f"Cannot determine executable path. Please provide it manually."}

            # Stop the process
            stop_result = self.stop_process(process_name, force=force_stop, pid=pid)
            if not stop_result["success"]:
                return stop_result

            # Wait for process to stop
            time.sleep(2)

            # Start the process again
            start_result = self.start_process(process_name, executable_path)

            if start_result["success"]:
                logger.info(f"Restarted process {process_name}")
                return {"success": True, "message": f"Process {process_name} restarted successfully"}
            else:
                return {"success": False, "message": f"Process stopped but failed to restart: {start_result['message']}"}

        except Exception as e:
            logger.error(f"Error restarting process {process_name}: {e}")
            return {"success": False, "message": f"Error: {str(e)}"}

    # ==================== BMS Log Monitoring Methods ====================

    def get_bms_status(self, process_name: str, window_title: Optional[str] = None) -> Optional[BMSGatewayStatus]:
        """
        Get BMS Gateway status from log files

        Args:
            process_name: Name of the process
            window_title: Window title (optional, used for BMS detection)

        Returns:
            BMSGatewayStatus if this is a BMS process, None otherwise
        """
        # Check if this is a BMS process
        if not is_bms_process(process_name, window_title):
            return None

        # Get or create BMS monitor for this process
        if process_name not in self.bms_monitors:
            self.bms_monitors[process_name] = BMSLogMonitor(process_name)
            logger.info(f"Created BMS log monitor for {process_name}")

        monitor = self.bms_monitors[process_name]

        try:
            # Get current status
            status = monitor.get_status()

            # Check for status changes and create alerts
            self._check_bms_status_changes(process_name, status)

            # Convert dataclass to Pydantic model
            return BMSGatewayStatus(
                process_name=status.process_name,
                log_path=status.log_path,
                gateway_status=status.gateway_status,
                gateway_last_event=status.gateway_last_event,
                gateway_last_event_time=status.gateway_last_event_time,
                last_heartbeat=status.last_heartbeat,
                heartbeat_stale=status.heartbeat_stale,
                hosxp_db_status=status.hosxp_db_status,
                hosxp_db_host=status.hosxp_db_host,
                hosxp_db_last_error=status.hosxp_db_last_error,
                gateway_db_status=status.gateway_db_status,
                gateway_db_host=status.gateway_db_host,
                gateway_db_last_error=status.gateway_db_last_error,
                active_threads=status.active_threads,
                thread_errors=status.thread_errors,
                last_check=status.last_check,
                last_error_time=status.last_error_time,
            )
        except Exception as e:
            logger.error(f"Error getting BMS status for {process_name}: {e}")
            return None

    def _check_bms_status_changes(self, process_name: str, status) -> None:
        """
        Check for BMS status changes and create alerts

        Args:
            process_name: Name of the process
            status: BMSGatewayStatus from log monitor
        """
        # Get previous status
        prev_hosxp = self.prev_bms_hosxp_status.get(process_name, 'unknown')
        prev_gateway = self.prev_bms_gateway_status.get(process_name, 'unknown')

        # Check HOSxP DB status change
        if status.hosxp_db_status != prev_hosxp and prev_hosxp != 'unknown':
            if status.hosxp_db_status == 'disconnected':
                self._create_bms_db_alert(
                    process_name,
                    'BMS_DB_HOSXP_DISCONNECTED',
                    f"HOSxP DB disconnected: {status.hosxp_db_last_error or 'Connection lost'}",
                    status.hosxp_db_host
                )
            elif status.hosxp_db_status == 'connected' and prev_hosxp == 'disconnected':
                self._create_bms_db_alert(
                    process_name,
                    'BMS_DB_HOSXP_RECONNECTED',
                    "HOSxP DB reconnected successfully",
                    status.hosxp_db_host
                )

        # Check Gateway DB status change
        if status.gateway_db_status != prev_gateway and prev_gateway != 'unknown':
            if status.gateway_db_status == 'disconnected':
                self._create_bms_db_alert(
                    process_name,
                    'BMS_DB_GATEWAY_DISCONNECTED',
                    f"Gateway DB disconnected: {status.gateway_db_last_error or 'Connection lost'}",
                    status.gateway_db_host
                )
            elif status.gateway_db_status == 'connected' and prev_gateway == 'disconnected':
                self._create_bms_db_alert(
                    process_name,
                    'BMS_DB_GATEWAY_RECONNECTED',
                    "Gateway DB reconnected successfully",
                    status.gateway_db_host
                )

        # Update previous status
        self.prev_bms_hosxp_status[process_name] = status.hosxp_db_status
        self.prev_bms_gateway_status[process_name] = status.gateway_db_status

    def _create_bms_db_alert(self, process_name: str, alert_type: str, message: str, db_host: Optional[str] = None) -> None:
        """
        Create alert for BMS database connection changes

        Args:
            process_name: Name of the process
            alert_type: Type of alert (BMS_DB_HOSXP_DISCONNECTED, etc.)
            message: Alert message
            db_host: Database host (optional)
        """
        timestamp = get_thai_iso()

        # Get hospital info from monitored process
        hospital_code = None
        hospital_name = None
        if process_name in self.monitored_processes:
            proc_data = self.monitored_processes[process_name]
            proc = proc_data.get('process')
            if proc and proc.is_running():
                try:
                    pid = proc_data['pid']
                    titles = get_window_titles_for_pid(pid)
                    if titles:
                        window_info = parse_bms_window_title(titles[0])
                        if window_info:
                            hospital_code = window_info.hospital_code
                            hospital_name = window_info.hospital_name
                except Exception:
                    pass

        alert = Alert(
            timestamp=timestamp,
            process_name=process_name,
            alert_type=alert_type,
            message=message,
            value=0,
            threshold=None,
            hospital_code=hospital_code,
            hospital_name=hospital_name
        )

        self.alerts.append(alert)
        logger.warning(f"BMS Alert: [{alert_type}] {process_name} - {message}")

        # Send LINE notification for disconnect alerts
        if 'DISCONNECTED' in alert_type:
            line_service = get_line_notify_service()
            if line_service:
                try:
                    notification_msg = f"[{alert_type}] {process_name}"
                    if hospital_name:
                        notification_msg += f" ({hospital_name})"
                    notification_msg += f"\n{message}"
                    if db_host:
                        notification_msg += f"\nHost: {db_host}"

                    send_line_notification_async(
                        line_service.send_alert(alert_type, notification_msg)
                    )
                except Exception as e:
                    logger.error(f"Failed to send LINE notification for BMS alert: {e}")
