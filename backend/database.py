import aiomysql
import asyncio
from typing import Optional, List, Dict, Any
from config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    _pool: Optional[aiomysql.Pool] = None
    
    @classmethod
    async def connect(cls) -> None:
        """Create database connection pool"""
        if cls._pool is None:
            try:
                cls._pool = await aiomysql.create_pool(
                    host=settings.db_host,
                    port=settings.db_port,
                    user=settings.db_user,
                    password=settings.db_password,
                    db=settings.db_name,
                    autocommit=True,
                    minsize=1,
                    maxsize=10,
                    charset='utf8mb4'
                )
                logger.info(f"Connected to MySQL database: {settings.db_host}:{settings.db_port}/{settings.db_name}")
            except Exception as e:
                logger.error(f"Failed to connect to MySQL: {e}")
                raise
    
    @classmethod
    async def disconnect(cls) -> None:
        """Close database connection pool"""
        if cls._pool:
            cls._pool.close()
            await cls._pool.wait_closed()
            cls._pool = None
            logger.info("Disconnected from MySQL database")
    
    @classmethod
    async def execute(cls, query: str, params: tuple = None) -> int:
        """Execute a query (INSERT, UPDATE, DELETE)"""
        async with cls._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, params)
                return cur.rowcount
    
    @classmethod
    async def fetch_one(cls, query: str, params: tuple = None) -> Optional[Dict[str, Any]]:
        """Fetch single row as dictionary"""
        async with cls._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(query, params)
                return await cur.fetchone()
    
    @classmethod
    async def fetch_all(cls, query: str, params: tuple = None) -> List[Dict[str, Any]]:
        """Fetch all rows as list of dictionaries"""
        async with cls._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(query, params)
                return await cur.fetchall()
    
    @classmethod
    async def init_tables(cls) -> None:
        """Initialize database tables"""
        create_process_history_table = """
        CREATE TABLE IF NOT EXISTS process_history (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            process_name VARCHAR(255) NOT NULL,
            pid INT,
            status VARCHAR(50),
            cpu_percent FLOAT,
            memory_mb FLOAT,
            memory_percent FLOAT,
            disk_read_mb FLOAT,
            disk_write_mb FLOAT,
            net_sent_mb FLOAT,
            net_recv_mb FLOAT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_process_name (process_name),
            INDEX idx_recorded_at (recorded_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        
        create_alerts_table = """
        CREATE TABLE IF NOT EXISTS alerts (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            process_name VARCHAR(255) NOT NULL,
            alert_type VARCHAR(50) NOT NULL,
            message TEXT,
            value FLOAT,
            threshold FLOAT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_process_name (process_name),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        
        create_thresholds_table = """
        CREATE TABLE IF NOT EXISTS thresholds (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cpu_threshold FLOAT DEFAULT 80.0,
            ram_threshold FLOAT DEFAULT 80.0,
            disk_io_threshold FLOAT DEFAULT 100.0,
            network_threshold FLOAT DEFAULT 50.0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        
        await cls.execute(create_process_history_table)
        await cls.execute(create_alerts_table)
        await cls.execute(create_thresholds_table)
        
        # Insert default thresholds if not exists
        existing = await cls.fetch_one("SELECT id FROM thresholds LIMIT 1")
        if not existing:
            await cls.execute(
                "INSERT INTO thresholds (cpu_threshold, ram_threshold, disk_io_threshold, network_threshold) VALUES (%s, %s, %s, %s)",
                (settings.cpu_threshold, settings.ram_threshold, settings.disk_io_threshold, settings.network_threshold)
            )
        
        logger.info("Database tables initialized")


# Helper functions for process history
async def save_process_data(process_data: Dict[str, Any]) -> None:
    """Save process data to database - Update if PID exists, Insert if new"""
    pid = process_data.get('pid')

    # Check if PID already exists
    existing = await Database.fetch_one(
        "SELECT id FROM process_history WHERE pid = %s LIMIT 1",
        (pid,)
    )

    if existing:
        # Update existing record
        query = """
        UPDATE process_history
        SET process_name=%s, status=%s, cpu_percent=%s, memory_mb=%s, memory_percent=%s,
            disk_read_mb=%s, disk_write_mb=%s, net_sent_mb=%s, net_recv_mb=%s, recorded_at=NOW()
        WHERE pid=%s
        """
        await Database.execute(query, (
            process_data.get('name'),
            process_data.get('status'),
            process_data.get('cpu_percent'),
            process_data.get('memory_mb'),
            process_data.get('memory_percent'),
            process_data.get('disk_read_mb'),
            process_data.get('disk_write_mb'),
            process_data.get('net_sent_mb'),
            process_data.get('net_recv_mb'),
            pid
        ))
    else:
        # Insert new record
        query = """
        INSERT INTO process_history
        (process_name, pid, status, cpu_percent, memory_mb, memory_percent, disk_read_mb, disk_write_mb, net_sent_mb, net_recv_mb)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        await Database.execute(query, (
            process_data.get('name'),
            pid,
            process_data.get('status'),
            process_data.get('cpu_percent'),
            process_data.get('memory_mb'),
            process_data.get('memory_percent'),
            process_data.get('disk_read_mb'),
            process_data.get('disk_write_mb'),
            process_data.get('net_sent_mb'),
            process_data.get('net_recv_mb')
        ))


async def save_alert(alert_data: Dict[str, Any]) -> None:
    """Save alert to database"""
    query = """
    INSERT INTO alerts (process_name, alert_type, message, value, threshold)
    VALUES (%s, %s, %s, %s, %s)
    """
    await Database.execute(query, (
        alert_data.get('process_name'),
        alert_data.get('type'),
        alert_data.get('message'),
        alert_data.get('value'),
        alert_data.get('threshold')
    ))


async def get_process_history(process_name: str, limit: int = 60) -> List[Dict[str, Any]]:
    """Get process history from database"""
    query = """
    SELECT * FROM process_history 
    WHERE process_name = %s 
    ORDER BY recorded_at DESC 
    LIMIT %s
    """
    return await Database.fetch_all(query, (process_name, limit))


async def get_alerts(limit: int = 100) -> List[Dict[str, Any]]:
    """Get recent alerts from database"""
    query = """
    SELECT * FROM alerts 
    ORDER BY created_at DESC 
    LIMIT %s
    """
    return await Database.fetch_all(query, (limit,))
