-- =============================================
-- Migration: เพิ่มคอลัมน์ company_name, install_date, warranty_expiry_date
-- ในตาราง process_history
-- =============================================

-- เพิ่ม company_name
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- เพิ่ม install_date (วันที่ติดตั้ง Gateway)
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS install_date DATE;

-- เพิ่ม warranty_expiry_date (วันที่หมดประกัน = install_date + 1 ปี)
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS warranty_expiry_date DATE;

-- สร้าง Index สำหรับค้นหาเร็ว
CREATE INDEX IF NOT EXISTS idx_ph_company_name ON process_history(company_name);
CREATE INDEX IF NOT EXISTS idx_ph_install_date ON process_history(install_date);
CREATE INDEX IF NOT EXISTS idx_ph_warranty_expiry_date ON process_history(warranty_expiry_date);

-- อัพเดท Trigger Function ให้ track การเปลี่ยนแปลง company_name, install_date, warranty_expiry_date
CREATE OR REPLACE FUNCTION log_process_history_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- INSERT = เพิ่ม process ใหม่
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

    -- UPDATE = บันทึกเฉพาะเมื่อข้อมูลสำคัญเปลี่ยน (ไม่รวม metrics)
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.process_name IS DISTINCT FROM NEW.process_name
           OR OLD.pid IS DISTINCT FROM NEW.pid
           OR OLD.hostname IS DISTINCT FROM NEW.hostname
           OR OLD.hospital_code IS DISTINCT FROM NEW.hospital_code
           OR OLD.hospital_name IS DISTINCT FROM NEW.hospital_name
           OR OLD.program_path IS DISTINCT FROM NEW.program_path
           OR OLD.company_name IS DISTINCT FROM NEW.company_name
           OR OLD.install_date IS DISTINCT FROM NEW.install_date
           OR OLD.warranty_expiry_date IS DISTINCT FROM NEW.warranty_expiry_date
        THEN
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
        END IF;
        RETURN NEW;

    -- DELETE = ลบ process
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

-- ทดสอบ
SELECT 'Migration completed' as status,
       column_name, data_type
FROM information_schema.columns
WHERE table_name = 'process_history'
  AND column_name IN ('company_name', 'install_date', 'warranty_expiry_date')
ORDER BY column_name;

-- =============================================
-- วิธีใช้งาน:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. Copy SQL ทั้งหมดนี้ไปรัน
-- 3. จะมีคอลัมน์ใหม่ company_name, install_date, warranty_expiry_date
-- =============================================
