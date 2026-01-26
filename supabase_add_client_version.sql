-- Migration: Add client_version column to process_history table
-- This column stores the version of the MonitorApp client running on each hospital machine
-- Run this in Supabase SQL Editor

-- Add client_version column
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS client_version VARCHAR(50);

-- Add comment
COMMENT ON COLUMN process_history.client_version IS 'Version of MonitorApp client running at this hospital';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_process_history_client_version ON process_history(client_version);
