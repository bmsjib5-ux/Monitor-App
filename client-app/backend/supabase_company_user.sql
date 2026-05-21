-- =============================================
-- Company User Migration for MonitorApp v4.2.0
-- เพิ่ม role 'company' ให้ hospital_users
-- =============================================

-- 1. เพิ่ม company_name column ใน hospital_users
ALTER TABLE hospital_users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- เพิ่ม index
CREATE INDEX IF NOT EXISTS idx_hospital_users_company ON hospital_users(company_name);

-- 2. อัพเดท verify_hospital_user_password ให้คืน company_name ด้วย
-- DROP ก่อนเพราะ return type เปลี่ยน (เพิ่ม company_name column)
DROP FUNCTION IF EXISTS verify_hospital_user_password(TEXT, TEXT);
CREATE OR REPLACE FUNCTION verify_hospital_user_password(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    user_id INTEGER,
    username TEXT,
    display_name TEXT,
    hospital_code TEXT,
    hospital_name TEXT,
    role TEXT,
    company_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT * INTO v_user
    FROM hospital_users
    WHERE hospital_users.username = p_username
    AND is_active = TRUE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
            NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    IF v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
        UPDATE hospital_users SET last_login = NOW() WHERE hospital_users.id = v_user.id;

        RETURN QUERY SELECT
            TRUE,
            v_user.id,
            v_user.username::TEXT,
            v_user.display_name::TEXT,
            v_user.hospital_code::TEXT,
            v_user.hospital_name::TEXT,
            v_user.role::TEXT,
            v_user.company_name::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
            NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_hospital_user_password TO anon;

-- 3. อัพเดท create_hospital_user ให้รับ company_name และ role
-- DROP ก่อนเพราะ signature เปลี่ยน (เพิ่ม parameters)
DROP FUNCTION IF EXISTS create_hospital_user(TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION create_hospital_user(
    p_username TEXT,
    p_password TEXT,
    p_display_name TEXT,
    p_hospital_code TEXT DEFAULT NULL,
    p_hospital_name TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'user'
)
RETURNS TABLE (
    success BOOLEAN,
    user_id INTEGER,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM hospital_users WHERE username = p_username) THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Username already exists'::TEXT;
        RETURN;
    END IF;

    INSERT INTO hospital_users (username, password_hash, display_name, hospital_code, hospital_name, company_name, role)
    VALUES (
        p_username,
        crypt(p_password, gen_salt('bf', 12)),
        p_display_name,
        p_hospital_code,
        p_hospital_name,
        p_company_name,
        COALESCE(p_role, 'user')
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT TRUE, v_id, 'User created successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION create_hospital_user TO anon;

-- 4. อัพเดท update_hospital_user ให้รับ company_name และ role
-- DROP ก่อนเพราะ signature เปลี่ยน (เพิ่ม parameters)
DROP FUNCTION IF EXISTS update_hospital_user(INTEGER, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION update_hospital_user(
    p_user_id INTEGER,
    p_display_name TEXT DEFAULT NULL,
    p_hospital_code TEXT DEFAULT NULL,
    p_hospital_name TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_new_password TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM hospital_users WHERE id = p_user_id) THEN
        RETURN QUERY SELECT FALSE, 'User not found'::TEXT;
        RETURN;
    END IF;

    UPDATE hospital_users
    SET
        display_name  = COALESCE(p_display_name, display_name),
        hospital_code = CASE WHEN p_hospital_code IS NOT NULL THEN p_hospital_code ELSE hospital_code END,
        hospital_name = COALESCE(p_hospital_name, hospital_name),
        company_name  = CASE WHEN p_company_name IS NOT NULL THEN p_company_name ELSE company_name END,
        role          = COALESCE(p_role, role),
        is_active     = COALESCE(p_is_active, is_active),
        password_hash = CASE
            WHEN p_new_password IS NOT NULL THEN crypt(p_new_password, gen_salt('bf', 12))
            ELSE password_hash
        END,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN QUERY SELECT TRUE, 'User updated successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION update_hospital_user TO anon;

-- =============================================
-- วิธีใช้งาน:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. รัน SQL นี้ทั้งหมด
-- =============================================
