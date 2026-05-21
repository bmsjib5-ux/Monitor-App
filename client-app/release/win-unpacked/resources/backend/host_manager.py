"""
Host Manager - Manages multiple remote hosts/agents
"""
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from collections import defaultdict

from models import HostInfo, HostProcessInfo, AgentHeartbeat

logger = logging.getLogger(__name__)

# Thailand timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

def get_thai_datetime() -> datetime:
    """Get current datetime in Thai timezone"""
    return datetime.now(THAI_TZ)

def get_thai_iso() -> str:
    """Get current datetime as ISO string in Thai timezone"""
    return get_thai_datetime().isoformat()


class HostManager:
    """Manages multiple remote monitoring agents"""

    def __init__(self):
        self.hosts: Dict[str, HostInfo] = {}  # host_id -> HostInfo
        self.host_processes: Dict[str, Dict[str, HostProcessInfo]] = defaultdict(dict)  # host_id -> {process_name -> HostProcessInfo}
        self.monitored_processes_by_host: Dict[str, List[str]] = defaultdict(list)  # host_id -> [process_names]
        self.api_keys: Dict[str, str] = {}  # api_key -> host_id
        self.process_history: Dict[str, List[dict]] = defaultdict(list)  # f"{host_id}:{process_name}" -> [metrics]
        self.history_max_length = 60

    def generate_api_key(self) -> str:
        """Generate a new API key for a host"""
        return str(uuid.uuid4())

    def register_host(self, hostname: str, ip_address: Optional[str] = None,
                     os_type: str = "Windows", agent_version: str = "1.0.0") -> tuple[str, str]:
        """
        Register a new host/agent
        Returns: (host_id, api_key)
        """
        host_id = str(uuid.uuid4())
        api_key = self.generate_api_key()

        host_info = HostInfo(
            host_id=host_id,
            hostname=hostname,
            ip_address=ip_address,
            os_type=os_type,
            agent_version=agent_version,
            status="online",
            last_seen=get_thai_iso(),
            api_key=api_key
        )

        self.hosts[host_id] = host_info
        self.api_keys[api_key] = host_id

        logger.info(f"Registered new host: {hostname} ({host_id})")
        return host_id, api_key

    def verify_api_key(self, api_key: str) -> Optional[str]:
        """Verify API key and return host_id if valid"""
        return self.api_keys.get(api_key)

    def update_heartbeat(self, heartbeat: AgentHeartbeat):
        """Update host heartbeat"""
        host_id = heartbeat.host_id
        if host_id in self.hosts:
            self.hosts[host_id].status = heartbeat.status
            self.hosts[host_id].last_seen = heartbeat.timestamp
            logger.debug(f"Heartbeat received from {self.hosts[host_id].hostname}")

    def update_process_metrics(self, host_id: str, hostname: str, processes: List[dict]):
        """Update process metrics from an agent"""
        if host_id not in self.hosts:
            logger.warning(f"Received metrics from unknown host: {host_id}")
            return

        timestamp = get_thai_iso()

        for proc_data in processes:
            process_name = proc_data["name"]

            # Create HostProcessInfo
            host_process = HostProcessInfo(
                host_id=host_id,
                hostname=hostname,
                **proc_data
            )

            # Update current state
            self.host_processes[host_id][process_name] = host_process

            # Store in history
            history_key = f"{host_id}:{process_name}"
            self.process_history[history_key].append({
                "timestamp": timestamp,
                "name": process_name,
                "pid": proc_data["pid"],
                "cpu_percent": proc_data["cpu_percent"],
                "memory_mb": proc_data["memory_mb"],
                "memory_percent": proc_data["memory_percent"],
                "disk_read_mb": proc_data["disk_read_mb"],
                "disk_write_mb": proc_data["disk_write_mb"],
                "net_sent_mb": proc_data["net_sent_mb"],
                "net_recv_mb": proc_data["net_recv_mb"]
            })

            # Trim history
            if len(self.process_history[history_key]) > self.history_max_length:
                self.process_history[history_key] = self.process_history[history_key][-self.history_max_length:]

    def get_all_hosts(self) -> List[HostInfo]:
        """Get list of all registered hosts"""
        # Check for offline hosts
        now = get_thai_datetime()
        for host in self.hosts.values():
            if host.last_seen:
                # Parse ISO format with timezone info
                last_seen_str = host.last_seen
                if '+' in last_seen_str or 'Z' in last_seen_str:
                    last_seen_time = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
                else:
                    last_seen_time = datetime.fromisoformat(last_seen_str).replace(tzinfo=THAI_TZ)
                if now - last_seen_time > timedelta(minutes=2):
                    host.status = "offline"

        return list(self.hosts.values())

    def get_host(self, host_id: str) -> Optional[HostInfo]:
        """Get specific host info"""
        return self.hosts.get(host_id)

    def get_all_processes_by_host(self, host_id: str) -> List[HostProcessInfo]:
        """Get all processes for a specific host"""
        return list(self.host_processes.get(host_id, {}).values())

    def get_all_processes(self) -> List[HostProcessInfo]:
        """Get all processes from all hosts"""
        all_processes = []
        for host_processes in self.host_processes.values():
            all_processes.extend(host_processes.values())
        return all_processes

    def add_monitored_process(self, host_id: str, process_name: str) -> bool:
        """Add a process to monitor for a specific host"""
        if host_id not in self.hosts:
            return False

        if process_name not in self.monitored_processes_by_host[host_id]:
            self.monitored_processes_by_host[host_id].append(process_name)
            logger.info(f"Added process {process_name} to monitor on host {host_id}")
            return True
        return False

    def remove_monitored_process(self, host_id: str, process_name: str) -> bool:
        """Remove a process from monitoring for a specific host"""
        if host_id not in self.hosts:
            return False

        if process_name in self.monitored_processes_by_host[host_id]:
            self.monitored_processes_by_host[host_id].remove(process_name)

            # Also remove from current state
            if host_id in self.host_processes:
                self.host_processes[host_id].pop(process_name, None)

            logger.info(f"Removed process {process_name} from host {host_id}")
            return True
        return False

    def get_monitored_processes(self, host_id: str) -> List[str]:
        """Get list of processes to monitor for a specific host"""
        return self.monitored_processes_by_host.get(host_id, [])

    def get_process_history(self, host_id: str, process_name: str) -> List[dict]:
        """Get historical metrics for a process on a specific host"""
        history_key = f"{host_id}:{process_name}"
        return self.process_history.get(history_key, [])

    def remove_host(self, host_id: str) -> bool:
        """Remove a host and all its data"""
        if host_id not in self.hosts:
            return False

        # Get API key for this host
        api_key = self.hosts[host_id].api_key
        if api_key and api_key in self.api_keys:
            del self.api_keys[api_key]

        # Remove host data
        del self.hosts[host_id]
        self.host_processes.pop(host_id, None)
        self.monitored_processes_by_host.pop(host_id, None)

        # Remove history
        keys_to_remove = [k for k in self.process_history.keys() if k.startswith(f"{host_id}:")]
        for key in keys_to_remove:
            del self.process_history[key]

        logger.info(f"Removed host {host_id}")
        return True

    def get_statistics(self) -> dict:
        """Get overall statistics"""
        total_hosts = len(self.hosts)
        online_hosts = sum(1 for h in self.hosts.values() if h.status == "online")
        offline_hosts = total_hosts - online_hosts
        total_processes = sum(len(procs) for procs in self.host_processes.values())

        return {
            "total_hosts": total_hosts,
            "online_hosts": online_hosts,
            "offline_hosts": offline_hosts,
            "total_processes": total_processes
        }
