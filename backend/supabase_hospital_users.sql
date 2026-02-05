-- =============================================
-- Hospital Users Table for MonitorApp
-- สร้างตาราง hospital_users สำหรับ user ทั้งหมด (admin และ hospital)
-- =============================================

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. สร้างตาราง hospital_users (ถ้ายังไม่มี)
CREATE TABLE IF NOT EXISTS hospital_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    hospital_code VARCHAR(20),  -- NULL สำหรับ admin
    hospital_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',  -- 'admin' หรือ 'user'
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- แก้ไข hospital_code ให้เป็น nullable (สำหรับ admin)
ALTER TABLE hospital_users ALTER COLUMN hospital_code DROP NOT NULL;

-- ลบ column created_by ถ้ามี (ไม่ต้องการแล้ว)
ALTER TABLE hospital_users DROP COLUMN IF EXISTS created_by;

-- เพิ่ม admin user เริ่มต้น (password: bmshosxp!@#$)
INSERT INTO hospital_users (username, password_hash, display_name, role, hospital_code)
VALUES (
    'admin',
    crypt('bmshosxp!@#$', gen_salt('bf', 12)),
    'Administrator',
    'admin',
    NULL
) ON CONFLICT (username) DO UPDATE SET
    password_hash = crypt('bmshosxp!@#$', gen_salt('bf', 12)),
    role = 'admin',
    hospital_code = NULL;

-- 2. สร้าง indexes
CREATE INDEX IF NOT EXISTS idx_hospital_users_username ON hospital_users(username);
CREATE INDEX IF NOT EXISTS idx_hospital_users_hospital_code ON hospital_users(hospital_code);
CREATE INDEX IF NOT EXISTS idx_hospital_users_active ON hospital_users(is_active);

-- 3. RLS policies
ALTER TABLE hospital_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select hospital_users" ON hospital_users;
DROP POLICY IF EXISTS "Allow anon insert hospital_users" ON hospital_users;
DROP POLICY IF EXISTS "Allow anon update hospital_users" ON hospital_users;
DROP POLICY IF EXISTS "Allow anon delete hospital_users" ON hospital_users;

-- Allow anon to select (for listing users)
CREATE POLICY "Allow anon select hospital_users"
ON hospital_users
FOR SELECT
TO anon
USING (true);

-- Allow anon to insert (admin creates users via API)
CREATE POLICY "Allow anon insert hospital_users"
ON hospital_users
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to update
CREATE POLICY "Allow anon update hospital_users"
ON hospital_users
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon to delete
CREATE POLICY "Allow anon delete hospital_users"
ON hospital_users
FOR DELETE
TO anon
USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON hospital_users TO anon;
GRANT USAGE, SELECT ON SEQUENCE hospital_users_id_seq TO anon;

-- 4. Function สำหรับ verify hospital user password
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
    FROM hospital_users
    WHERE hospital_users.username = p_username
    AND is_active = TRUE;

    -- ถ้าไม่พบ user
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- ตรวจสอบ password ด้วย bcrypt
    IF v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
        -- อัพเดท last_login
        UPDATE hospital_users
        SET last_login = NOW()
        WHERE hospital_users.id = v_user.id;

        RETURN QUERY SELECT
            TRUE,
            v_user.id,
            v_user.username::TEXT,
            v_user.display_name::TEXT,
            v_user.hospital_code::TEXT,
            v_user.hospital_name::TEXT,
            v_user.role::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_hospital_user_password TO anon;

-- 5. Function สำหรับสร้าง hospital user ใหม่
CREATE OR REPLACE FUNCTION create_hospital_user(
    p_username TEXT,
    p_password TEXT,
    p_display_name TEXT,
    p_hospital_code TEXT,
    p_hospital_name TEXT DEFAULT NULL
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
    -- ตรวจสอบว่า username ซ้ำหรือไม่
    IF EXISTS (SELECT 1 FROM hospital_users WHERE username = p_username) THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Username already exists'::TEXT;
        RETURN;
    END IF;

    -- สร้าง user ใหม่
    INSERT INTO hospital_users (username, password_hash, display_name, hospital_code, hospital_name)
    VALUES (p_username, crypt(p_password, gen_salt('bf', 12)), p_display_name, p_hospital_code, p_hospital_name)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT TRUE, v_id, 'User created successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION create_hospital_user TO anon;

-- 6. Function สำหรับอัพเดท hospital user
CREATE OR REPLACE FUNCTION update_hospital_user(
    p_user_id INTEGER,
    p_display_name TEXT DEFAULT NULL,
    p_hospital_code TEXT DEFAULT NULL,
    p_hospital_name TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_new_password TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- ตรวจสอบว่า user มีอยู่หรือไม่
    IF NOT EXISTS (SELECT 1 FROM hospital_users WHERE id = p_user_id) THEN
        RETURN QUERY SELECT FALSE, 'User not found'::TEXT;
        RETURN;
    END IF;

    -- อัพเดทข้อมูล
    UPDATE hospital_users
    SET
        display_name = COALESCE(p_display_name, display_name),
        hospital_code = COALESCE(p_hospital_code, hospital_code),
        hospital_name = COALESCE(p_hospital_name, hospital_name),
        is_active = COALESCE(p_is_active, is_active),
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

-- 7. Function สำหรับลบ hospital user
CREATE OR REPLACE FUNCTION delete_hospital_user(p_user_id INTEGER)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- ตรวจสอบว่า user มีอยู่หรือไม่
    IF NOT EXISTS (SELECT 1 FROM hospital_users WHERE id = p_user_id) THEN
        RETURN QUERY SELECT FALSE, 'User not found'::TEXT;
        RETURN;
    END IF;

    -- ลบ user
    DELETE FROM hospital_users WHERE id = p_user_id;

    RETURN QUERY SELECT TRUE, 'User deleted successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_hospital_user TO anon;

-- =============================================
-- วิธีใช้งาน:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. Copy SQL ทั้งหมดนี้ไปรัน
-- 3. จะได้ตาราง hospital_users พร้อม RPC functions
-- =============================================
