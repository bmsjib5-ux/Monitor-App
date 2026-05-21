"""
Database Setup Script for Monitor App
สคริปต์สำหรับติดตั้งและตั้งค่าฐานข้อมูล MySQL
"""

import asyncio
import aiomysql
import sys
from config import settings

# SQL statements for creating tables
CREATE_DATABASE = f"""
CREATE DATABASE IF NOT EXISTS {settings.db_name} 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci
"""

CREATE_PROCESS_HISTORY_TABLE = """
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

CREATE_ALERTS_TABLE = """
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

CREATE_THRESHOLDS_TABLE = """
CREATE TABLE IF NOT EXISTS thresholds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cpu_threshold FLOAT DEFAULT 80.0,
    ram_threshold FLOAT DEFAULT 80.0,
    disk_io_threshold FLOAT DEFAULT 100.0,
    network_threshold FLOAT DEFAULT 50.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

CREATE_MONITORED_PROCESSES_TABLE = """
CREATE TABLE IF NOT EXISTS monitored_processes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    process_name VARCHAR(191) NOT NULL UNIQUE,
    executable_path TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_process_name (process_name),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

INSERT_DEFAULT_THRESHOLDS = """
INSERT INTO thresholds (cpu_threshold, ram_threshold, disk_io_threshold, network_threshold) 
SELECT %s, %s, %s, %s
WHERE NOT EXISTS (SELECT 1 FROM thresholds LIMIT 1)
"""


async def setup_database():
    """Main setup function"""
    print("=" * 50)
    print("Monitor App - Database Setup")
    print("=" * 50)
    print()
    
    # Step 1: Connect without database to create it
    print(f"[1/5] Connecting to MySQL server at {settings.db_host}:{settings.db_port}...")
    try:
        conn = await aiomysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            charset='utf8mb4'
        )
        print("      Connected successfully!")
    except Exception as e:
        print(f"      [ERROR] Failed to connect: {e}")
        print()
        print("Please check:")
        print(f"  - MySQL server is running on {settings.db_host}:{settings.db_port}")
        print(f"  - User '{settings.db_user}' exists and has correct password")
        return False
    
    # Step 2: Create database
    print(f"[2/5] Creating database '{settings.db_name}'...")
    try:
        async with conn.cursor() as cur:
            await cur.execute(CREATE_DATABASE)
        print(f"      Database '{settings.db_name}' created/verified!")
    except Exception as e:
        print(f"      [ERROR] Failed to create database: {e}")
        conn.close()
        return False
    
    conn.close()
    
    # Step 3: Connect to database and create tables
    print(f"[3/5] Connecting to database '{settings.db_name}'...")
    try:
        conn = await aiomysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            db=settings.db_name,
            charset='utf8mb4'
        )
        print("      Connected to database!")
    except Exception as e:
        print(f"      [ERROR] Failed to connect to database: {e}")
        return False
    
    # Step 4: Create tables
    print("[4/5] Creating tables...")
    tables = [
        ("process_history", CREATE_PROCESS_HISTORY_TABLE),
        ("alerts", CREATE_ALERTS_TABLE),
        ("thresholds", CREATE_THRESHOLDS_TABLE),
        ("monitored_processes", CREATE_MONITORED_PROCESSES_TABLE),
    ]
    
    try:
        async with conn.cursor() as cur:
            for table_name, sql in tables:
                await cur.execute(sql)
                print(f"      - Table '{table_name}' created/verified")
    except Exception as e:
        print(f"      [ERROR] Failed to create tables: {e}")
        conn.close()
        return False
    
    # Step 5: Insert default data
    print("[5/5] Inserting default data...")
    try:
        async with conn.cursor() as cur:
            await cur.execute(INSERT_DEFAULT_THRESHOLDS, (
                settings.cpu_threshold,
                settings.ram_threshold,
                settings.disk_io_threshold,
                settings.network_threshold
            ))
            await conn.commit()
        print("      Default thresholds inserted!")
    except Exception as e:
        print(f"      [WARNING] {e}")
    
    conn.close()
    
    print()
    print("=" * 50)
    print("Database setup completed successfully!")
    print("=" * 50)
    print()
    print("Database Configuration:")
    print(f"  Host:     {settings.db_host}")
    print(f"  Port:     {settings.db_port}")
    print(f"  User:     {settings.db_user}")
    print(f"  Database: {settings.db_name}")
    print()
    print("Tables Created:")
    print("  - process_history  (stores process metrics history)")
    print("  - alerts           (stores alert notifications)")
    print("  - thresholds       (stores threshold settings)")
    print("  - monitored_processes (stores monitored process list)")
    print()
    
    return True


async def verify_connection():
    """Verify database connection"""
    print("Verifying database connection...")
    try:
        conn = await aiomysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            db=settings.db_name,
            charset='utf8mb4'
        )
        
        async with conn.cursor() as cur:
            await cur.execute("SHOW TABLES")
            tables = await cur.fetchall()
            print(f"Connection OK! Found {len(tables)} tables.")
            
        conn.close()
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        asyncio.run(verify_connection())
    else:
        success = asyncio.run(setup_database())
        sys.exit(0 if success else 1)
