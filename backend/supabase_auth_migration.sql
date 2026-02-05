-- =============================================
-- Supabase Auth Migration for MonitorApp
-- สร้างตาราง admin_users สำหรับ login บน GitHub Pages
-- =============================================

-- 1. สร้างตาราง admin_users
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. สร้าง index
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);

-- 3. เพิ่ม user เริ่มต้น (password: bmshosxp!@#$)
-- Password hash สร้างด้วย bcrypt
INSERT INTO admin_users (username, password_hash, display_name, role)
VALUES (
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4eKYVJGBqZKZqXYe',
    'Administrator',
    'admin'
) ON CONFLICT (username) DO NOTHING;

-- 4. สร้าง RPC function สำหรับ verify password (ใช้ pgcrypto)
-- หมายเหตุ: ต้องเปิดใช้งาน pgcrypto extension ก่อน
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function สำหรับ verify password
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

        RETURN QUERY SELECT
            TRUE,
            v_user.id,
            v_user.username,
            v_user.display_name,
            v_user.role;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION verify_admin_password TO anon;
GRANT EXECUTE ON FUNCTION verify_admin_password TO authenticated;

-- 6. Function สำหรับ hash password (ใช้สำหรับสร้าง user ใหม่)
CREATE OR REPLACE FUNCTION hash_password(p_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN crypt(p_password, gen_salt('bf', 12));
END;
$$;

-- ตัวอย่างการสร้าง user ใหม่:
-- INSERT INTO admin_users (username, password_hash, display_name)
-- VALUES ('newuser', hash_password('newpassword123'), 'New User');

-- =============================================
-- วิธีใช้งาน:
-- 1. ไปที่ Supabase Dashboard > SQL Editor
-- 2. Copy SQL นี้ไปรัน
-- 3. ทดสอบ login ด้วย username: admin, password: bmshosxp!@#$
-- =============================================
