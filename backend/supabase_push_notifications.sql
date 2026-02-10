-- =============================================
-- Push Notifications Table for MonitorApp
-- เก็บ Push Subscriptions สำหรับ Web Push API
-- =============================================

-- 1. สร้างตาราง push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    hospital_code VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. สร้าง indexes
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_hospital ON push_subscriptions(hospital_code);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active);

-- 3. RLS policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow anon delete own push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow anon select push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow service role full access push_subscriptions" ON push_subscriptions;

-- Allow anon to insert (subscribe)
CREATE POLICY "Allow anon insert push_subscriptions"
ON push_subscriptions
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to select active subscriptions (for backend to send notifications)
CREATE POLICY "Allow anon select push_subscriptions"
ON push_subscriptions
FOR SELECT
TO anon
USING (is_active = true);

-- Allow anon to delete own subscription (unsubscribe)
CREATE POLICY "Allow anon delete own push_subscriptions"
ON push_subscriptions
FOR DELETE
TO anon
USING (true);

-- Allow service_role full access (for backend to send notifications)
CREATE POLICY "Allow service role full access push_subscriptions"
ON push_subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON push_subscriptions TO anon;
GRANT USAGE, SELECT ON SEQUENCE push_subscriptions_id_seq TO anon;

-- 4. ตาราง notification_log (เก็บประวัติการส่ง)
CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES push_subscriptions(id) ON DELETE SET NULL,
    alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
    title TEXT,
    body TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_subscription ON notification_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_alert ON notification_log(alert_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);

-- 5. Function สำหรับเพิ่ม/อัพเดท subscription
CREATE OR REPLACE FUNCTION upsert_push_subscription(
    p_endpoint TEXT,
    p_p256dh TEXT,
    p_auth TEXT,
    p_user_agent TEXT DEFAULT NULL,
    p_hospital_code VARCHAR DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id INTEGER;
BEGIN
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, hospital_code)
    VALUES (p_endpoint, p_p256dh, p_auth, p_user_agent, p_hospital_code)
    ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        hospital_code = EXCLUDED.hospital_code,
        is_active = TRUE,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_push_subscription TO anon;

-- 6. Function สำหรับยกเลิก subscription
CREATE OR REPLACE FUNCTION remove_push_subscription(p_endpoint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_push_subscription TO anon;

-- =============================================
-- วิธีใช้งาน:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. Copy SQL ทั้งหมดนี้ไปรัน
-- 3. จะได้ตาราง push_subscriptions พร้อม RPC functions
-- =============================================
