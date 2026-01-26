-- =====================================================
-- Migration: Add last_started and last_stopped columns
-- =====================================================
-- Run this SQL in Supabase Dashboard > SQL Editor
-- =====================================================

-- Add last_started and last_stopped columns to process_history table
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS last_started TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_stopped TIMESTAMPTZ;

-- Create index for faster queries on these columns
CREATE INDEX IF NOT EXISTS idx_process_history_last_started ON process_history(last_started);
CREATE INDEX IF NOT EXISTS idx_process_history_last_stopped ON process_history(last_stopped);

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'process_history'
AND column_name IN ('last_started', 'last_stopped', 'recorded_at');
