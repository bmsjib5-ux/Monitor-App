-- =====================================================
-- Migration: Add hospital_code to process_history (Required)
-- วันที่: 2026-01-14
-- บังคับ hospital_code ห้ามว่างในตาราง process_history
-- =====================================================

-- 1. Add hospital_code column (nullable first for existing data)
ALTER TABLE process_history ADD COLUMN IF NOT EXISTS hospital_code VARCHAR(5);

-- 2. Add hospital_name column
ALTER TABLE process_history ADD COLUMN IF NOT EXISTS hospital_name VARCHAR(255);

-- 3. Add hostname column
ALTER TABLE process_history ADD COLUMN IF NOT EXISTS hostname VARCHAR(255);

-- 4. Add program_path column
ALTER TABLE process_history ADD COLUMN IF NOT EXISTS program_path VARCHAR(500);

-- 6. Update existing records with default hospital_code if null
-- (ต้องทำก่อนที่จะ set NOT NULL)
UPDATE process_history
SET hospital_code = '00000'
WHERE hospital_code IS NULL OR hospital_code = '';

-- 7. Now set hospital_code to NOT NULL
ALTER TABLE process_history ALTER COLUMN hospital_code SET NOT NULL;

-- 8. Add default value for new records (optional - จะถูก override จาก app)
ALTER TABLE process_history ALTER COLUMN hospital_code SET DEFAULT '00000';

-- 9. Create index on hospital_code for faster queries
CREATE INDEX IF NOT EXISTS idx_process_history_hospital_code ON process_history(hospital_code);

-- 10. Create index on hostname
CREATE INDEX IF NOT EXISTS idx_process_history_hostname ON process_history(hostname);

-- 11. Create index on program_path
CREATE INDEX IF NOT EXISTS idx_process_history_program_path ON process_history(program_path);

-- =====================================================
-- Add CHECK constraint to ensure hospital_code is 5 digits
-- =====================================================
-- Note: This will fail if any existing data doesn't match
-- Remove the default '00000' records first if needed

-- ALTER TABLE process_history
-- ADD CONSTRAINT chk_process_history_hospital_code
-- CHECK (hospital_code ~ '^[0-9]{5}$');

-- =====================================================
-- Verify changes
-- =====================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'process_history'
ORDER BY ordinal_position;
