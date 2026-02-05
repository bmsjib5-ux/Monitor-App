"""
Database Wrapper - เลือกใช้ Supabase REST API หรือ MySQL ตาม settings
"""
from config import settings
import logging

logger = logging.getLogger(__name__)

# Import database modules
if settings.use_supabase:
    logger.info("Using Supabase REST API for database")
    from database_supabase import (
        db as _supabase_db,
        save_process_data,
        save_alert,
        get_process_history,
        get_alerts,
        get_alerts_by_type,
        get_unsent_alerts,
        mark_alert_as_sent,
        get_unsent_process_alerts,
        get_global_line_settings_for_notification,
        get_thresholds,
        update_thresholds,
        get_monitored_process,
        save_monitored_process,
        delete_monitored_process,
        get_all_monitored_processes,
        get_line_settings as get_line_settings_supabase,
        save_line_settings as save_line_settings_supabase,
        delete_line_settings as delete_line_settings_supabase,
        get_global_line_settings as get_global_line_settings_supabase
    )

    # Wrapper class for compatibility
    class Database:
        _pool = None  # For compatibility with existing code

        @classmethod
        async def connect(cls):
            await _supabase_db.connect()

        @classmethod
        async def disconnect(cls):
            await _supabase_db.disconnect()

        @classmethod
        async def init_tables(cls):
            await _supabase_db.init_tables()

        @classmethod
        async def execute(cls, query: str, *params):
            # This is for MySQL queries - not supported in Supabase REST API
            logger.warning("Direct SQL execution not supported with Supabase REST API")
            return None

        @classmethod
        async def fetch_one(cls, query: str, *params):
            # This is for MySQL queries - not supported in Supabase REST API
            logger.warning("Direct SQL fetch not supported with Supabase REST API")
            return None

        @classmethod
        async def fetch_all(cls, query: str, *params):
            # This is for MySQL queries - not supported in Supabase REST API
            logger.warning("Direct SQL fetch not supported with Supabase REST API")
            return []

else:
    logger.info("Using MySQL database")
    from database import (
        Database,
        save_process_data,
        save_alert,
        get_process_history,
        get_alerts
    )

    # Add compatibility functions for MySQL
    async def get_thresholds():
        """Get current thresholds from MySQL"""
        return await Database.fetch_one("SELECT * FROM thresholds LIMIT 1")

    async def update_thresholds(thresholds: dict):
        """Update thresholds in MySQL"""
        existing = await get_thresholds()
        if existing:
            query = """
            UPDATE thresholds
            SET cpu_threshold=%s, ram_threshold=%s, disk_io_threshold=%s, network_threshold=%s
            WHERE id=%s
            """
            await Database.execute(query, (
                thresholds.get('cpu_threshold'),
                thresholds.get('ram_threshold'),
                thresholds.get('disk_io_threshold'),
                thresholds.get('network_threshold'),
                existing['id']
            ))

    async def get_monitored_process(process_name: str):
        """Get monitored process metadata from MySQL"""
        return await Database.fetch_one(
            "SELECT * FROM monitored_processes WHERE process_name=%s",
            process_name
        )

    async def save_monitored_process(process_name: str, pid: int = None, hospital_code: str = None, hospital_name: str = None, hostname: str = None, program_path: str = None, is_edit: bool = False, window_title: str = None, window_info: dict = None):
        """
        Save monitored process metadata in MySQL

        For Add Process (is_edit=False):
        - ตรวจสอบ process_name + hostname + hospital_code ก่อน
        - ถ้าซ้ำ → ไม่ทำอะไร (ไม่ INSERT, ไม่ UPDATE)
        - ถ้าไม่ซ้ำ → INSERT ใหม่

        For Edit Process (is_edit=True):
        - ตรวจสอบ process_name + hostname + pid ก่อน
        - ถ้ามีอยู่ → UPDATE เฉพาะ hospital_name, program_path, hospital_code
        - ถ้าไม่มี → ไม่ทำอะไร (ไม่ INSERT)
        """
        existing = None

        if is_edit:
            # For Edit: check by process_name + hostname + pid
            query = "SELECT * FROM monitored_processes WHERE process_name=%s"
            params = [process_name]

            if hostname:
                query += " AND hostname=%s"
                params.append(hostname)
            if pid is not None:
                query += " AND pid=%s"
                params.append(pid)

            existing = await Database.fetch_one(query, tuple(params))

            if existing:
                # UPDATE only hospital_name, program_path, hospital_code
                update_parts = []
                update_params = []

                if hospital_name:
                    update_parts.append("hospital_name=%s")
                    update_params.append(hospital_name)
                if program_path:
                    update_parts.append("program_path=%s")
                    update_params.append(program_path)
                if hospital_code:
                    update_parts.append("hospital_code=%s")
                    update_params.append(hospital_code)

                if update_parts:
                    update_query = f"UPDATE monitored_processes SET {', '.join(update_parts)} WHERE id=%s"
                    update_params.append(existing['id'])
                    await Database.execute(update_query, tuple(update_params))
            # For Edit: if not found, do NOT insert
        else:
            # For Add: check by process_name + hostname + hospital_code
            query = "SELECT * FROM monitored_processes WHERE process_name=%s"
            params = [process_name]

            if hostname:
                query += " AND hostname=%s"
                params.append(hostname)
            if hospital_code:
                query += " AND hospital_code=%s"
                params.append(hospital_code)

            existing = await Database.fetch_one(query, tuple(params))

            if not existing:
                # INSERT new record only if not duplicate
                insert_query = """
                INSERT INTO monitored_processes (process_name, pid, hostname, hospital_code, hospital_name, program_path)
                VALUES (%s, %s, %s, %s, %s, %s)
                """
                await Database.execute(insert_query, (process_name, pid, hostname, hospital_code, hospital_name, program_path))

    async def delete_monitored_process(process_name: str, pid: int = None):
        """Delete monitored process metadata from MySQL by process_name and optionally pid"""
        if pid is not None:
            await Database.execute(
                "DELETE FROM monitored_processes WHERE process_name=%s AND pid=%s",
                (process_name, pid)
            )
        else:
            await Database.execute(
                "DELETE FROM monitored_processes WHERE process_name=%s",
                process_name
            )

    async def get_all_monitored_processes():
        """Get all monitored processes metadata from MySQL"""
        return await Database.fetch_all("SELECT * FROM monitored_processes")

