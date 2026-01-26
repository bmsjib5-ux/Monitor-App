-- =====================================================
-- Add hospital_code to process_history table
-- Run this SQL in Supabase Dashboard > SQL Editor
-- =====================================================

-- Add hospital_code and hospital_name columns to process_history
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS hospital_code VARCHAR(5),
ADD COLUMN IF NOT EXISTS hospital_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS hostname VARCHAR(255),
ADD COLUMN IF NOT EXISTS uptime_seconds INTEGER;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_process_history_hospital_code ON process_history(hospital_code);

-- Verify columns added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'process_history'
ORDER BY ordinal_position;
