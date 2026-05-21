-- =============================================
-- Fix verify_admin_password function
-- แก้ไข type mismatch error: VARCHAR vs TEXT
-- =============================================

-- Drop and recreate the function with correct type casting
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
    -- ค้นหา user
    SELECT * INTO v_user
    FROM admin_users
    WHERE admin_users.username = p_username
    AND is_active = TRUE;

    -- ถ้าไม่พบ user
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- ตรวจสอบ password ด้วย bcrypt
    IF v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
        -- อัพเดท last_login
        UPDATE admin_users
        SET last_login = NOW()
        WHERE admin_users.id = v_user.id;

        -- Cast VARCHAR columns to TEXT explicitly
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION verify_admin_password TO anon;
GRANT EXECUTE ON FUNCTION verify_admin_password TO authenticated;

-- =============================================
-- วิธีใช้งาน:
-- 1. ไปที่ Supabase Dashboard > SQL Editor
-- 2. Copy SQL นี้ไปรัน
-- 3. ทดสอบ login อีกครั้ง
-- =============================================