# LINE settings wrapper functions
if settings.use_supabase:
    async def get_line_settings_db(hostname: str = None):
        """Get LINE settings from Supabase"""
        return await get_line_settings_supabase(hostname)

    async def save_line_settings_db(settings_data: dict, hostname: str = None):
        """Save LINE settings to Supabase"""
        return await save_line_settings_supabase(settings_data, hostname)

    async def delete_line_settings_db(hostname: str = None):
        """Delete LINE settings from Supabase"""
        return await delete_line_settings_supabase(hostname)

    async def get_global_line_settings_db():
        """Get global LINE settings from Supabase (for syncing to all clients)"""
        return await get_global_line_settings_supabase()
else:
    # MySQL fallback - not implemented, return None/False
    async def get_line_settings_db(hostname: str = None):
        """Get LINE settings - MySQL not implemented"""
        logger.warning("LINE settings storage in MySQL not implemented")
        return None

    async def save_line_settings_db(settings_data: dict, hostname: str = None):
        """Save LINE settings - MySQL not implemented"""
        logger.warning("LINE settings storage in MySQL not implemented")
        return False

    async def delete_line_settings_db(hostname: str = None):
        """Delete LINE settings - MySQL not implemented"""
        logger.warning("LINE settings storage in MySQL not implemented")
        return False

    async def get_global_line_settings_db():
        """Get global LINE settings - MySQL not implemented"""
        logger.warning("LINE settings storage in MySQL not implemented")
        return None


# Alert by type wrapper functions (for MySQL fallback)
if not settings.use_supabase:
    async def get_alerts_by_type(alert_type: str, limit: int = 100):
        """Get alerts by type - MySQL fallback"""
        return await Database.fetch_all(
            "SELECT * FROM alerts WHERE alert_type=%s ORDER BY created_at DESC LIMIT %s",
            (alert_type, limit)
        )

    async def get_unsent_alerts(alert_type: str = None, limit: int = 100):
        """Get unsent alerts - MySQL fallback"""
        if alert_type:
            return await Database.fetch_all(
                "SELECT * FROM alerts WHERE (line_sent IS NULL OR line_sent = FALSE) AND alert_type=%s ORDER BY created_at DESC LIMIT %s",
                (alert_type, limit)
            )
        return await Database.fetch_all(
            "SELECT * FROM alerts WHERE (line_sent IS NULL OR line_sent = FALSE) ORDER BY created_at DESC LIMIT %s",
            (limit,)
        )

    async def mark_alert_as_sent(alert_id: int):
        """Mark alert as sent - MySQL fallback"""
        try:
            await Database.execute(
                "UPDATE alerts SET line_sent=TRUE, line_sent_at=NOW() WHERE id=%s",
                (alert_id,)
            )
            return True
        except Exception as e:
            logger.warning(f"Could not mark alert as sent: {e}")
            return False

    async def get_unsent_process_alerts(limit: int = 50):
        """Get unsent PROCESS_STARTED and PROCESS_STOPPED alerts - MySQL fallback"""
        return await Database.fetch_all(
            """SELECT * FROM alerts
               WHERE (line_sent IS NULL OR line_sent = FALSE)
               AND alert_type IN ('PROCESS_STARTED', 'PROCESS_STOPPED')
               ORDER BY created_at DESC LIMIT %s""",
            (limit,)
        )

    async def get_global_line_settings_for_notification():
        """Get global LINE settings - MySQL fallback (not implemented)"""
        logger.warning("LINE settings storage in MySQL not implemented")
        return None


# Export all
__all__ = [
    'Database',
    'save_process_data',
    'save_alert',
    'get_process_history',
    'get_alerts',
    'get_alerts_by_type',
    'get_unsent_alerts',
    'mark_alert_as_sent',
    'get_unsent_process_alerts',
    'get_global_line_settings_for_notification',
    'get_thresholds',
    'update_thresholds',
    'get_monitored_process',
    'save_monitored_process',
    'delete_monitored_process',
    'get_all_monitored_processes',
    'get_line_settings_db',
    'save_line_settings_db',
    'delete_line_settings_db',
    'get_global_line_settings_db'
]
