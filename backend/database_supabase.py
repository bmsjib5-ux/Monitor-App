"""
Supabase Database Module using REST API
ทำงานผ่าน HTTPS API แทนการเชื่อมต่อ PostgreSQL โดยตรง
"""
import aiohttp
import asyncio
import ssl
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from config import settings
import logging

# Try to import certifi for SSL certificates
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    # Fallback: use default SSL context
    SSL_CONTEXT = ssl.create_default_context()
    # If still having issues, disable verification (not recommended for production)
    # SSL_CONTEXT = ssl.create_default_context()
    # SSL_CONTEXT.check_hostname = False
    # SSL_CONTEXT.verify_mode = ssl.CERT_NONE

# Thailand timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

def get_thai_datetime() -> datetime:
    """Get current datetime in Thai timezone"""
    return datetime.now(THAI_TZ)

def get_thai_iso() -> str:
    """Get current datetime as ISO string in Thai timezone"""
    return get_thai_datetime().isoformat()

logger = logging.getLogger(__name__)


import re

def sanitize_window_title(title: Optional[str]) -> Optional[str]:
    """Remove database connection strings and sensitive info from window title

    Filters out patterns like:
    - DB : sa@127.0.0.1:dbname
    - [PostgreSQL:5432]
    - IP addresses with ports
    - Connection strings
    - Version numbers followed by DB info
    """
    if not title:
        return title

    # Patterns to remove (DB connection info) - order matters!
    patterns_to_remove = [
        # Full DB connection blocks (most specific first)
        r'[\r\n\s]*DB\s*:\s*\S+@[\d\.]+:\S+\s*\[PostgreSQL:\d+\]',  # DB : sa@127.0.0.1:sa [PostgreSQL:5432]
        r'[\r\n\s]*DB\s*:\s*\S+@[\d\.]+:\S+\s*\[MySQL:\d+\]',       # DB : sa@127.0.0.1:sa [MySQL:3306]
        r'[\r\n\s]*DB\s*:\s*\S+@[\d\.]+:\S+\s*\[MSSQL:\d+\]',       # DB : sa@127.0.0.1:sa [MSSQL:1433]
        r'[\r\n\s]*DB\s*:\s*\S+@[\d\.]+:\S+',                        # DB : user@ip:dbname
        r'\s*\[PostgreSQL:\d+\]',                                    # [PostgreSQL:5432]
        r'\s*\[MySQL:\d+\]',                                         # [MySQL:3306]
        r'\s*\[MSSQL:\d+\]',                                         # [MSSQL:1433]
        r':\s*\d+\.\d+\.\d+\.\d+[\r\n\s]+DB\s*:.*$',                # : 4.64.11.3 DB : ... (to end)
        r':\s*\d+\.\d+\.\d+\.\d+[\r\n\s]+DB\s*:.*\]',               # : 4.64.11.3 DB : ... ]
        r'\s*\d+\.\d+\.\d+\.\d+[\r\n\s]*DB\s*:.*\[.*\]',            # 4.65.10.28\r\n DB : ... [...]
        r'\s*\d+\.\d+\.\d+\.\d+:\d+',                                # IP:port like 127.0.0.1:5432
        r'\s*sa@[\d\.]+:\S+',                                        # sa@127.0.0.1:dbname
        r'\s*@[\d\.]+:\w+',                                          # @127.0.0.1:dbname
    ]

    sanitized = title
    for pattern in patterns_to_remove:
        sanitized = re.sub(pattern, '', sanitized, flags=re.IGNORECASE | re.DOTALL)

    # Clean up \r\n and extra whitespace
    sanitized = re.sub(r'[\r\n]+', ' ', sanitized)
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    sanitized = re.sub(r'[\s\-:]+$', '', sanitized).strip()

    # If title becomes empty or too short after sanitization, return None
    if not sanitized or len(sanitized) < 3:
        return None

    return sanitized


