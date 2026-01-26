-- =====================================================
-- Supabase FULL Migration - Create All Tables
-- =====================================================
-- Run this SQL in Supabase Dashboard > SQL Editor
-- This will create all required tables with RLS policies
-- =====================================================

-- =====================================================
-- 1. CREATE TABLES
-- =====================================================

-- Table: process_history
CREATE TABLE IF NOT EXISTS process_history (
    id BIGSERIAL PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL,
    pid INTEGER,
    status VARCHAR(50),
    cpu_percent FLOAT,
    memory_mb FLOAT,
    memory_percent FLOAT,
    disk_read_mb FLOAT,
    disk_write_mb FLOAT,
    net_sent_mb FLOAT,
    net_recv_mb FLOAT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: alerts
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    message TEXT,
    value FLOAT,
    threshold FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: thresholds
CREATE TABLE IF NOT EXISTS thresholds (
    id SERIAL PRIMARY KEY,
    cpu_threshold FLOAT DEFAULT 80.0,
    ram_threshold FLOAT DEFAULT 80.0,
    disk_io_threshold FLOAT DEFAULT 100.0,
    network_threshold FLOAT DEFAULT 50.0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: monitored_processes
CREATE TABLE IF NOT EXISTS monitored_processes (
    id BIGSERIAL PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL UNIQUE,
    hospital_code VARCHAR(5),
    hospital_name VARCHAR(255),
    program_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: process_downtime
CREATE TABLE IF NOT EXISTS process_downtime (
    id BIGSERIAL PRIMARY KEY,
    process_name VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_seconds INTEGER,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: system_info
CREATE TABLE IF NOT EXISTS system_info (
    id BIGSERIAL PRIMARY KEY,
    hostname VARCHAR(255),
    ip_address VARCHAR(50),
    os_type VARCHAR(100),
    os_version VARCHAR(100),
    total_ram_mb FLOAT,
    total_disk_gb FLOAT,
    cpu_cores INTEGER,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: notification_log
CREATE TABLE IF NOT EXISTS notification_log (
    id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT,
    notification_type VARCHAR(50),
    recipient VARCHAR(255),
    message TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: maintenance_schedule
CREATE TABLE IF NOT EXISTS maintenance_schedule (
    id BIGSERIAL PRIMARY KEY,
    process_name VARCHAR(255),
    schedule_type VARCHAR(50),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_process_history_process_name ON process_history(process_name);
CREATE INDEX IF NOT EXISTS idx_process_history_recorded_at ON process_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_process_history_pid ON process_history(pid);
CREATE INDEX IF NOT EXISTS idx_alerts_process_name ON alerts(process_name);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_monitored_processes_process_name ON monitored_processes(process_name);
CREATE INDEX IF NOT EXISTS idx_monitored_processes_hospital_code ON monitored_processes(hospital_code);

-- =====================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE process_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_downtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedule ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. CREATE RLS POLICIES (Allow all for development)
-- =====================================================

-- process_history policies
DROP POLICY IF EXISTS "Allow all on process_history" ON process_history;
CREATE POLICY "Allow all on process_history" ON process_history FOR ALL USING (true) WITH CHECK (true);

-- alerts policies
DROP POLICY IF EXISTS "Allow all on alerts" ON alerts;
CREATE POLICY "Allow all on alerts" ON alerts FOR ALL USING (true) WITH CHECK (true);

-- thresholds policies
DROP POLICY IF EXISTS "Allow all on thresholds" ON thresholds;
CREATE POLICY "Allow all on thresholds" ON thresholds FOR ALL USING (true) WITH CHECK (true);

-- monitored_processes policies
DROP POLICY IF EXISTS "Allow all on monitored_processes" ON monitored_processes;
CREATE POLICY "Allow all on monitored_processes" ON monitored_processes FOR ALL USING (true) WITH CHECK (true);

-- process_downtime policies
DROP POLICY IF EXISTS "Allow all on process_downtime" ON process_downtime;
CREATE POLICY "Allow all on process_downtime" ON process_downtime FOR ALL USING (true) WITH CHECK (true);

-- system_info policies
DROP POLICY IF EXISTS "Allow all on system_info" ON system_info;
CREATE POLICY "Allow all on system_info" ON system_info FOR ALL USING (true) WITH CHECK (true);

-- notification_log policies
DROP POLICY IF EXISTS "Allow all on notification_log" ON notification_log;
CREATE POLICY "Allow all on notification_log" ON notification_log FOR ALL USING (true) WITH CHECK (true);

-- maintenance_schedule policies
DROP POLICY IF EXISTS "Allow all on maintenance_schedule" ON maintenance_schedule;
CREATE POLICY "Allow all on maintenance_schedule" ON maintenance_schedule FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 5. INSERT DEFAULT DATA
-- =====================================================

-- Insert default thresholds if not exists
INSERT INTO thresholds (cpu_threshold, ram_threshold, disk_io_threshold, network_threshold)
SELECT 80.0, 80.0, 100.0, 50.0
WHERE NOT EXISTS (SELECT 1 FROM thresholds LIMIT 1);

-- =====================================================
-- 6. VERIFY TABLES
-- =====================================================

SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name) as column_count
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
