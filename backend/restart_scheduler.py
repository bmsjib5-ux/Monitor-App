"""
Restart Scheduler Module
Handles automatic process restart based on schedule configuration
"""
import asyncio
import logging
import subprocess
import psutil
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Any
import json
import os

from bms_log_monitor import BMSLogMonitor, is_bms_process

# Thailand timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

logger = logging.getLogger(__name__)

class RestartScheduler:
    """Manages automatic process restart and auto-start schedules"""

    def __init__(self):
        self.schedules: Dict[str, Dict[str, Any]] = {}  # key: "process_name:hostname" for restart
        self.auto_start_schedules: Dict[str, Dict[str, Any]] = {}  # key: "process_name:hostname" for auto-start
        self.running = False
        self._task: Optional[asyncio.Task] = None
        self._schedule_file = self._get_schedule_file_path()
        self._auto_start_file = self._get_auto_start_file_path()
        self._monitor = None  # Reference to ProcessMonitor instance
        self._load_schedules()
        self._load_auto_start_schedules()

    def set_monitor(self, monitor):
        """Set reference to ProcessMonitor instance for adding processes to monitoring"""
        self._monitor = monitor
        logger.info("ProcessMonitor reference set in RestartScheduler")

    def _get_schedule_file_path(self) -> str:
        """Get path for storing schedules persistently"""
        if os.name == 'nt':  # Windows
            app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
            config_dir = os.path.join(app_data, 'MonitorApp', 'config')
        else:
            config_dir = os.path.join(os.path.expanduser('~'), '.monitorapp')
        os.makedirs(config_dir, exist_ok=True)
        return os.path.join(config_dir, 'restart_schedules.json')

    def _get_auto_start_file_path(self) -> str:
        """Get path for storing auto-start schedules persistently"""
        if os.name == 'nt':  # Windows
            app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
            config_dir = os.path.join(app_data, 'MonitorApp', 'config')
        else:
            config_dir = os.path.join(os.path.expanduser('~'), '.monitorapp')
        os.makedirs(config_dir, exist_ok=True)
        return os.path.join(config_dir, 'auto_start_schedules.json')

    def _load_schedules(self):
        """Load schedules from file"""
        try:
            if os.path.exists(self._schedule_file):
                with open(self._schedule_file, 'r', encoding='utf-8') as f:
                    self.schedules = json.load(f)
                logger.info(f"Loaded {len(self.schedules)} restart schedules")
        except Exception as e:
            logger.error(f"Error loading schedules: {e}")
            self.schedules = {}

    def _save_schedules(self):
        """Save schedules to file"""
        try:
            with open(self._schedule_file, 'w', encoding='utf-8') as f:
                json.dump(self.schedules, f, indent=2, ensure_ascii=False)
            logger.debug("Schedules saved successfully")
        except Exception as e:
            logger.error(f"Error saving schedules: {e}")

    def _load_auto_start_schedules(self):
        """Load auto-start schedules from file"""
        try:
            if os.path.exists(self._auto_start_file):
                with open(self._auto_start_file, 'r', encoding='utf-8') as f:
                    self.auto_start_schedules = json.load(f)
                logger.info(f"Loaded {len(self.auto_start_schedules)} auto-start schedules")
        except Exception as e:
            logger.error(f"Error loading auto-start schedules: {e}")
            self.auto_start_schedules = {}

    def _save_auto_start_schedules(self):
        """Save auto-start schedules to file"""
        try:
            with open(self._auto_start_file, 'w', encoding='utf-8') as f:
                json.dump(self.auto_start_schedules, f, indent=2, ensure_ascii=False)
            logger.debug("Auto-start schedules saved successfully")
        except Exception as e:
            logger.error(f"Error saving auto-start schedules: {e}")

    def update_schedule(self, process_name: str, hostname: str, schedule: Dict[str, Any], program_path: Optional[str] = None):
        """Update or create a restart schedule for a process"""
        key = f"{process_name}:{hostname}"

        if not schedule.get('enabled', False) or schedule.get('type') == 'none':
            # Remove schedule if disabled
            if key in self.schedules:
                del self.schedules[key]
                logger.info(f"Removed restart schedule for {key}")
        else:
            self.schedules[key] = {
                'process_name': process_name,
                'hostname': hostname,
                'program_path': program_path,
                'type': schedule.get('type'),
                'intervalMinutes': schedule.get('intervalMinutes', 0),
                'intervalSeconds': schedule.get('intervalSeconds', 0),
                'dailyTime': schedule.get('dailyTime'),
                'enabled': schedule.get('enabled', False),
                'last_restart': None,
                'next_restart': self._calculate_next_restart(schedule)
            }
            logger.info(f"Updated restart schedule for {key}: {schedule}")

        self._save_schedules()

    def get_schedule(self, process_name: str, hostname: str) -> Optional[Dict[str, Any]]:
        """Get restart schedule for a process"""
        key = f"{process_name}:{hostname}"
        return self.schedules.get(key)

    def update_auto_start_schedule(self, process_name: str, hostname: str, schedule: Dict[str, Any], program_path: Optional[str] = None):
        """Update or create an auto-start schedule for a process"""
        key = f"{process_name}:{hostname}"

        if not schedule.get('enabled', False) or schedule.get('type') == 'none':
            # Remove schedule if disabled
            if key in self.auto_start_schedules:
                del self.auto_start_schedules[key]
                logger.info(f"Removed auto-start schedule for {key}")
        else:
            self.auto_start_schedules[key] = {
                'process_name': process_name,
                'hostname': hostname,
                'program_path': program_path,
                'type': schedule.get('type'),
                'intervalMinutes': schedule.get('intervalMinutes', 0),
                'intervalSeconds': schedule.get('intervalSeconds', 0),
                'dailyTime': schedule.get('dailyTime'),
                'enabled': schedule.get('enabled', False),
                'last_check': None,
                'next_check': self._calculate_next_check(schedule)
            }
            logger.info(f"Updated auto-start schedule for {key}: {schedule}")

        self._save_auto_start_schedules()

    def get_auto_start_schedule(self, process_name: str, hostname: str) -> Optional[Dict[str, Any]]:
        """Get auto-start schedule for a process"""
        key = f"{process_name}:{hostname}"
        return self.auto_start_schedules.get(key)

    def _calculate_next_check(self, schedule: Dict[str, Any], from_time: Optional[datetime] = None) -> Optional[str]:
        """Calculate next auto-start check time based on schedule"""
        now = from_time or datetime.now(THAI_TZ)

        if schedule.get('type') == 'interval':
            minutes = schedule.get('intervalMinutes', 0) or 0
            seconds = schedule.get('intervalSeconds', 0) or 0
            total_seconds = minutes * 60 + seconds
            if total_seconds > 0:
                next_time = now + timedelta(seconds=total_seconds)
                return next_time.isoformat()

        elif schedule.get('type') == 'daily':
            daily_time = schedule.get('dailyTime', '06:00')
            if daily_time:
                try:
                    hour, minute = map(int, daily_time.split(':'))
                    next_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    if next_time <= now:
                        next_time += timedelta(days=1)
                    return next_time.isoformat()
                except Exception as e:
                    logger.error(f"Error parsing daily time for auto-start: {e}")

        return None

    def _calculate_next_restart(self, schedule: Dict[str, Any], from_time: Optional[datetime] = None) -> Optional[str]:
        """Calculate next restart time based on schedule"""
        now = from_time or datetime.now(THAI_TZ)

        if schedule.get('type') == 'interval':
            minutes = schedule.get('intervalMinutes', 0) or 0
            seconds = schedule.get('intervalSeconds', 0) or 0
            total_seconds = minutes * 60 + seconds
            if total_seconds > 0:
                next_time = now + timedelta(seconds=total_seconds)
                return next_time.isoformat()

        elif schedule.get('type') == 'daily':
            daily_time = schedule.get('dailyTime', '06:00')
            if daily_time:
                try:
                    hour, minute = map(int, daily_time.split(':'))
                    next_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    if next_time <= now:
                        next_time += timedelta(days=1)
                    return next_time.isoformat()
                except Exception as e:
                    logger.error(f"Error parsing daily time: {e}")

        return None

    async def start(self):
        """Start the scheduler background task"""
        if self.running:
            return

        self.running = True
        self._task = asyncio.create_task(self._scheduler_loop())
        logger.info("Restart scheduler started")

    async def stop(self):
        """Stop the scheduler"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Restart scheduler stopped")

    async def _scheduler_loop(self):
        """Main scheduler loop - checks every 10 seconds"""
        while self.running:
            try:
                await self._check_schedules()
                await self._check_auto_start_schedules()
                await asyncio.sleep(10)  # Check every 10 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
                await asyncio.sleep(10)

    async def _check_schedules(self):
        """Check all schedules and restart processes if needed"""
        now = datetime.now(THAI_TZ)

        for key, schedule in list(self.schedules.items()):
            if not schedule.get('enabled', False):
                continue

            next_restart = schedule.get('next_restart')
            if not next_restart:
                continue

            try:
                next_restart_time = datetime.fromisoformat(next_restart)
                if now >= next_restart_time:
                    # Time to restart
                    process_name = schedule.get('process_name')
                    program_path = schedule.get('program_path')

                    logger.info(f"Scheduled restart triggered for {process_name}")

                    # Check if this is a BMS process and if Gateway has pending work
                    if is_bms_process(process_name):
                        bms_monitor = BMSLogMonitor(process_name)
                        if bms_monitor.is_any_thread_working():
                            logger.info(f"BMS process {process_name} has pending work (heartbeat > 0), postponing restart")
                            # Don't update next_restart, will try again next check (every 10 seconds)
                            continue

                    # Perform restart
                    success = await self._restart_process(process_name, program_path)

                    # Update schedule
                    schedule['last_restart'] = now.isoformat()
                    schedule['next_restart'] = self._calculate_next_restart(schedule, now)

                    if success:
                        logger.info(f"Successfully restarted {process_name}")
                    else:
                        logger.error(f"Failed to restart {process_name}")

                    self._save_schedules()

            except Exception as e:
                logger.error(f"Error checking schedule for {key}: {e}")

    async def _check_auto_start_schedules(self):
        """Check all auto-start schedules and start processes if stopped"""
        now = datetime.now(THAI_TZ)

        for key, schedule in list(self.auto_start_schedules.items()):
            if not schedule.get('enabled', False):
                continue

            next_check = schedule.get('next_check')
            if not next_check:
                continue

            try:
                next_check_time = datetime.fromisoformat(next_check)
                if now >= next_check_time:
                    # Time to check if process is running
                    process_name = schedule.get('process_name')
                    program_path = schedule.get('program_path')

                    logger.info(f"Auto-start check triggered for {process_name}")

                    # Check if process is running
                    is_running = self._is_process_running(process_name)

                    if not is_running:
                        # Process is not running, start it
                        logger.info(f"Process {process_name} is not running, attempting to start...")
                        success = await self._start_process(process_name, program_path)

                        if success:
                            logger.info(f"Successfully auto-started {process_name}")
                        else:
                            logger.error(f"Failed to auto-start {process_name}")
                    else:
                        logger.debug(f"Process {process_name} is already running, no action needed")

                    # Update schedule
                    schedule['last_check'] = now.isoformat()
                    schedule['next_check'] = self._calculate_next_check(schedule, now)

                    self._save_auto_start_schedules()

            except Exception as e:
                logger.error(f"Error checking auto-start schedule for {key}: {e}")

    def _is_process_running(self, process_name: str) -> bool:
        """Check if a process is currently running"""
        try:
            for proc in psutil.process_iter(['name']):
                try:
                    if proc.info['name'] == process_name:
                        return True
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return False
        except Exception as e:
            logger.error(f"Error checking if process is running: {e}")
            return False

    async def _start_process(self, process_name: str, program_path: Optional[str]) -> bool:
        """Start a process without killing it first"""
        try:
            # Strip quotes from path if present
            if program_path:
                program_path = program_path.strip('"').strip("'")
                logger.debug(f"Checking program_path: {program_path}, exists: {os.path.exists(program_path)}")

            if program_path and os.path.exists(program_path):
                logger.info(f"Starting process from: {program_path}")

                # Use subprocess to start the process
                if os.name == 'nt':  # Windows
                    # Start detached from current process
                    subprocess.Popen(
                        [program_path],
                        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
                    )
                else:  # Linux/Mac
                    subprocess.Popen(
                        [program_path],
                        start_new_session=True
                    )

                # Wait for process to start then add to monitoring
                await asyncio.sleep(1)
                if self._monitor:
                    try:
                        self._monitor.add_process(process_name)
                        logger.info(f"Added {process_name} to monitoring after auto-start")
                    except Exception as e:
                        logger.warning(f"Could not add {process_name} to monitoring: {e}")

                return True
            else:
                logger.warning(f"Cannot start process: program_path not set or doesn't exist: {program_path}")
                return False

        except Exception as e:
            logger.error(f"Error starting process {process_name}: {e}")
            return False

    async def _restart_process(self, process_name: str, program_path: Optional[str]) -> bool:
        """Force kill and restart a process"""
        try:
            # Strip quotes from path if present
            if program_path:
                program_path = program_path.strip('"').strip("'")

            # Find and kill the process
            killed = False
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    if proc.info['name'] == process_name:
                        logger.info(f"Killing process {process_name} (PID: {proc.info['pid']})")
                        proc.kill()
                        killed = True
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

            if killed:
                # Wait a moment for process to fully terminate
                await asyncio.sleep(2)

            # Start the process if program_path is provided
            if program_path and os.path.exists(program_path):
                logger.info(f"Starting process from: {program_path}")

                # Use subprocess to start the process
                if os.name == 'nt':  # Windows
                    # Start detached from current process
                    subprocess.Popen(
                        [program_path],
                        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
                    )
                else:  # Linux/Mac
                    subprocess.Popen(
                        [program_path],
                        start_new_session=True
                    )

                # Wait for process to start then add to monitoring
                await asyncio.sleep(1)
                if self._monitor:
                    try:
                        self._monitor.add_process(process_name)
                        logger.info(f"Added {process_name} to monitoring after restart")
                    except Exception as e:
                        logger.warning(f"Could not add {process_name} to monitoring: {e}")

                return True
            else:
                logger.warning(f"Cannot start process: program_path not set or doesn't exist: {program_path}")
                return killed  # Return True if at least killed

        except Exception as e:
            logger.error(f"Error restarting process {process_name}: {e}")
            return False


# Global scheduler instance
restart_scheduler = RestartScheduler()
