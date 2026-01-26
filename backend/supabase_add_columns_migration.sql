-- Migration: Add missing columns to process_history and alerts tables
-- Run this in Supabase SQL Editor
-- Version: 4.0.18

-- ============================================================
-- PART 1: Add client_version column to process_history table
-- ============================================================

-- Add client_version column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'process_history' AND column_name = 'client_version'
    ) THEN
        ALTER TABLE process_history ADD COLUMN client_version VARCHAR(50);
        RAISE NOTICE 'Added client_version column to process_history';
    ELSE
        RAISE NOTICE 'client_version column already exists in process_history';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN process_history.client_version IS 'Version of the client application that reported this data';

-- ============================================================
-- PART 2: Add last_started and last_stopped columns to process_history
-- ============================================================

-- Add last_started column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'process_history' AND column_name = 'last_started'
    ) THEN
        ALTER TABLE process_history ADD COLUMN last_started TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_started column to process_history';
    ELSE
        RAISE NOTICE 'last_started column already exists in process_history';
    END IF;
END $$;

-- Add last_stopped column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'process_history' AND column_name = 'last_stopped'
    ) THEN
        ALTER TABLE process_history ADD COLUMN last_stopped TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_stopped column to process_history';
    ELSE
        RAISE NOTICE 'last_stopped column already exists in process_history';
    END IF;
END $$;

-- Add comments
COMMENT ON COLUMN process_history.last_started IS 'Timestamp when the process was last started';
COMMENT ON COLUMN process_history.last_stopped IS 'Timestamp when the process was last stopped';

-- ============================================================
-- PART 3: Add LINE notification tracking columns to alerts table
-- ============================================================

-- Add line_sent column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'alerts' AND column_name = 'line_sent'
    ) THEN
        ALTER TABLE alerts ADD COLUMN line_sent BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added line_sent column to alerts';
    ELSE
        RAISE NOTICE 'line_sent column already exists in alerts';
    END IF;
END $$;

-- Add line_sent_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'alerts' AND column_name = 'line_sent_at'
    ) THEN
        ALTER TABLE alerts ADD COLUMN line_sent_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added line_sent_at column to alerts';
    ELSE
        RAISE NOTICE 'line_sent_at column already exists in alerts';
    END IF;
END $$;

-- Add hospital info columns to alerts if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'alerts' AND column_name = 'hospital_code'
    ) THEN
        ALTER TABLE alerts ADD COLUMN hospital_code VARCHAR(20);
        RAISE NOTICE 'Added hospital_code column to alerts';
    ELSE
        RAISE NOTICE 'hospital_code column already exists in alerts';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'alerts' AND column_name = 'hospital_name'
    ) THEN
        ALTER TABLE alerts ADD COLUMN hospital_name VARCHAR(255);
        RAISE NOTICE 'Added hospital_name column to alerts';
    ELSE
        RAISE NOTICE 'hospital_name column already exists in alerts';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'alerts' AND column_name = 'hostname'
    ) THEN
        ALTER TABLE alerts ADD COLUMN hostname VARCHAR(255);
        RAISE NOTICE 'Added hostname column to alerts';
    ELSE
        RAISE NOTICE 'hostname column already exists in alerts';
    END IF;
END $$;

-- Add comments for alerts columns
COMMENT ON COLUMN alerts.line_sent IS 'Whether this alert has been sent to LINE';
COMMENT ON COLUMN alerts.line_sent_at IS 'Timestamp when the alert was sent to LINE';
COMMENT ON COLUMN alerts.hospital_code IS 'Hospital code associated with this alert';
COMMENT ON COLUMN alerts.hospital_name IS 'Hospital name associated with this alert';
COMMENT ON COLUMN alerts.hostname IS 'Hostname of the machine that generated this alert';

-- ============================================================
-- PART 4: Add group_ids column to line_settings table
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'line_settings' AND column_name = 'group_ids'
    ) THEN
        ALTER TABLE line_settings ADD COLUMN group_ids JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Added group_ids column to line_settings';
    ELSE
        RAISE NOTICE 'group_ids column already exists in line_settings';
    END IF;
END $$;

COMMENT ON COLUMN line_settings.group_ids IS 'Array of LINE group IDs to send notifications to';

-- ============================================================
-- PART 5: Create indexes for better performance
-- ============================================================

-- Index for filtering alerts by type
CREATE INDEX IF NOT EXISTS idx_alerts_alert_type ON alerts(alert_type);

-- Index for finding unsent alerts
CREATE INDEX IF NOT EXISTS idx_alerts_line_sent ON alerts(line_sent) WHERE line_sent = false OR line_sent IS NULL;

-- Index for alerts by created_at for sorting
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);

-- ============================================================
-- Verification: Check all columns exist
-- ============================================================

-- Check process_history columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'process_history'
AND column_name IN ('client_version', 'last_started', 'last_stopped')
ORDER BY column_name;

-- Check alerts columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'alerts'
AND column_name IN ('line_sent', 'line_sent_at', 'hospital_code', 'hospital_name', 'hostname')
ORDER BY column_name;

-- Check line_settings columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'line_settings'
AND column_name = 'group_ids';
