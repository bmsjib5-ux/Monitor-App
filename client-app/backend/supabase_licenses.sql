-- =============================================
-- Licenses Table for MonitorApp
-- ระบบ License ต่อสถานพยาบาล (Lifetime - ไม่มีวันหมดอายุ)
-- =============================================

-- Enable pgcrypto for generating license keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. สร้างตาราง licenses
CREATE TABLE IF NOT EXISTS licenses (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(50) UNIQUE NOT NULL,
    hospital_code VARCHAR(20) NOT NULL,
    hospital_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    notes TEXT
);

-- 2. สร้าง indexes
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_hospital ON licenses(hospital_code);
CREATE INDEX IF NOT EXISTS idx_licenses_active ON licenses(is_active);

-- 3. RLS policies
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select licenses" ON licenses;
DROP POLICY IF EXISTS "Allow anon insert licenses" ON licenses;
DROP POLICY IF EXISTS "Allow anon update licenses" ON licenses;
DROP POLICY IF EXISTS "Allow anon delete licenses" ON licenses;

CREATE POLICY "Allow anon select licenses"
ON licenses FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert licenses"
ON licenses FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update licenses"
ON licenses FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete licenses"
ON licenses FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON licenses TO anon;
GRANT USAGE, SELECT ON SEQUENCE licenses_id_seq TO anon;

-- 4. Function สำหรับสร้าง license key ใหม่
CREATE OR REPLACE FUNCTION generate_license_key()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_key TEXT;
BEGIN
    -- สร้าง license key แบบ XXXX-XXXX-XXXX-XXXX
    v_key := upper(
        substring(encode(gen_random_bytes(2), 'hex') from 1 for 4) || '-' ||
        substring(encode(gen_random_bytes(2), 'hex') from 1 for 4) || '-' ||
        substring(encode(gen_random_bytes(2), 'hex') from 1 for 4) || '-' ||
        substring(encode(gen_random_bytes(2), 'hex') from 1 for 4)
    );
    RETURN v_key;
END;
$$;

-- 5. Function สำหรับสร้าง license ใหม่
CREATE OR REPLACE FUNCTION create_license(
    p_hospital_code TEXT,
    p_hospital_name TEXT DEFAULT NULL,
    p_created_by TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    license_key TEXT,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_key TEXT;
BEGIN
    -- สร้าง license key
    v_key := generate_license_key();

    -- ตรวจสอบว่าซ้ำหรือไม่ (ถ้าซ้ำให้สร้างใหม่)
    WHILE EXISTS (SELECT 1 FROM licenses WHERE licenses.license_key = v_key) LOOP
        v_key := generate_license_key();
    END LOOP;

    -- Insert license
    INSERT INTO licenses (license_key, hospital_code, hospital_name, created_by, notes)
    VALUES (v_key, p_hospital_code, p_hospital_name, p_created_by, p_notes);

    RETURN QUERY SELECT TRUE, v_key, 'License created successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION create_license TO anon;

-- 6. Function สำหรับตรวจสอบ license
CREATE OR REPLACE FUNCTION verify_license(
    p_license_key TEXT,
    p_hospital_code TEXT DEFAULT NULL
)
RETURNS TABLE (
    valid BOOLEAN,
    hospital_code TEXT,
    hospital_name TEXT,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_license RECORD;
BEGIN
    -- ค้นหา license
    SELECT * INTO v_license
    FROM licenses
    WHERE licenses.license_key = upper(trim(p_license_key))
    AND is_active = TRUE;

    -- ถ้าไม่พบ license
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, 'License key ไม่ถูกต้องหรือถูกยกเลิก'::TEXT;
        RETURN;
    END IF;

    -- ถ้าระบุ hospital_code ให้ตรวจสอบว่าตรงกันหรือไม่
    IF p_hospital_code IS NOT NULL AND v_license.hospital_code != p_hospital_code THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, 'License key ไม่ตรงกับรหัสสถานพยาบาล'::TEXT;
        RETURN;
    END IF;

    -- License valid
    RETURN QUERY SELECT
        TRUE,
        v_license.hospital_code::TEXT,
        v_license.hospital_name::TEXT,
        'License ถูกต้อง'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_license TO anon;

-- 7. Function สำหรับดึง license ตาม hospital_code
CREATE OR REPLACE FUNCTION get_license_by_hospital(p_hospital_code TEXT)
RETURNS TABLE (
    id INTEGER,
    license_key TEXT,
    hospital_code TEXT,
    hospital_name TEXT,
    is_active BOOLEAN,
    activated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.license_key::TEXT,
        l.hospital_code::TEXT,
        l.hospital_name::TEXT,
        l.is_active,
        l.activated_at
    FROM licenses l
    WHERE l.hospital_code = p_hospital_code
    AND l.is_active = TRUE
    ORDER BY l.activated_at DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_license_by_hospital TO anon;

-- 8. Function สำหรับยกเลิก license
CREATE OR REPLACE FUNCTION revoke_license(p_license_key TEXT)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE licenses
    SET is_active = FALSE
    WHERE license_key = upper(trim(p_license_key));

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'License key not found'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'License revoked successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION revoke_license TO anon;

-- =============================================
-- วิธีใช้งาน:
-- 1. รัน SQL นี้ใน Supabase SQL Editor
-- 2. สร้าง license ใหม่:
--    SELECT * FROM create_license('10001', 'โรงพยาบาลทดสอบ', 'admin');
-- 3. ตรวจสอบ license:
--    SELECT * FROM verify_license('XXXX-XXXX-XXXX-XXXX');
-- =============================================
