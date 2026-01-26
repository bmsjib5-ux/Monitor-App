-- =====================================================
-- Migration: Add PID and Hostname columns to monitored_processes
-- วันที่: 2026-01-14
-- รองรับการ monitor หลาย process ที่มีชื่อเดียวกันแต่ต่าง PID/hostname
-- =====================================================

-- 1. Drop existing unique constraint on process_name (if exists)
ALTER TABLE monitored_processes DROP CONSTRAINT IF EXISTS monitored_processes_process_name_key;

-- 2. Add pid column
ALTER TABLE monitored_processes ADD COLUMN IF NOT EXISTS pid INTEGER;

-- 3. Add hostname column
ALTER TABLE monitored_processes ADD COLUMN IF NOT EXISTS hostname VARCHAR(255);

-- 4. Create index on pid for faster queries
CREATE INDEX IF NOT EXISTS idx_monitored_processes_pid ON monitored_processes(pid);

-- 5. Create index on hostname for faster queries
CREATE INDEX IF NOT EXISTS idx_monitored_processes_hostname ON monitored_processes(hostname);

-- =====================================================
-- Verify changes
-- =====================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'monitored_processes';