class SupabaseDatabase:
    """Supabase Database class using REST API"""

    def __init__(self):
        self.project_url = settings.supabase_url
        self.api_key = settings.supabase_key
        self.headers = {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        self.session: Optional[aiohttp.ClientSession] = None

    async def connect(self) -> None:
        """Create aiohttp session for API requests"""
        if self.session is None:
            # Create TCP connector with SSL context
            connector = aiohttp.TCPConnector(ssl=SSL_CONTEXT)
            self.session = aiohttp.ClientSession(connector=connector)
            logger.info(f"Connected to Supabase: {self.project_url}")

    async def disconnect(self) -> None:
        """Close aiohttp session"""
        if self.session:
            await self.session.close()
            self.session = None
            logger.info("Disconnected from Supabase")

    async def _request(self, method: str, endpoint: str, data: Optional[Dict] = None, params: Optional[Dict] = None) -> Any:
        """Make HTTP request to Supabase REST API"""
        if not self.session:
            await self.connect()

        url = f"{self.project_url}/rest/v1/{endpoint}"

        try:
            logger.debug(f"Supabase {method} {endpoint}: data={data}, params={params}")

            async with self.session.request(
                method,
                url,
                headers=self.headers,
                json=data,
                params=params,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status in [200, 201]:
                    result = await response.json()
                    logger.debug(f"Supabase {method} {endpoint} success: {result}")
                    return result
                elif response.status == 204:
                    logger.debug(f"Supabase {method} {endpoint} success (no content)")
                    return True  # Return True instead of None for successful operations
                else:
                    error_text = await response.text()
                    logger.error(f"Supabase API error {response.status} for {method} {endpoint}: {error_text}")
                    raise Exception(f"Supabase API error {response.status}: {error_text}")
        except Exception as e:
            logger.error(f"Supabase request failed for {method} {endpoint}: {e}")
            raise

    async def insert(self, table: str, data: Dict[str, Any]) -> Optional[Dict]:
        """Insert data into table"""
        return await self._request("POST", table, data=data)

    async def upsert(self, table: str, data: Dict[str, Any], on_conflict: str = "id") -> Optional[Dict]:
        """
        Insert or update data (UPSERT)
        Uses Supabase's on_conflict query parameter
        on_conflict: column name(s) to check for conflict (e.g., "process_name" or "id")
        """
        if not self.session:
            await self.connect()

        # Use on_conflict as query parameter for Supabase
        url = f"{self.project_url}/rest/v1/{table}?on_conflict={on_conflict}"

        # Special headers for upsert - merge on conflict
        upsert_headers = {
            **self.headers,
            "Prefer": "resolution=merge-duplicates,return=representation"
        }

        try:
            logger.debug(f"Supabase UPSERT {table}: data={data}, on_conflict={on_conflict}")

            async with self.session.request(
                "POST",
                url,
                headers=upsert_headers,
                json=data,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status in [200, 201]:
                    result = await response.json()
                    logger.debug(f"Supabase UPSERT {table} success: {result}")
                    return result
                elif response.status == 204:
                    logger.debug(f"Supabase UPSERT {table} success (no content)")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"Supabase UPSERT error {response.status} for {table}: {error_text}")
                    raise Exception(f"Supabase API error {response.status}: {error_text}")
        except Exception as e:
            logger.error(f"Supabase UPSERT failed for {table}: {e}")
            raise

    async def select(self, table: str, filters: Optional[Dict] = None, limit: Optional[int] = None, order_by: Optional[str] = None) -> List[Dict]:
        """Select data from table"""
        params = {}

        # PostgREST operators that should not be wrapped with eq.
        postgrest_operators = ('eq.', 'neq.', 'gt.', 'gte.', 'lt.', 'lte.', 'like.', 'ilike.', 'is.', 'in.', 'or.', 'and.', 'not.')

        if filters:
            for key, value in filters.items():
                # Check if value already has a PostgREST operator
                if isinstance(value, str) and value.startswith(postgrest_operators):
                    params[key] = value
                else:
                    params[key] = f"eq.{value}"

        if limit:
            params["limit"] = limit

        if order_by:
            params["order"] = order_by

        # Select all columns
        params["select"] = "*"

        result = await self._request("GET", table, params=params)
        return result if result else []

    async def update(self, table: str, filters: Dict[str, Any], data: Dict[str, Any]) -> Optional[List[Dict]]:
        """Update data in table"""
        params = {}
        postgrest_operators = ('eq.', 'neq.', 'gt.', 'gte.', 'lt.', 'lte.', 'like.', 'ilike.', 'is.', 'in.', 'or.', 'and.', 'not.')
        for key, value in filters.items():
            if isinstance(value, str) and value.startswith(postgrest_operators):
                params[key] = value
            else:
                params[key] = f"eq.{value}"

        return await self._request("PATCH", table, data=data, params=params)

    async def delete(self, table: str, filters: Dict[str, Any]) -> None:
        """Delete data from table"""
        params = {}
        postgrest_operators = ('eq.', 'neq.', 'gt.', 'gte.', 'lt.', 'lte.', 'like.', 'ilike.', 'is.', 'in.', 'or.', 'and.', 'not.')
        for key, value in filters.items():
            if isinstance(value, str) and value.startswith(postgrest_operators):
                params[key] = value
            else:
                params[key] = f"eq.{value}"

        await self._request("DELETE", table, params=params)

    async def init_tables(self) -> None:
        """
        Initialize database tables
        Note: สำหรับ REST API ไม่สามารถสร้างตารางได้โดยตรง
        ต้องรัน SQL migration ผ่าน Supabase Dashboard หรือ SQL Editor
        """
        logger.info("Tables should be created via Supabase Dashboard SQL Editor")
        logger.info("Run the migration file: supabase_migration.sql")

        # ตรวจสอบว่าตารางมีอยู่หรือไม่
        try:
            # ลองดึงข้อมูลจากตาราง thresholds
            result = await self.select("thresholds", limit=1)

            if not result:
                # ถ้ายังไม่มีข้อมูล ให้สร้าง default thresholds
                await self.insert("thresholds", {
                    "cpu_threshold": settings.cpu_threshold,
                    "ram_threshold": settings.ram_threshold,
                    "disk_io_threshold": settings.disk_io_threshold,
                    "network_threshold": settings.network_threshold
                })
                logger.info("Default thresholds created")
        except Exception as e:
            logger.warning(f"Could not check thresholds table: {e}")
            logger.info("Please run migration file: supabase_migration.sql")


# Global database instance
db = SupabaseDatabase()


# Flags to track if optional columns exist
_has_start_stop_columns = True
_has_client_version_column = True
_has_window_info_column = True
_has_bms_status_columns = True
_has_company_name_column = True
_has_install_date_column = True


# Helper functions for process history
async def save_process_data(process_data: Dict[str, Any]) -> None:
    """Save process data to database - Update if process_name + hostname exists, Insert if new

    IMPORTANT: hospital_code is REQUIRED. If not provided, will try to get from process_history.
    If still not found, the record will NOT be saved.

    Key: ใช้ process_name + hostname เป็น unique key (ไม่ใช่ PID)
    เพื่อให้ชื่อโปรแกรมเดียวกันบนเครื่องเดียวกัน มี record เดียว
    """
    global _has_start_stop_columns, _has_client_version_column, _has_window_info_column, _has_bms_status_columns, _has_company_name_column, _has_install_date_column

    process_name = process_data.get('name')
    current_status = process_data.get('status')
    hostname = process_data.get('hostname')

    # Get hospital info from process_data if available
    hospital_code = process_data.get('hospital_code')
    hospital_name = process_data.get('hospital_name')
    program_path = process_data.get('program_path')

    # If not provided, try to get from existing record in process_history
    if not hospital_code:
        try:
            meta = await get_monitored_process(process_name)
            if meta:
                hospital_code = meta.get('hospital_code')
                hospital_name = hospital_name or meta.get('hospital_name')
                program_path = program_path or meta.get('program_path')
        except Exception as e:
            logger.debug(f"Could not get metadata for {process_name}: {e}")

    # VALIDATION: hospital_code is REQUIRED for Supabase storage
    if not hospital_code:
        logger.debug(f"Skipping save_process_data for {process_name}: hospital_code not set yet")
        return

    now = get_thai_iso()
    pid = process_data.get('pid')

    # Check if process_name + hostname + hospital_code + pid already exists in process_history
    # This is the correct unique key combination for accurate matching
    existing = None

    # Primary: Match by process_name + hostname + hospital_code + pid (most accurate)
    if hostname and hospital_code and pid:
        existing = await db.select(
            "process_history",
            filters={"process_name": process_name, "hostname": hostname, "hospital_code": hospital_code, "pid": pid},
            limit=1
        )

    # Fallback 1: Match by process_name + hostname + hospital_code (without pid)
    if not existing and hostname and hospital_code:
        existing = await db.select(
            "process_history",
            filters={"process_name": process_name, "hostname": hostname, "hospital_code": hospital_code},
            limit=1
        )

    # Fallback 2: Match by process_name + hostname + pid
    if not existing and hostname and pid:
        existing = await db.select(
            "process_history",
            filters={"process_name": process_name, "hostname": hostname, "pid": pid},
            limit=1
        )

    # Fallback 3: Match by process_name + hostname only
    if not existing and hostname:
        existing = await db.select(
            "process_history",
            filters={"process_name": process_name, "hostname": hostname},
            limit=1
        )

    # IMPORTANT: Do NOT fallback to process_name only!
    # This would update records from OTHER machines with the same process name.
    # If no hostname match found, we should INSERT a new record instead of updating wrong one.
    if not existing and not hostname:
        logger.warning(f"Skipping save_process_data for {process_name}: hostname is required for matching")
        return

    if existing:
        existing_record = existing[0]
        previous_status = existing_record.get('status')
        record_id = existing_record.get('id')

        # For UPDATE: Update metrics data, but NOT metadata (pid, hospital_code, hospital_name, program_path)
        # This prevents the periodic auto-refresh update from overwriting user-set metadata
        uptime_val = process_data.get('uptime_seconds')
        update_data = {
            "status": current_status,
            "cpu_percent": process_data.get('cpu_percent'),
            "memory_mb": process_data.get('memory_mb'),
            "memory_percent": process_data.get('memory_percent'),
            "disk_read_mb": process_data.get('disk_read_mb'),
            "disk_write_mb": process_data.get('disk_write_mb'),
            "net_sent_mb": process_data.get('net_sent_mb'),
            "net_recv_mb": process_data.get('net_recv_mb'),
            "uptime_seconds": int(uptime_val) if uptime_val is not None else None,
            "recorded_at": now
        }

        # Add BMS Gateway status fields if available and columns exist
        if _has_bms_status_columns:
            bms_status = process_data.get('bms_status')
            if bms_status:
                update_data["bms_gateway_status"] = bms_status.get('gateway_status', 'unknown')
                update_data["bms_hosxp_db_status"] = bms_status.get('hosxp_db_status', 'unknown')
                update_data["bms_gateway_db_status"] = bms_status.get('gateway_db_status', 'unknown')
                update_data["bms_last_heartbeat"] = bms_status.get('last_heartbeat')
                update_data["bms_heartbeat_stale"] = bms_status.get('heartbeat_stale', False)
                update_data["bms_log_path"] = bms_status.get('log_path')
                update_data["bms_hosxp_db_error"] = bms_status.get('hosxp_db_last_error')
                update_data["bms_gateway_db_error"] = bms_status.get('gateway_db_last_error')

        # NOTE: Do NOT auto-update these fields during periodic refresh:
        # - client_version
        # - window_title
        # - window_info
        # - program_path
        # - hostname (never update hostname in auto refresh)
        # These fields should only be updated when user explicitly saves via save_monitored_process()

        # Only add start/stop times if columns exist in database
        if _has_start_stop_columns:
            # Track start/stop times based on status change
            if previous_status != current_status:
                if current_status == 'running':
                    update_data['last_started'] = now
                elif previous_status == 'running':
                    update_data['last_stopped'] = now

            # Preserve existing start/stop times if not changing
            if 'last_started' not in update_data and existing_record.get('last_started'):
                update_data['last_started'] = existing_record.get('last_started')
            if 'last_stopped' not in update_data and existing_record.get('last_stopped'):
                update_data['last_stopped'] = existing_record.get('last_stopped')

        # Update existing record by id (more reliable)
        try:
            if record_id:
                await db.update(
                    "process_history",
                    filters={"id": record_id},
                    data=update_data
                )
            elif hostname:
                # IMPORTANT: Always use hostname to avoid updating wrong records
                await db.update(
                    "process_history",
                    filters={"process_name": process_name, "hostname": hostname},
                    data=update_data
                )
            else:
                logger.warning(f"Cannot update {process_name}: record_id or hostname is required")
                return
            logger.debug(f"Updated process_history metrics for {process_name}")
        except Exception as e:
            error_str = str(e)
            needs_retry = False

            # If error due to missing client_version column
            if 'client_version' in error_str:
                _has_client_version_column = False
                logger.warning("client_version column not found in process_history. Run migration to add it.")
                update_data.pop('client_version', None)
                needs_retry = True

            # If error due to missing start/stop columns
            if 'last_started' in error_str or 'last_stopped' in error_str:
                _has_start_stop_columns = False
                logger.warning("last_started/last_stopped columns not found. Run supabase_add_start_stop_times.sql migration.")
                update_data.pop('last_started', None)
                update_data.pop('last_stopped', None)
                needs_retry = True

            # If error due to missing window_title/window_info columns
            if 'window_title' in error_str or 'window_info' in error_str:
                _has_window_info_column = False
                logger.warning("window_title/window_info columns not found. Run migration to add them.")
                update_data.pop('window_title', None)
                update_data.pop('window_info', None)
                needs_retry = True

            # If error due to missing company_name column
            if 'company_name' in error_str:
                _has_company_name_column = False
                logger.warning("company_name column not found. Run supabase_company_install_warranty.sql migration.")
                update_data.pop('company_name', None)
                needs_retry = True

            # If error due to missing install_date/warranty_expiry_date columns
            if 'install_date' in error_str or 'warranty_expiry_date' in error_str:
                _has_install_date_column = False
                logger.warning("install_date/warranty_expiry_date columns not found. Run supabase_company_install_warranty.sql migration.")
                update_data.pop('install_date', None)
                update_data.pop('warranty_expiry_date', None)
                needs_retry = True

            # If error due to missing BMS status columns
            if 'bms_gateway_status' in error_str or 'bms_hosxp_db_status' in error_str or 'bms_gateway_db_status' in error_str:
                _has_bms_status_columns = False
                logger.warning("BMS status columns not found. Run supabase_add_bms_status.sql migration.")
                update_data.pop('bms_gateway_status', None)
                update_data.pop('bms_hosxp_db_status', None)
                update_data.pop('bms_gateway_db_status', None)
                update_data.pop('bms_last_heartbeat', None)
                update_data.pop('bms_heartbeat_stale', None)
                update_data.pop('bms_log_path', None)
                update_data.pop('bms_hosxp_db_error', None)
                update_data.pop('bms_gateway_db_error', None)
                needs_retry = True

            if needs_retry:
                # Retry without the missing columns
                if record_id:
                    await db.update(
                        "process_history",
                        filters={"id": record_id},
                        data=update_data
                    )
                elif hostname:
                    # IMPORTANT: Always use hostname to avoid updating wrong records
                    await db.update(
                        "process_history",
                        filters={"process_name": process_name, "hostname": hostname},
                        data=update_data
                    )
                else:
                    logger.warning(f"Cannot retry update for {process_name}: hostname is required")
            else:
                raise
    else:
        # NOTE: Auto Refresh should NOT INSERT new records
        # New records should only be created via Add Process (save_monitored_process)
        logger.debug(f"No existing record found for {process_name} in auto refresh - skipping (no INSERT in auto refresh)")


async def save_alert(alert_data: Dict[str, Any]) -> None:
    """Save alert to database and send push notification"""
    # Note: alerts table uses 'created_at' (auto-generated by Supabase) not 'timestamp'
    # Hospital columns (hospital_code, hospital_name, hostname) need migration:
    # Run supabase_add_hospital_to_alerts.sql first
    data = {
        "process_name": alert_data.get('process_name'),
        "alert_type": alert_data.get('type'),
        "message": alert_data.get('message'),
        "value": alert_data.get('value'),
        "threshold": alert_data.get('threshold'),
    }

    # Try to add hospital info if columns exist
    _optional_alert_columns = ['hospital_code', 'hospital_name', 'hostname']
    for col in _optional_alert_columns:
        if alert_data.get(col):
            data[col] = alert_data.get(col)

    # Remove None values
    data = {k: v for k, v in data.items() if v is not None}

    alert_id = None
    try:
        result = await db.insert("alerts", data)
        if result and len(result) > 0:
            alert_id = result[0].get('id')
    except Exception as e:
        error_str = str(e)
        # If error is about missing columns, retry without those columns
        if any(col in error_str for col in _optional_alert_columns):
            logger.warning(f"Some alert columns don't exist. Run supabase_add_hospital_to_alerts.sql migration. Error: {e}")
            # Remove optional columns and retry
            for col in _optional_alert_columns:
                data.pop(col, None)
            result = await db.insert("alerts", data)
            if result and len(result) > 0:
                alert_id = result[0].get('id')
        else:
            raise

    # Send push notification (async, don't block on failure)
    try:
        from push_notifications import get_push_service
        push_svc = get_push_service()
        if push_svc:
            await push_svc.send_alert_notification(
                alert_type=alert_data.get('type', 'ALERT'),
                process_name=alert_data.get('process_name', 'Unknown'),
                message=alert_data.get('message', ''),
                hospital_name=alert_data.get('hospital_name'),
                hospital_code=alert_data.get('hospital_code'),
                hostname=alert_data.get('hostname'),
                alert_id=alert_id
            )
    except Exception as e:
        logger.warning(f"Failed to send push notification: {e}")


async def get_process_history(process_name: str, limit: int = 60) -> List[Dict[str, Any]]:
    """Get process history from database"""
    return await db.select(
        "process_history",
        filters={"process_name": process_name},
        limit=limit,
        order_by="recorded_at.desc"
    )


async def get_alerts(limit: int = 100) -> List[Dict[str, Any]]:
    """Get recent alerts from database"""
    return await db.select(
        "alerts",
        limit=limit,
        order_by="created_at.desc"
    )


async def get_alerts_by_type(alert_type: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Get alerts filtered by alert_type from database"""
    return await db.select(
        "alerts",
        filters={"alert_type": alert_type},
        limit=limit,
        order_by="created_at.desc"
    )


async def get_unsent_alerts(alert_type: str = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Get alerts that haven't been sent to LINE yet (line_sent = false or null)

    Args:
        alert_type: Optional filter by alert_type (e.g., 'PROCESS_STARTED')
        limit: Maximum number of alerts to return

    Returns:
        List of alerts that need to be sent to LINE
    """
    filters = {"line_sent": "is.null"}  # Get alerts where line_sent is null
    if alert_type:
        filters["alert_type"] = alert_type

    # First try with line_sent = null
    result = await db.select(
        "alerts",
        filters=filters,
        limit=limit,
        order_by="created_at.desc"
    )

    # Also get alerts where line_sent = false
    filters_false = {"line_sent": False}
    if alert_type:
        filters_false["alert_type"] = alert_type

    try:
        result_false = await db.select(
            "alerts",
            filters=filters_false,
            limit=limit,
            order_by="created_at.desc"
        )
        # Combine results
        result.extend(result_false)
    except Exception:
        pass  # line_sent column might not exist

    return result


async def mark_alert_as_sent(alert_id: int) -> bool:
    """Mark an alert as sent to LINE"""
    try:
        await db.update(
            "alerts",
            filters={"id": alert_id},
            data={"line_sent": True, "line_sent_at": get_thai_iso()}
        )
        return True
    except Exception as e:
        logger.warning(f"Could not mark alert as sent (line_sent column may not exist): {e}")
        return False


async def get_unsent_process_alerts(limit: int = 50) -> List[Dict[str, Any]]:
    """Get unsent alerts for PROCESS_STARTED and PROCESS_STOPPED only

    This function specifically gets alerts that:
    - Have alert_type = 'PROCESS_STARTED' or 'PROCESS_STOPPED'
    - Have line_sent = null or line_sent = false

    Returns:
        List of alerts that need to be sent to LINE
    """
    all_alerts = []

    # Get PROCESS_STARTED alerts
    started_alerts = await get_unsent_alerts("PROCESS_STARTED", limit)
    all_alerts.extend(started_alerts)

    # Get PROCESS_STOPPED alerts
    stopped_alerts = await get_unsent_alerts("PROCESS_STOPPED", limit)
    all_alerts.extend(stopped_alerts)

    # Sort by created_at descending and limit
    all_alerts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return all_alerts[:limit]


async def get_global_line_settings_for_notification() -> Optional[Dict[str, Any]]:
    """Get global LINE settings (without hostname filter) for sending notifications

    Returns the first enabled LINE settings found in Supabase.
    """
    try:
        # Get all enabled LINE settings
        result = await db.select(
            "line_settings",
            filters={"enabled": True},
            limit=1
        )
        if result:
            return _decrypt_line_settings(result[0])

        # Fallback: get any LINE settings
        result = await db.select("line_settings", limit=1)
        return _decrypt_line_settings(result[0]) if result else None
    except Exception as e:
        logger.warning(f"Could not get global LINE settings: {e}")
        return None


async def get_thresholds() -> Optional[Dict[str, Any]]:
    """Get current thresholds"""
    result = await db.select("thresholds", limit=1)
    return result[0] if result else None


async def update_thresholds(thresholds: Dict[str, float]) -> None:
    """Update thresholds"""
    # Get first threshold record
    existing = await get_thresholds()
    if existing:
        await db.update(
            "thresholds",
            filters={"id": existing["id"]},
            data=thresholds
        )
    else:
        await db.insert("thresholds", thresholds)


async def get_monitored_process(process_name: str, hospital_code: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get monitored process metadata by process_name and optionally hospital_code from process_history"""
    if hospital_code:
        # Search by both process_name and hospital_code
        result = await db.select(
            "process_history",
            filters={"process_name": process_name, "hospital_code": hospital_code},
            limit=1
        )
    else:
        # Search by process_name only
        result = await db.select(
            "process_history",
            filters={"process_name": process_name},
            limit=1
        )
    return result[0] if result else None


async def save_monitored_process(process_name: str, pid: Optional[int] = None, hospital_code: Optional[str] = None, hospital_name: Optional[str] = None, hostname: Optional[str] = None, program_path: Optional[str] = None, is_edit: bool = False, window_title: Optional[str] = None, window_info: Optional[Dict[str, Any]] = None, client_version: Optional[str] = None, company_name: Optional[str] = None, install_date: Optional[str] = None, warranty_expiry_date: Optional[str] = None) -> None:
    """
    Save monitored process to process_history table

    For Add Process (is_edit=False):
    - ตรวจสอบ process_name + hostname + hospital_code ก่อน
    - ถ้าซ้ำ → ไม่ทำอะไร (ไม่ INSERT, ไม่ UPDATE)
    - ถ้าไม่ซ้ำ → INSERT ใหม่

    For Edit Process (is_edit=True):
    - ตรวจสอบ process_name + hostname + pid ก่อน
    - ถ้ามีอยู่ → UPDATE เฉพาะ hospital_name, program_path, hospital_code
    - ถ้าไม่มี → ไม่ทำอะไร (ไม่ INSERT)

    Note: ใช้ process_history เป็นตารางหลักแทน monitored_processes
    """
    logger.info(f"Saving monitored process to process_history: {process_name}, pid={pid}, hostname={hostname}, code={hospital_code}, name={hospital_name}, path={program_path}, is_edit={is_edit}")

    try:
        # Check if record exists
        existing = None

        if is_edit:
            # For Edit: check by process_name + hostname + hospital_code + pid (all 4 fields)
            filters = {"process_name": process_name}
            if hostname:
                filters["hostname"] = hostname
            if hospital_code:
                filters["hospital_code"] = hospital_code
            if pid is not None:
                filters["pid"] = pid

            existing = await db.select(
                "process_history",
                filters=filters,
                limit=1
            )

            if existing:
                # UPDATE only these fields (NOT window_title, window_info)
                existing_record = existing[0]
                record_id = existing_record.get('id')

                update_data = {}
                if hospital_name:
                    update_data["hospital_name"] = hospital_name
                if program_path:
                    update_data["program_path"] = program_path
                # NOTE: Do NOT update window_title and window_info in Edit mode
                # These should only be set during Add Process
                if client_version and _has_client_version_column:
                    update_data["client_version"] = client_version
                if _has_company_name_column and company_name is not None:
                    update_data["company_name"] = company_name
                if _has_install_date_column:
                    if install_date is not None:
                        update_data["install_date"] = install_date
                    if warranty_expiry_date is not None:
                        update_data["warranty_expiry_date"] = warranty_expiry_date

                if update_data and record_id:
                    await db.update(
                        "process_history",
                        filters={"id": record_id},
                        data=update_data
                    )
                    logger.info(f"Updated process_history for {process_name}: {update_data}")
                else:
                    logger.debug(f"No fields to update for {process_name}")
            else:
                # For Edit: record not found, do NOT insert
                logger.warning(f"Record not found for {process_name} + {hostname} + {hospital_code} + {pid}, skipping (no insert for edit)")
        else:
            # For Add: check by process_name + hostname + hospital_code (all 3 must match to be duplicate)
            if hostname and hospital_code:
                existing = await db.select(
                    "process_history",
                    filters={"process_name": process_name, "hostname": hostname, "hospital_code": hospital_code},
                    limit=1
                )

            if existing:
                # For Add: duplicate found, do not insert
                logger.warning(f"Duplicate found for {process_name} + {hostname} + {hospital_code}, skipping insert")
            else:
                # INSERT new record
                now = get_thai_iso()
                insert_data = {
                    "process_name": process_name,
                    "pid": pid,
                    "status": "running",
                    "hospital_code": hospital_code,
                    "hospital_name": hospital_name,
                    "hostname": hostname,
                    "program_path": program_path,
                    "cpu_percent": 0,
                    "memory_mb": 0,
                    "memory_percent": 0,
                    "disk_read_mb": 0,
                    "disk_write_mb": 0,
                    "net_sent_mb": 0,
                    "net_recv_mb": 0,
                    "last_started": now,
                    "recorded_at": now
                }
                # Add window info if column exists (sanitize to remove DB connection strings)
                if _has_window_info_column:
                    if window_title:
                        sanitized_title = sanitize_window_title(window_title)
                        if sanitized_title:
                            insert_data["window_title"] = sanitized_title
                    if window_info:
                        # Also sanitize window_info values
                        sanitized_info = {}
                        for key, value in window_info.items():
                            if isinstance(value, str):
                                sanitized_value = sanitize_window_title(value)
                                if sanitized_value:
                                    sanitized_info[key] = sanitized_value
                            else:
                                sanitized_info[key] = value
                        if sanitized_info:
                            insert_data["window_info"] = sanitized_info

                # Add client version if column exists
                if _has_client_version_column and client_version:
                    insert_data["client_version"] = client_version

                # Add company_name, install_date, warranty_expiry_date if columns exist
                if _has_company_name_column and company_name:
                    insert_data["company_name"] = company_name
                if _has_install_date_column:
                    if install_date:
                        insert_data["install_date"] = install_date
                    if warranty_expiry_date:
                        insert_data["warranty_expiry_date"] = warranty_expiry_date

                # Remove None values
                insert_data = {k: v for k, v in insert_data.items() if v is not None}

                await db.insert("process_history", insert_data)
                logger.info(f"Inserted new process_history: {process_name}, pid={pid}, hostname={hostname}, hospital_code={hospital_code}")

    except Exception as e:
        logger.error(f"Save failed for {process_name}: {e}")
        raise


async def delete_monitored_process(process_name: str, pid: int = None, hostname: str = None) -> None:
    """Delete process from process_history table by process_name and optionally pid/hostname"""
    # Build filters - always include process_name, optionally include pid and hostname
    filters = {"process_name": process_name}
    if pid is not None:
        filters["pid"] = pid
    if hostname is not None:
        filters["hostname"] = hostname

    # Delete from process_history table only
    try:
        await db.delete(
            "process_history",
            filters=filters
        )
        logger.info(f"Deleted {process_name} (PID: {pid}, hostname: {hostname}) from process_history")
    except Exception as e:
        logger.warning(f"Could not delete from process_history: {e}")


async def get_all_monitored_processes() -> List[Dict[str, Any]]:
    """Get all monitored processes from process_history table"""
    return await db.select("process_history", order_by="recorded_at.desc")


async def clear_orphaned_process_history(hostname: str, active_process_names: List[str]) -> int:
    """Delete process_history records for processes that are no longer monitored on this host.

    Args:
        hostname: The hostname to filter records
        active_process_names: List of process names that are currently being monitored

    Returns:
        Number of records deleted
    """
    try:
        # Get all processes for this hostname
        all_records = await db.select(
            "process_history",
            filters={"hostname": hostname}
        )

        if not all_records:
            return 0

        # Find orphaned records (processes not in active list)
        deleted_count = 0
        for record in all_records:
            process_name = record.get("process_name")
            if process_name and process_name not in active_process_names:
                try:
                    await db.delete(
                        "process_history",
                        filters={
                            "hostname": hostname,
                            "process_name": process_name
                        }
                    )
                    deleted_count += 1
                    logger.info(f"Deleted orphaned process_history: {process_name} on {hostname}")
                except Exception as e:
                    logger.warning(f"Could not delete orphaned record {process_name}: {e}")

        return deleted_count
    except Exception as e:
        logger.warning(f"Error clearing orphaned process_history: {e}")
        return 0


# ============== Process History Log ==============

async def get_process_history_log(
    limit: int = 100,
    action: str = None,
    process_name: str = None,
    hospital_code: str = None
) -> List[Dict[str, Any]]:
    """Get audit log entries from process_history_log table"""
    try:
        filters = {}
        if action:
            filters["action"] = action
        if process_name:
            filters["process_name"] = process_name
        if hospital_code:
            filters["hospital_code"] = hospital_code

        result = await db.select(
            "process_history_log",
            filters=filters if filters else None,
            order_by="created_at.desc",
            limit=limit
        )
        return result
    except Exception as e:
        logger.warning(f"Could not get process_history_log: {e}")
        return []


# ============== LINE OA Settings ==============

def _decrypt_line_settings(record: Dict[str, Any]) -> Dict[str, Any]:
    """Decrypt encrypted LINE token fields in a settings record."""
    from encryption import decrypt
    if record:
        for field in ("channel_access_token", "channel_secret"):
            if field in record and record[field]:
                record[field] = decrypt(record[field])
    return record


async def get_line_settings(hostname: str = None) -> Optional[Dict[str, Any]]:
    """Get LINE OA settings from Supabase"""
    try:
        filters = {}
        if hostname:
            filters["hostname"] = hostname

        result = await db.select("line_settings", filters=filters, limit=1)
        return _decrypt_line_settings(result[0]) if result else None
    except Exception as e:
        logger.warning(f"Could not get LINE settings from Supabase: {e}")
        return None


async def save_line_settings(settings_data: Dict[str, Any], hostname: str = None) -> bool:
    """Save LINE OA settings to Supabase

    Args:
        settings_data: Dict containing channel_access_token, channel_secret, user_ids, enabled
        hostname: Optional hostname to scope settings per machine

    Returns:
        True if saved successfully, False otherwise
    """
    try:
        now = get_thai_iso()

        # Encrypt sensitive tokens before saving
        from encryption import encrypt
        data = {
            "channel_access_token": encrypt(settings_data.get("channel_access_token", "")),
            "channel_secret": encrypt(settings_data.get("channel_secret", "")),
            "user_ids": settings_data.get("user_ids", []),
            "group_ids": settings_data.get("group_ids", []),
            "enabled": settings_data.get("enabled", False),
            "webhook_url": settings_data.get("webhook_url", ""),
            "updated_at": now
        }

        if hostname:
            data["hostname"] = hostname

        # Check if record exists
        existing = await get_line_settings(hostname)

        if existing:
            # Update existing record
            record_id = existing.get("id")
            if record_id:
                await db.update("line_settings", filters={"id": record_id}, data=data)
                logger.info(f"Updated LINE settings in Supabase for hostname={hostname}")
            else:
                # Fallback: update by hostname
                await db.update("line_settings", filters={"hostname": hostname} if hostname else {}, data=data)
        else:
            # Insert new record
            data["created_at"] = now
            await db.insert("line_settings", data)
            logger.info(f"Inserted LINE settings to Supabase for hostname={hostname}")

        return True
    except Exception as e:
        logger.error(f"Could not save LINE settings to Supabase: {e}")
        return False


async def delete_line_settings(hostname: str = None) -> bool:
    """Delete LINE OA settings from Supabase"""
    try:
        filters = {}
        if hostname:
            filters["hostname"] = hostname

        await db.delete("line_settings", filters=filters)
        logger.info(f"Deleted LINE settings from Supabase for hostname={hostname}")
        return True
    except Exception as e:
        logger.error(f"Could not delete LINE settings from Supabase: {e}")
        return False


async def get_global_line_settings() -> Optional[Dict[str, Any]]:
    """Get global LINE OA settings from Supabase (any record, for syncing to all clients)

    This function returns the first LINE settings record found in Supabase,
    which can be used to sync settings to all client machines.

    Returns:
        Dict with LINE settings or None if not found
    """
    try:
        # Get any LINE settings record (most recently updated one)
        # order_by format: "column.desc" for descending order
        result = await db.select("line_settings", filters={}, limit=1, order_by="updated_at.desc")
        if result:
            settings = _decrypt_line_settings(result[0])
            logger.info(f"Got global LINE settings from Supabase (from hostname={settings.get('hostname')})")
            return settings
        return None
    except Exception as e:
        logger.warning(f"Could not get global LINE settings from Supabase: {e}")
        return None
