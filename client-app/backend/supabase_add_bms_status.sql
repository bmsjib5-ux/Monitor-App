-- Migration: Add BMS Gateway Status columns to process_history table
-- วันที่: 2026-01-23
-- คำอธิบาย: เพิ่ม columns สำหรับเก็บสถานะ BMS HOSxP LIS Gateway จาก Log files

-- =====================================================
-- เพิ่ม columns สำหรับ BMS Gateway Status
-- =====================================================

-- สถานะ Gateway (running/stopped/unknown)
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_gateway_status VARCHAR(20);

-- สถานะการเชื่อมต่อ DB HOSxP (connected/disconnected/unknown)
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_hosxp_db_status VARCHAR(20);

-- สถานะการเชื่อมต่อ DB Gateway (connected/disconnected/unknown)
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_gateway_db_status VARCHAR(20);

-- เวลา Heartbeat ล่าสุด
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_last_heartbeat TIMESTAMPTZ;

-- Heartbeat stale flag
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_heartbeat_stale BOOLEAN DEFAULT FALSE;

-- Log path ที่ใช้อ่าน
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_log_path TEXT;

-- Error ล่าสุดของ HOSxP DB
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_hosxp_db_error TEXT;

-- Error ล่าสุดของ Gateway DB
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS bms_gateway_db_error TEXT;

-- =====================================================
-- เพิ่ม Comments อธิบาย columns
-- =====================================================

COMMENT ON COLUMN process_history.bms_gateway_status IS 'สถานะ BMS Gateway: running, stopped, unknown';
COMMENT ON COLUMN process_history.bms_hosxp_db_status IS 'สถานะเชื่อมต่อ HOSxP DB: connected, disconnected, unknown';
COMMENT ON COLUMN process_history.bms_gateway_db_status IS 'สถานะเชื่อมต่อ Gateway DB: connected, disconnected, unknown';
COMMENT ON COLUMN process_history.bms_last_heartbeat IS 'เวลา Heartbeat ล่าสุดจาก System Log';
COMMENT ON COLUMN process_history.bms_heartbeat_stale IS 'True หาก Heartbeat เก่าเกิน 30 วินาที';
COMMENT ON COLUMN process_history.bms_log_path IS 'Path ของ BMS Log folder';
COMMENT ON COLUMN process_history.bms_hosxp_db_error IS 'Error message ล่าสุดของการเชื่อมต่อ HOSxP DB';
COMMENT ON COLUMN process_history.bms_gateway_db_error IS 'Error message ล่าสุดของการเชื่อมต่อ Gateway DB';

-- =====================================================
-- สร้าง Index สำหรับค้นหา
-- =====================================================

-- Index สำหรับค้นหาตาม BMS DB status
CREATE INDEX IF NOT EXISTS idx_process_history_bms_hosxp_status
ON process_history (bms_hosxp_db_status);

CREATE INDEX IF NOT EXISTS idx_process_history_bms_gateway_status
ON process_history (bms_gateway_db_status);

-- =====================================================
-- สร้างตาราง bms_status_history (Optional - สำหรับเก็บประวัติแยก)
-- =====================================================

CREATE TABLE IF NOT EXISTS bms_status_history (
    id BIGSERIAL PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255),
    hospital_code VARCHAR(10),
    hospital_name VARCHAR(255),

    -- Gateway status
    gateway_status VARCHAR(20) DEFAULT 'unknown',
    gateway_last_event VARCHAR(50),
    gateway_last_event_time TIMESTAMPTZ,

    -- Heartbeat
    last_heartbeat TIMESTAMPTZ,
    heartbeat_stale BOOLEAN DEFAULT FALSE,

    -- DB Connection status
    hosxp_db_status VARCHAR(20) DEFAULT 'unknown',
    hosxp_db_host VARCHAR(255),
    hosxp_db_error TEXT,

    gateway_db_status VARCHAR(20) DEFAULT 'unknown',
    gateway_db_host VARCHAR(255),
    gateway_db_error TEXT,

    -- Thread info
    active_threads INTEGER DEFAULT 0,

    -- Log path
    log_path TEXT,

    -- Timestamps
    recorded_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_gateway_status CHECK (gateway_status IN ('running', 'stopped', 'unknown')),
    CONSTRAINT chk_hosxp_db_status CHECK (hosxp_db_status IN ('connected', 'disconnected', 'unknown')),
    CONSTRAINT chk_gateway_db_status CHECK (gateway_db_status IN ('connected', 'disconnected', 'unknown'))
);

-- Index สำหรับ bms_status_history
CREATE INDEX IF NOT EXISTS idx_bms_status_history_process
ON bms_status_history (process_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_bms_status_history_hospital
ON bms_status_history (hospital_code, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_bms_status_history_status
ON bms_status_history (hosxp_db_status, gateway_db_status);

-- Comments
COMMENT ON TABLE bms_status_history IS 'ประวัติสถานะ BMS HOSxP LIS Gateway จาก Log files';

-- =====================================================
-- เพิ่ม Alert Types สำหรับ BMS
-- =====================================================

-- ตรวจสอบว่า alerts table มี column alert_type หรือไม่
-- ถ้ามี ให้เพิ่ม check constraint (optional)
-- ALTER TABLE alerts DROP CONSTRAINT IF EXISTS chk_alert_type;
-- ALTER TABLE alerts ADD CONSTRAINT chk_alert_type CHECK (
--     alert_type IN (
--         'CPU', 'RAM', 'DISK_IO', 'NETWORK',
--         'PROCESS_STOPPED', 'PROCESS_STARTED',
--         'BMS_DB_HOSXP_DISCONNECTED', 'BMS_DB_HOSXP_RECONNECTED',
--         'BMS_DB_GATEWAY_DISCONNECTED', 'BMS_DB_GATEWAY_RECONNECTED'
--     )
-- );

-- =====================================================
-- RLS Policies (Row Level Security) - ถ้าเปิดใช้งาน
-- =====================================================

-- Enable RLS on bms_status_history (optional)
-- ALTER TABLE bms_status_history ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users
-- CREATE POLICY "Allow all for authenticated" ON bms_status_history
--     FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- Function สำหรับ cleanup ข้อมูลเก่า (Optional)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_bms_status()
RETURNS void AS $$
BEGIN
    -- ลบข้อมูลที่เก่ากว่า 30 วัน
    DELETE FROM bms_status_history
    WHERE recorded_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- สร้าง scheduled job สำหรับ cleanup (ใช้ pg_cron หรือ Supabase scheduled functions)
-- SELECT cron.schedule('cleanup-bms-status', '0 0 * * *', 'SELECT cleanup_old_bms_status()');
