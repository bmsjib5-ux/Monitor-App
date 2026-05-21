"""
MonitorApp Agent - Remote Monitoring Agent
Runs on remote servers and sends monitoring data to central server
"""
import asyncio
import aiohttp
import psutil
import socket
import platform
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional
import json
import sys
import os

# Thailand timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

def get_thai_datetime() -> datetime:
    """Get current datetime in Thai timezone"""
    return datetime.now(THAI_TZ)

def get_thai_iso() -> str:
    """Get current datetime as ISO string in Thai timezone"""
    return get_thai_datetime().isoformat()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/agent.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class MonitorAgent:
    """Agent that runs on remote servers and sends data to central server"""

    def __init__(self, central_server_url: str, api_key: str):
        self.central_server_url = central_server_url.rstrip('/')
        self.api_key = api_key
        self.host_id = self._generate_host_id()
        self.hostname = socket.gethostname()
        self.ip_address = self._get_ip_address()
        self.os_type = platform.system()
        self.monitored_processes: Dict[str, dict] = {}
        self.is_running = False
        self.session: Optional[aiohttp.ClientSession] = None

    def _generate_host_id(self) -> str:
        """Generate unique host ID based on machine info"""
        machine_id = f"{socket.gethostname()}-{platform.node()}"
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, machine_id))

    def _get_ip_address(self) -> str:
        """Get local IP address"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    async def register(self) -> bool:
        """Register this agent with central server"""
        try:
            url = f"{self.central_server_url}/api/agents/register"
            payload = {
                "hostname": self.hostname,
                "ip_address": self.ip_address,
                "os_type": self.os_type,
                "agent_version": "1.0.0"
            }
            headers = {"X-API-Key": self.api_key}

            async with self.session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    result = await response.json()
                    self.host_id = result.get("host_id", self.host_id)
                    logger.info(f"Agent registered successfully. Host ID: {self.host_id}")
                    return True
                else:
                    logger.error(f"Failed to register agent: {response.status}")
                    return False
        except Exception as e:
            logger.error(f"Error registering agent: {e}")
            return False

    async def send_heartbeat(self):
        """Send heartbeat to central server"""
        try:
            url = f"{self.central_server_url}/api/agents/heartbeat"
            payload = {
                "host_id": self.host_id,
                "timestamp": get_thai_iso(),
                "status": "online",
                "process_count": len(self.monitored_processes)
            }
            headers = {"X-API-Key": self.api_key}

            async with self.session.post(url, json=payload, headers=headers) as response:
                if response.status != 200:
                    logger.warning(f"Heartbeat failed: {response.status}")
        except Exception as e:
            logger.error(f"Error sending heartbeat: {e}")

    async def fetch_monitored_processes(self) -> list:
        """Fetch list of processes to monitor from central server"""
        try:
            url = f"{self.central_server_url}/api/agents/{self.host_id}/processes"
            headers = {"X-API-Key": self.api_key}

            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("processes", [])
                else:
                    logger.warning(f"Failed to fetch processes: {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Error fetching processes: {e}")
            return []

    def collect_process_metrics(self, process_name: str) -> Optional[dict]:
        """Collect metrics for a specific process"""
        try:
            # Find all processes with this name
            processes = [p for p in psutil.process_iter(['name', 'pid'])
                        if p.info['name'].lower() == process_name.lower()]

            if not processes:
                return {
                    "name": process_name,
                    "pid": 0,
                    "status": "Stopped",
                    "cpu_percent": 0.0,
                    "memory_mb": 0.0,
                    "memory_percent": 0.0,
                    "disk_read_mb": 0.0,
                    "disk_write_mb": 0.0,
                    "net_sent_mb": 0.0,
                    "net_recv_mb": 0.0,
                    "uptime": "Not Running",
                    "create_time": None
                }

            # Use the first process found (or we could aggregate)
            proc = processes[0]

            # Get process metrics
            cpu_percent = proc.cpu_percent(interval=0.1)
            memory_info = proc.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)
            memory_percent = proc.memory_percent()

            # Disk I/O
            try:
                io_counters = proc.io_counters()
                disk_read = io_counters.read_bytes / (1024 * 1024)
                disk_write = io_counters.write_bytes / (1024 * 1024)
            except (psutil.AccessDenied, AttributeError):
                disk_read = disk_write = 0.0

            # Calculate uptime
            create_time = proc.create_time()
            uptime_seconds = int(get_thai_datetime().timestamp() - create_time)
            hours = uptime_seconds // 3600
            minutes = (uptime_seconds % 3600) // 60
            seconds = uptime_seconds % 60
            uptime = f"{hours}:{minutes:02d}:{seconds:02d}"

            return {
                "name": process_name,
                "pid": proc.pid,
                "status": "running",
                "cpu_percent": cpu_percent,
                "memory_mb": memory_mb,
                "memory_percent": memory_percent,
                "disk_read_mb": disk_read,
                "disk_write_mb": disk_write,
                "net_sent_mb": 0.0,  # Network per-process requires special permissions
                "net_recv_mb": 0.0,
                "uptime": uptime,
                "create_time": create_time
            }

        except Exception as e:
            logger.error(f"Error collecting metrics for {process_name}: {e}")
            return None

    async def send_metrics(self, metrics: list):
        """Send collected metrics to central server"""
        try:
            url = f"{self.central_server_url}/api/agents/{self.host_id}/metrics"
            payload = {
                "host_id": self.host_id,
                "hostname": self.hostname,
                "timestamp": get_thai_iso(),
                "processes": metrics
            }
            headers = {"X-API-Key": self.api_key}

            async with self.session.post(url, json=payload, headers=headers) as response:
                if response.status != 200:
                    logger.warning(f"Failed to send metrics: {response.status}")
        except Exception as e:
            logger.error(f"Error sending metrics: {e}")

    async def monitoring_loop(self):
        """Main monitoring loop"""
        heartbeat_interval = 30  # seconds
        metrics_interval = 2  # seconds
        last_heartbeat = 0

        while self.is_running:
            try:
                current_time = get_thai_datetime().timestamp()

                # Send heartbeat
                if current_time - last_heartbeat >= heartbeat_interval:
                    await self.send_heartbeat()
                    last_heartbeat = current_time

                    # Also fetch updated process list
                    process_list = await self.fetch_monitored_processes()
                    for proc_name in process_list:
                        if proc_name not in self.monitored_processes:
                            self.monitored_processes[proc_name] = {}
                            logger.info(f"Added process to monitor: {proc_name}")

                # Collect and send metrics
                metrics = []
                for process_name in list(self.monitored_processes.keys()):
                    metric = self.collect_process_metrics(process_name)
                    if metric:
                        metrics.append(metric)

                if metrics:
                    await self.send_metrics(metrics)

                await asyncio.sleep(metrics_interval)

            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(5)

    async def start(self):
        """Start the agent"""
        os.makedirs("logs", exist_ok=True)

        logger.info(f"Starting MonitorApp Agent...")
        logger.info(f"Host: {self.hostname} ({self.ip_address})")
        logger.info(f"OS: {self.os_type}")
        logger.info(f"Central Server: {self.central_server_url}")

        self.is_running = True

        # Create aiohttp session
        self.session = aiohttp.ClientSession()

        try:
            # Register with central server
            if await self.register():
                logger.info("Agent registered successfully, starting monitoring...")
                await self.monitoring_loop()
            else:
                logger.error("Failed to register agent. Exiting.")

        finally:
            self.is_running = False
            await self.session.close()

    async def stop(self):
        """Stop the agent"""
        logger.info("Stopping agent...")
        self.is_running = False


async def main():
    """Main entry point for agent"""
    # Configuration - can be loaded from environment variables or config file
    CENTRAL_SERVER_URL = os.getenv("CENTRAL_SERVER_URL", "http://localhost:8000")
    API_KEY = os.getenv("AGENT_API_KEY", "default-api-key-change-me")

    logger.info("="*60)
    logger.info("MonitorApp Agent Starting")
    logger.info("="*60)

    agent = MonitorAgent(CENTRAL_SERVER_URL, API_KEY)

    try:
        await agent.start()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
        await agent.stop()
    except Exception as e:
        logger.error(f"Agent error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nAgent stopped by user")
