"""
BMS HOSxP LIS Gateway Log Monitor
Monitor BMS log files for gateway status and database connection status
"""

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Literal
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

# Thailand timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))


@dataclass
class BMSGatewayStatus:
    """Status of BMS HOSxP LIS Gateway from log files"""
    process_name: str
    log_path: str

    # Gateway status
    gateway_status: Literal['running', 'stopped', 'unknown'] = 'unknown'
    gateway_last_event: Optional[str] = None  # "Start Gateway" or "Stop Gateway"
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
    thread_errors: List[str] = field(default_factory=list)

    # Timestamps
    last_check: Optional[str] = None
    last_error_time: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'process_name': self.process_name,
            'log_path': self.log_path,
            'gateway_status': self.gateway_status,
            'gateway_last_event': self.gateway_last_event,
            'gateway_last_event_time': self.gateway_last_event_time,
            'last_heartbeat': self.last_heartbeat,
            'heartbeat_stale': self.heartbeat_stale,
            'hosxp_db_status': self.hosxp_db_status,
            'hosxp_db_host': self.hosxp_db_host,
            'hosxp_db_last_error': self.hosxp_db_last_error,
            'gateway_db_status': self.gateway_db_status,
            'gateway_db_host': self.gateway_db_host,
            'gateway_db_last_error': self.gateway_db_last_error,
            'active_threads': self.active_threads,
            'thread_errors': self.thread_errors,
            'last_check': self.last_check,
            'last_error_time': self.last_error_time,
        }


