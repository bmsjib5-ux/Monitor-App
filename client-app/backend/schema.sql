-- ============================================
-- Monitor App Database Schema
-- MySQL 5.7+ / MariaDB 10.2+
-- ============================================

-- Create database
CREATE DATABASE IF NOT EXISTS monitor_app 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE monitor_app;

-- ============================================
-- Table: process_history
-- เก็บประวัติ metrics ของ process
-- ============================================
CREATE TABLE IF NOT EXISTS process_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL COMMENT 'ชื่อ process',
    pid INT COMMENT 'Process ID',
    status VARCHAR(50) COMMENT 'สถานะ (running, stopped, etc.)',
    cpu_percent FLOAT COMMENT 'CPU usage (%)',
    memory_mb FLOAT COMMENT 'Memory usage (MB)',
    memory_percent FLOAT COMMENT 'Memory usage (%)',
    disk_read_mb FLOAT COMMENT 'Disk read (MB/s)',
    disk_write_mb FLOAT COMMENT 'Disk write (MB/s)',
    net_sent_mb FLOAT COMMENT 'Network sent (MB/s)',
    net_recv_mb FLOAT COMMENT 'Network received (MB/s)',
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'เวลาที่บันทึก',
    INDEX idx_process_name (process_name),
    INDEX idx_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ประวัติ metrics ของ process';

-- ============================================
-- Table: alerts
-- เก็บ alerts ที่เกิดขึ้น
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL COMMENT 'ชื่อ process',
    alert_type VARCHAR(50) NOT NULL COMMENT 'ประเภท alert (cpu, ram, disk, network)',
    message TEXT COMMENT 'ข้อความแจ้งเตือน',
    value FLOAT COMMENT 'ค่าที่ทำให้เกิด alert',
    threshold FLOAT COMMENT 'ค่า threshold ที่ตั้งไว้',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'เวลาที่เกิด alert',
    INDEX idx_process_name (process_name),
    INDEX idx_alert_type (alert_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='alerts ที่เกิดขึ้น';

-- ============================================
-- Table: thresholds
-- เก็บค่า threshold settings
-- ============================================
CREATE TABLE IF NOT EXISTS thresholds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cpu_threshold FLOAT DEFAULT 80.0 COMMENT 'CPU threshold (%)',
    ram_threshold FLOAT DEFAULT 80.0 COMMENT 'RAM threshold (%)',
    disk_io_threshold FLOAT DEFAULT 100.0 COMMENT 'Disk I/O threshold (MB/s)',
    network_threshold FLOAT DEFAULT 50.0 COMMENT 'Network threshold (MB/s)',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'เวลาอัพเดทล่าสุด'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='threshold settings';

-- ============================================
-- Table: monitored_processes
-- เก็บรายการ process ที่ต้องการ monitor
-- ============================================
CREATE TABLE IF NOT EXISTS monitored_processes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL COMMENT 'ชื่อ process',
    pid INT COMMENT 'Process ID',
    hostname VARCHAR(255) COMMENT 'ชื่อเครื่อง',
    hospital_code VARCHAR(5) COMMENT 'รหัสโรงพยาบาล',
    hospital_name VARCHAR(255) COMMENT 'ชื่อโรงพยาบาล',
    program_path TEXT COMMENT 'path ของไฟล์ executable',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'กำลัง monitor อยู่หรือไม่',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'เวลาที่เพิ่ม',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'เวลาอัพเดทล่าสุด',
    INDEX idx_process_name (process_name),
    INDEX idx_pid (pid),
    INDEX idx_hostname (hostname),
    INDEX idx_hospital_code (hospital_code),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='รายการ process ที่ monitor';

-- ============================================
-- Insert default thresholds
-- ============================================
INSERT INTO thresholds (cpu_threshold, ram_threshold, disk_io_threshold, network_threshold) 
SELECT 80.0, 80.0, 100.0, 50.0
WHERE NOT EXISTS (SELECT 1 FROM thresholds LIMIT 1);

-- ============================================
-- Useful queries
-- ============================================

-- Get latest metrics for all processes
-- SELECT * FROM process_history 
-- WHERE recorded_at >= NOW() - INTERVAL 1 HOUR
-- ORDER BY recorded_at DESC;

-- Get alert summary by process
-- SELECT process_name, alert_type, COUNT(*) as count 
-- FROM alerts 
-- WHERE created_at >= NOW() - INTERVAL 24 HOUR
-- GROUP BY process_name, alert_type;

-- Clean up old data (keep last 7 days)
-- DELETE FROM process_history WHERE recorded_at < NOW() - INTERVAL 7 DAY;
-- DELETE FROM alerts WHERE created_at < NOW() - INTERVAL 30 DAY;
