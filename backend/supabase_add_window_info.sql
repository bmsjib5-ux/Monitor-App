-- Migration: Add window_title and window_info columns to process_history table
-- วันที่: 2026-01-21
-- คำอธิบาย: เพิ่ม column สำหรับเก็บ Window Title และ Window Info ที่ดึงจาก Windows API

-- เพิ่ม column window_title (ข้อความ Window Title เต็ม)
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS window_title TEXT;

-- เพิ่ม column window_info (JSON object เก็บข้อมูลที่ parse จาก Window Title)
-- ตัวอย่างข้อมูล: {"version": "2.68.04.22", "hospital_code": "11304", "hospital_name": "รพ.กระทุ่มแบน"}
ALTER TABLE process_history
ADD COLUMN IF NOT EXISTS window_info JSONB;

-- เพิ่ม comment อธิบาย column
COMMENT ON COLUMN process_history.window_title IS 'Window Title ของโปรแกรม (ดึงจาก Windows API)';
COMMENT ON COLUMN process_history.window_info IS 'ข้อมูลที่ parse จาก Window Title เช่น version, hospital_code, hospital_name (JSON)';

-- สร้าง index สำหรับค้นหา version ใน window_info (optional)
CREATE INDEX IF NOT EXISTS idx_process_history_window_info_version
ON process_history ((window_info->>'version'));