class BMSLogMonitor:
    """Monitor BMS HOSxP LIS Gateway log files"""

    # Log patterns
    PATTERN_START_GATEWAY = r'Start Gateway\.'
    PATTERN_STOP_GATEWAY = r'Stop Gateway\.'
    PATTERN_HEARTBEAT = r'1-{18} = \d+'
    PATTERN_CREATE_THREAD = r'Create Thread (Import|Export)\[(\d+)\]'
    PATTERN_CREATED_THREAD = r'Created (Import|Export) Thread'

    # Error patterns
    PATTERN_CONNECTION_ERROR = r'(Init LIS )?Connection Error\s*=>\s*(.+)'
    PATTERN_RECONNECT_ERROR = r'Error Reconnect\s+([^\s]+)\s*=>\s*(.+)'
    PATTERN_RECONNECT_START = r'ReConnect DB \.\.\.'
    PATTERN_RECONNECT_OK = r'ReConnect DB OK\.'
    PATTERN_THREAD_ERROR = r'Thread (Export|Import)\[(\d+)\]\s+(Execute\s+)?Error\s*=>\s*(.+)'

    def __init__(self, process_name: str, log_path: Optional[str] = None):
        """
        Initialize BMS Log Monitor

        Args:
            process_name: Name of the BMS process
            log_path: Path to log directory (auto-detected if not provided)
        """
        self.process_name = process_name
        self.log_path = log_path or self._auto_detect_log_path()

        # State tracking
        self._last_system_log_position = 0
        self._last_error_log_position = 0
        self._previous_hosxp_db_status = 'unknown'
        self._previous_gateway_db_status = 'unknown'

    def _auto_detect_log_path(self) -> str:
        """Auto-detect BMS log path from AppData"""
        # Standard BMS log path
        appdata = os.environ.get('APPDATA', '')
        if appdata:
            log_path = os.path.join(appdata, 'BMS', 'BMSHOSxPLISServices', 'Log')
            if os.path.exists(log_path):
                return log_path

        # Try to find from user profile
        userprofile = os.environ.get('USERPROFILE', '')
        if userprofile:
            log_path = os.path.join(userprofile, 'AppData', 'Roaming', 'BMS', 'BMSHOSxPLISServices', 'Log')
            if os.path.exists(log_path):
                return log_path

        # Return default path even if not exists
        return os.path.join(appdata or '', 'BMS', 'BMSHOSxPLISServices', 'Log')

    def _get_today_log_path(self, log_type: str) -> str:
        """
        Get today's log file path

        Args:
            log_type: 'System' or 'Error'

        Returns:
            Full path to today's log file
        """
        today = datetime.now(THAI_TZ)
        filename = f"{log_type}_{today.strftime('%y.%m.%d')}.txt"
        return os.path.join(self.log_path, filename)

    def _parse_log_time(self, line: str) -> Optional[str]:
        """Extract timestamp from log line (format: HH:MM:SS : message)"""
        match = re.match(r'^(\d{2}:\d{2}:\d{2})\s*:', line)
        if match:
            time_str = match.group(1)
            today = datetime.now(THAI_TZ).strftime('%Y-%m-%d')
            return f"{today}T{time_str}+07:00"
        return None

    def _read_log_file(self, file_path: str, from_end: bool = True, max_lines: int = 100) -> List[str]:
        """
        Read log file content

        Args:
            file_path: Path to log file
            from_end: If True, read from end of file
            max_lines: Maximum lines to read

        Returns:
            List of log lines
        """
        if not os.path.exists(file_path):
            return []

        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                if from_end:
                    # Read last N lines
                    lines = f.readlines()
                    return lines[-max_lines:] if len(lines) > max_lines else lines
                else:
                    return f.readlines()[:max_lines]
        except Exception as e:
            logger.error(f"Error reading log file {file_path}: {e}")
            return []

    def parse_system_log(self) -> dict:
        """
        Parse system log for gateway status

        Returns:
            dict with gateway_status, last_event, last_heartbeat, active_threads
        """
        result = {
            'gateway_status': 'unknown',
            'gateway_last_event': None,
            'gateway_last_event_time': None,
            'last_heartbeat': None,
            'active_threads': 0,
        }

        log_path = self._get_today_log_path('System')
        lines = self._read_log_file(log_path)

        if not lines:
            return result

        # Parse from end to find most recent state
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue

            timestamp = self._parse_log_time(line)

            # Check for Start Gateway
            if re.search(self.PATTERN_START_GATEWAY, line):
                if result['gateway_status'] == 'unknown':
                    result['gateway_status'] = 'running'
                    result['gateway_last_event'] = 'Start Gateway'
                    result['gateway_last_event_time'] = timestamp
                break  # Found the most recent start/stop

            # Check for Stop Gateway
            if re.search(self.PATTERN_STOP_GATEWAY, line):
                if result['gateway_status'] == 'unknown':
                    result['gateway_status'] = 'stopped'
                    result['gateway_last_event'] = 'Stop Gateway'
                    result['gateway_last_event_time'] = timestamp
                break  # Found the most recent start/stop

            # Check for heartbeat (only record most recent)
            if re.search(self.PATTERN_HEARTBEAT, line) and not result['last_heartbeat']:
                result['last_heartbeat'] = timestamp
                if result['gateway_status'] == 'unknown':
                    result['gateway_status'] = 'running'  # Heartbeat means running

        # Count active threads from recent lines
        thread_ids = set()
        for line in lines[-50:]:  # Check last 50 lines
            match = re.search(self.PATTERN_CREATE_THREAD, line)
            if match:
                thread_type = match.group(1)
                thread_id = match.group(2)
                thread_ids.add(f"{thread_type}_{thread_id}")
        result['active_threads'] = len(thread_ids)

        return result

    def parse_error_log(self) -> dict:
        """
        Parse error log for DB connection status

        Returns:
            dict with hosxp_db_status, gateway_db_status, errors
        """
        result = {
            'hosxp_db_status': 'unknown',
            'hosxp_db_host': None,
            'hosxp_db_last_error': None,
            'gateway_db_status': 'unknown',
            'gateway_db_host': None,
            'gateway_db_last_error': None,
            'thread_errors': [],
            'last_error_time': None,
        }

        log_path = self._get_today_log_path('Error')
        lines = self._read_log_file(log_path)

        if not lines:
            # No error log = assume connected
            result['hosxp_db_status'] = 'connected'
            result['gateway_db_status'] = 'connected'
            return result

        # Track connection state changes
        hosxp_connected = True  # Assume connected until we find error
        gateway_connected = True

        # Parse from beginning to track state changes
        for line in lines:
            line = line.strip()
            if not line:
                continue

            timestamp = self._parse_log_time(line)

            # Check for connection error (Init LIS Connection Error)
            conn_match = re.search(self.PATTERN_CONNECTION_ERROR, line)
            if conn_match:
                error_msg = conn_match.group(2) if conn_match.group(2) else conn_match.group(1)

                # Extract host from error message
                host_match = re.search(r"host\s*['\"]?([^'\":\s]+)", error_msg, re.IGNORECASE)
                host = host_match.group(1) if host_match else None

                # Determine which DB based on context
                # LIS/HOSxP in error line = connection to HOSxP database failed
                # (LIS is the interface that connects TO HOSxP)
                if 'LIS' in line or 'HOSxP' in line.upper():
                    hosxp_connected = False
                    result['hosxp_db_host'] = host
                    result['hosxp_db_last_error'] = error_msg[:200]  # Limit error length
                else:
                    # Gateway DB connection error
                    gateway_connected = False
                    result['gateway_db_host'] = host
                    result['gateway_db_last_error'] = error_msg[:200]

                result['last_error_time'] = timestamp

            # Check for reconnect error
            reconnect_match = re.search(self.PATTERN_RECONNECT_ERROR, line)
            if reconnect_match:
                db_info = reconnect_match.group(1)  # e.g., "127.0.0.1.lis_gateway_test"
                error_msg = reconnect_match.group(2)

                # Parse host and database from db_info
                parts = db_info.split('.')
                host = '.'.join(parts[:4]) if len(parts) >= 4 else parts[0]

                # Determine which DB based on database name
                # 'gateway' in db_info = connecting to gateway DB failed → hosxp_db issue
                if 'gateway' in db_info.lower():
                    hosxp_connected = False
                    result['hosxp_db_host'] = host
                    result['hosxp_db_last_error'] = error_msg[:200]
                else:
                    gateway_connected = False
                    result['gateway_db_host'] = host
                    result['gateway_db_last_error'] = error_msg[:200]

                result['last_error_time'] = timestamp

            # Check for reconnect OK
            if re.search(self.PATTERN_RECONNECT_OK, line):
                hosxp_connected = True
                gateway_connected = True
                result['hosxp_db_last_error'] = None
                result['gateway_db_last_error'] = None

            # Check for thread errors
            thread_match = re.search(self.PATTERN_THREAD_ERROR, line)
            if thread_match:
                thread_type = thread_match.group(1)
                thread_id = thread_match.group(2)
                error_msg = thread_match.group(4)
                error_info = f"{thread_type}[{thread_id}]: {error_msg[:100]}"
                if error_info not in result['thread_errors']:
                    result['thread_errors'].append(error_info)
                    # Keep only last 5 thread errors
                    if len(result['thread_errors']) > 5:
                        result['thread_errors'] = result['thread_errors'][-5:]

        # Set final status
        result['hosxp_db_status'] = 'connected' if hosxp_connected else 'disconnected'
        result['gateway_db_status'] = 'connected' if gateway_connected else 'disconnected'

        return result

    def check_heartbeat_timeout(self, last_heartbeat: Optional[str], timeout_seconds: int = 30) -> bool:
        """
        Check if heartbeat is stale (no update in timeout period)

        Args:
            last_heartbeat: ISO timestamp of last heartbeat
            timeout_seconds: Timeout in seconds

        Returns:
            True if heartbeat is stale
        """
        if not last_heartbeat:
            return True

        try:
            # Parse ISO timestamp
            hb_time = datetime.fromisoformat(last_heartbeat.replace('Z', '+00:00'))
            now = datetime.now(THAI_TZ)
            delta = (now - hb_time).total_seconds()
            return delta > timeout_seconds
        except Exception as e:
            logger.debug(f"Error parsing heartbeat time: {e}")
            return True

    def get_status(self) -> BMSGatewayStatus:
        """
        Get current BMS Gateway status by parsing log files

        Returns:
            BMSGatewayStatus object
        """
        # Parse both logs
        system_info = self.parse_system_log()
        error_info = self.parse_error_log()

        # If Gateway was started AFTER the last error, consider DB connections as connected
        # (because the gateway restarted and presumably connected successfully)
        if (system_info['gateway_status'] == 'running' and
            system_info['gateway_last_event'] == 'start' and
            error_info['last_error_time'] and
            system_info['gateway_last_event_time']):
            try:
                # Compare timestamps
                error_time = self._parse_log_time(error_info['last_error_time'])
                start_time = self._parse_log_time(system_info['gateway_last_event_time'])
                if start_time and error_time and start_time > error_time:
                    # Gateway restarted after the last error - assume connected
                    logger.debug(f"Gateway started at {start_time} after last error at {error_time}, assuming DB connected")
                    error_info['hosxp_db_status'] = 'connected'
                    error_info['gateway_db_status'] = 'connected'
                    error_info['hosxp_db_last_error'] = None
                    error_info['gateway_db_last_error'] = None
            except Exception as e:
                logger.debug(f"Error comparing timestamps: {e}")

        # Check heartbeat timeout
        heartbeat_stale = self.check_heartbeat_timeout(system_info['last_heartbeat'])

        # If heartbeat is stale and status was running, mark as unknown
        gateway_status = system_info['gateway_status']
        if gateway_status == 'running' and heartbeat_stale:
            gateway_status = 'unknown'

        status = BMSGatewayStatus(
            process_name=self.process_name,
            log_path=self.log_path,
            gateway_status=gateway_status,
            gateway_last_event=system_info['gateway_last_event'],
            gateway_last_event_time=system_info['gateway_last_event_time'],
            last_heartbeat=system_info['last_heartbeat'],
            heartbeat_stale=heartbeat_stale,
            hosxp_db_status=error_info['hosxp_db_status'],
            hosxp_db_host=error_info['hosxp_db_host'],
            hosxp_db_last_error=error_info['hosxp_db_last_error'],
            gateway_db_status=error_info['gateway_db_status'],
            gateway_db_host=error_info['gateway_db_host'],
            gateway_db_last_error=error_info['gateway_db_last_error'],
            active_threads=system_info['active_threads'],
            thread_errors=error_info['thread_errors'],
            last_check=datetime.now(THAI_TZ).isoformat(),
            last_error_time=error_info['last_error_time'],
        )

        return status

    def get_status_changes(self) -> Dict[str, tuple]:
        """
        Get status changes for alerting

        Returns:
            dict of changed statuses: {'hosxp_db': ('connected', 'disconnected'), ...}
        """
        changes = {}
        current = self.get_status()

        # Check HOSxP DB status change
        if current.hosxp_db_status != self._previous_hosxp_db_status:
            if self._previous_hosxp_db_status != 'unknown':
                changes['hosxp_db'] = (self._previous_hosxp_db_status, current.hosxp_db_status)
            self._previous_hosxp_db_status = current.hosxp_db_status

        # Check Gateway DB status change
        if current.gateway_db_status != self._previous_gateway_db_status:
            if self._previous_gateway_db_status != 'unknown':
                changes['gateway_db'] = (self._previous_gateway_db_status, current.gateway_db_status)
            self._previous_gateway_db_status = current.gateway_db_status

        return changes


def is_bms_process(process_name: str, window_title: Optional[str] = None) -> bool:
    """
    Check if a process is a BMS HOSxP LIS Gateway

    Args:
        process_name: Process name
        window_title: Window title (optional)

    Returns:
        True if this is a BMS process
    """
    name_lower = process_name.lower()

    # Check process name patterns
    bms_patterns = [
        'bms',
        'hosxp',
        'lis',
        'gateway',
        'hl7',
    ]

    for pattern in bms_patterns:
        if pattern in name_lower:
            return True

    # Check window title if provided
    if window_title:
        title_upper = window_title.upper()
        if 'BMS' in title_upper or 'HOSXP' in title_upper:
            return True

    return False
