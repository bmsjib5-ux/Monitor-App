-- =============================================
-- Supabase Complete Setup for MonitorApp
-- รวมการแก้ไขทั้งหมด: Auth Function + RLS Policies
-- =============================================

-- ======== PART 1: Fix verify_admin_password function ========
DROP FUNCTION IF EXISTS verify_admin_password(TEXT, TEXT);

CREATE OR REPLACE FUNCTION verify_admin_password(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    user_id INTEGER,
    username TEXT,
    display_name TEXT,
    role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT * INTO v_user
    FROM admin_users
    WHERE admin_users.username = p_username
    AND is_active = TRUE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    IF v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
        UPDATE admin_users
        SET last_login = NOW()
        WHERE admin_users.id = v_user.id;

        RETURN QUERY SELECT
            TRUE,
            v_user.id,
            v_user.username::TEXT,
            v_user.display_name::TEXT,
            v_user.role::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_admin_password TO anon;
GRANT EXECUTE ON FUNCTION verify_admin_password TO authenticated;

-- ======== PART 2: RLS Policies for process_history (PRIMARY) ========
ALTER TABLE process_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read process_history" ON process_history;
DROP POLICY IF EXISTS "Allow service role full access process_history" ON process_history;

CREATE POLICY "Allow anon read process_history"
ON process_history
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow service role full access process_history"
ON process_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON process_history TO anon;

-- ======== PART 3: RLS Policies for alerts ========
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read alerts" ON alerts;
DROP POLICY IF EXISTS "Allow service role full access alerts" ON alerts;

CREATE POLICY "Allow anon read alerts"
ON alerts
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow service role full access alerts"
ON alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON alerts TO anon;

-- ======== PART 4: RLS Policies for monitored_processes (BACKUP) ========
ALTER TABLE monitored_processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read monitored_processes" ON monitored_processes;
DROP POLICY IF EXISTS "Allow service role full access monitored_processes" ON monitored_processes;

CREATE POLICY "Allow anon read monitored_processes"
ON monitored_processes
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow service role full access monitored_processes"
ON monitored_processes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON monitored_processes TO anon;

-- ======== PART 5: Verify Setup ========
SELECT 'process_history count:' as info, COUNT(*) as count FROM process_history
UNION ALL
SELECT 'alerts count:' as info, COUNT(*) as count FROM alerts
UNION ALL
SELECT 'monitored_processes count:' as info, COUNT(*) as count FROM monitored_processes;

-- =============================================
-- วิธีใช้งาน:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. Copy SQL ทั้งหมดนี้ไปรัน
-- 3. ดูผลลัพธ์ - ควรแสดงจำนวน records
-- 4. Refresh หน้า GitHub Pages ทดสอบใหม่
-- =============================================
