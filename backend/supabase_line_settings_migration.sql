-- Migration: Create line_settings table for LINE OA configuration
-- Run this in Supabase SQL Editor

-- Create line_settings table
CREATE TABLE IF NOT EXISTS line_settings (
    id SERIAL PRIMARY KEY,
    hostname VARCHAR(255),
    channel_access_token TEXT,
    channel_secret TEXT,
    user_ids JSONB DEFAULT '[]'::jsonb,
    enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster hostname lookups
CREATE INDEX IF NOT EXISTS idx_line_settings_hostname ON line_settings(hostname);

-- Add unique constraint on hostname (one settings per machine)
-- This allows NULL hostname for global settings
CREATE UNIQUE INDEX IF NOT EXISTS idx_line_settings_hostname_unique
ON line_settings(COALESCE(hostname, ''));

-- Enable Row Level Security (RLS)
ALTER TABLE line_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your security needs)
CREATE POLICY "Allow all operations on line_settings" ON line_settings
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT ALL ON line_settings TO anon;
GRANT ALL ON line_settings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE line_settings_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE line_settings_id_seq TO authenticated;

-- Comment on table
COMMENT ON TABLE line_settings IS 'LINE Official Account settings per hostname';
COMMENT ON COLUMN line_settings.hostname IS 'Machine hostname for scoping settings';
COMMENT ON COLUMN line_settings.channel_access_token IS 'LINE Messaging API Channel Access Token';
COMMENT ON COLUMN line_settings.channel_secret IS 'LINE Messaging API Channel Secret';
COMMENT ON COLUMN line_settings.user_ids IS 'Array of LINE user IDs to send notifications to';
COMMENT ON COLUMN line_settings.enabled IS 'Whether LINE notifications are enabled';
