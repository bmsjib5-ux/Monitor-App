-- =====================================================
-- Migration: Fix process_history unique key
-- วันที่: 2026-01-14
-- แก้ไข unique key ให้เป็น process_name + hostname + hospital_code
-- =====================================================

-- 1. Drop existing unique constraint on pid (if exists)
-- This was incorrectly set - pid should NOT be unique
DROP INDEX IF EXISTS idx_process_history_pid_unique;

-- 2. Drop any unique constraint on process_name only
ALTER TABLE process_history DROP CONSTRAINT IF EXISTS process_history_process_name_key;

-- 3. Create composite index for faster lookups (not unique - allows same process on different machines)
CREATE INDEX IF NOT EXISTS idx_process_history_composite
ON process_history(process_name, hostname, hospital_code);

-- =====================================================
-- Note: We use INDEX instead of UNIQUE CONSTRAINT because:
-- - Same process name can exist on multiple machines
-- - Same hospital can have multiple processes with same name
-- - The application handles uniqueness in code
-- =====================================================

-- Verify changes
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'process_history';
