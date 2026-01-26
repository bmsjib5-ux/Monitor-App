-- =====================================================
-- Migration: Add UNIQUE constraint on pid column
-- วันที่: 2026-01-14
-- แก้ไข error: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- =====================================================

-- Step 1: Check for duplicate PIDs first
-- SELECT pid, COUNT(*) FROM process_history WHERE pid IS NOT NULL GROUP BY pid HAVING COUNT(*) > 1;

-- Step 2: If there are duplicates, remove them (keep only the latest record by id)
DELETE FROM process_history a
USING process_history b
WHERE a.id < b.id
AND a.pid = b.pid
AND a.pid IS NOT NULL;

-- Step 3: Add UNIQUE constraint on pid column
-- Note: This only works if pid column has no duplicates
-- Using CREATE UNIQUE INDEX instead of ALTER TABLE for better control
DROP INDEX IF EXISTS idx_process_history_pid_unique;
CREATE UNIQUE INDEX idx_process_history_pid_unique ON process_history(pid) WHERE pid IS NOT NULL;

-- Step 4: Also create regular index if not exists
CREATE INDEX IF NOT EXISTS idx_process_history_pid ON process_history(pid);

-- =====================================================
-- Alternative: Add as table constraint (use if above doesn't work)
-- =====================================================
-- ALTER TABLE process_history DROP CONSTRAINT IF EXISTS process_history_pid_unique;
-- ALTER TABLE process_history ADD CONSTRAINT process_history_pid_unique UNIQUE (pid);

-- =====================================================
-- Verify changes
-- =====================================================
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'process_history';
