-- =============================================
-- Process History Audit Log
-- เก็บ log การเปลี่ยนแปลงข้อมูลในตาราง process_history
-- =============================================

-- ======== PART 1: สร้างตาราง process_history_log ========
CREATE TABLE IF NOT EXISTS process_history_log (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,                          -- INSERT, UPDATE, DELETE
    process_name TEXT,                             -- ชื่อ process
    pid INTEGER,                                   -- Process ID
    hostname TEXT,                                 -- ชื่อเครื่อง
    hospital_code TEXT,                            -- รหัสสถานพยาบาล
    hospital_name TEXT,                            -- ชื่อสถานพยาบาล
    status TEXT,                                   -- สถานะ process
    old_data JSONB,                                -- ข้อมูลเดิม (สำหรับ UPDATE/DELETE)
    new_data JSONB,                                -- ข้อมูลใหม่ (สำหรับ INSERT/UPDATE)
    changed_by TEXT DEFAULT 'system',              -- ผู้ทำรายการ
    created_at TIMESTAMPTZ DEFAULT NOW()           -- เวลาที่เกิดการเปลี่ยนแปลง
);

-- สร้าง Index สำหรับค้นหาเร็ว
CREATE INDEX IF NOT EXISTS idx_ph_log_action ON process_history_log(action);
CREATE INDEX IF NOT EXISTS idx_ph_log_process_name ON process_history_log(process_name);
CREATE INDEX IF NOT EXISTS idx_ph_log_hostname ON process_history_log(hostname);
CREATE INDEX IF NOT EXISTS idx_ph_log_hospital_code ON process_history_log(hospital_code);
CREATE INDEX IF NOT EXISTS idx_ph_log_created_at ON process_history_log(created_at);

-- ======== PART 2: Trigger Function - บันทึก log อัตโนมัติ ========
CREATE OR REPLACE FUNCTION log_process_history_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO process_history_log (
            action, process_name, pid, hostname, hospital_code, hospital_name, status,
            old_data, new_data, changed_by
        ) VALUES (
            'INSERT',
            NEW.process_name,
            NEW.pid,
            NEW.hostname,
            NEW.hospital_code,
            NEW.hospital_name,
            NEW.status,
            NULL,
            to_jsonb(NEW),
            'trigger'
        );
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO process_history_log (
            action, process_name, pid, hostname, hospital_code, hospital_name, status,
            old_data, new_data, changed_by
        ) VALUES (
            'UPDATE',
            NEW.process_name,
            NEW.pid,
            NEW.hostname,
            NEW.hospital_code,
            NEW.hospital_name,
            NEW.status,
            to_jsonb(OLD),
            to_jsonb(NEW),
            'trigger'
        );
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO process_history_log (
            action, process_name, pid, hostname, hospital_code, hospital_name, status,
            old_data, new_data, changed_by
        ) VALUES (
            'DELETE',
            OLD.process_name,
            OLD.pid,
            OLD.hostname,
            OLD.hospital_code,
            OLD.hospital_name,
            OLD.status,
            to_jsonb(OLD),
            NULL,
            'trigger'
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

-- ======== PART 3: สร้าง Trigger บนตาราง process_history ========
-- ลบ trigger เดิม (ถ้ามี)
DROP TRIGGER IF EXISTS trg_process_history_log ON process_history;

-- สร้าง trigger ใหม่ - บันทึกทุก INSERT, UPDATE, DELETE
CREATE TRIGGER trg_process_history_log
AFTER INSERT OR UPDATE OR DELETE
ON process_history
FOR EACH ROW
EXECUTE FUNCTION log_process_history_changes();

-- ======== PART 4: RLS Policies ========
ALTER TABLE process_history_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read process_history_log" ON process_history_log;
DROP POLICY IF EXISTS "Allow service role full access process_history_log" ON process_history_log;

-- อ่านได้ (สำหรับดู log)
CREATE POLICY "Allow anon read process_history_log"
ON process_history_log
FOR SELECT
TO anon
USING (true);

-- service_role เข้าถึงได้ทั้งหมด
CREATE POLICY "Allow service role full access process_history_log"
ON process_history_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON process_history_log TO anon;

-- ======== PART 5: Function ดู log ล่าสุด ========
CREATE OR REPLACE FUNCTION get_process_history_log(
    p_limit INTEGER DEFAULT 100,
    p_action TEXT DEFAULT NULL,
    p_process_name TEXT DEFAULT NULL,
    p_hospital_code TEXT DEFAULT NULL
)
RETURNS SETOF process_history_log
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM process_history_log
    WHERE
        (p_action IS NULL OR action = p_action)
        AND (p_process_name IS NULL OR process_name = p_process_name)
        AND (p_hospital_code IS NULL OR hospital_code = p_hospital_code)
    ORDER BY created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_process_history_log TO anon;
GRANT EXECUTE ON FUNCTION get_process_history_log TO authenticated;

-- ======== PART 6: Function ลบ log เก่า (เก็บ 30 วัน) ========
CREATE OR REPLACE FUNCTION cleanup_process_history_log(
    p_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM process_history_log
    WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_process_history_log TO service_role;

-- ======== PART 7: ทดสอบ ========
SELECT 'process_history_log table created' as status, COUNT(*) as log_count FROM process_history_log;

-- =============================================
-- วิธีใช้งาน:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. Copy SQL ทั้งหมดนี้ไปรัน
-- 3. หลังจากรัน จะมี trigger บันทึก log อัตโนมัติ
--
-- ดู log:
--   SELECT * FROM process_history_log ORDER BY created_at DESC LIMIT 50;
--
-- ดูเฉพาะ DELETE:
--   SELECT * FROM get_process_history_log(50, 'DELETE');
--
-- ดูเฉพาะสถานพยาบาล:
--   SELECT * FROM get_process_history_log(50, NULL, NULL, 'H001');
--
-- ลบ log เก่ากว่า 30 วัน:
--   SELECT cleanup_process_history_log(30);
-- =============================================
