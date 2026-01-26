-- Migration: เพิ่ม hospital_code, hospital_name, hostname ในตาราง alerts
-- รันใน Supabase SQL Editor

-- เพิ่ม columns ถ้ายังไม่มี
ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS hospital_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS hospital_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS hostname VARCHAR(255);

-- สร้าง index สำหรับการค้นหา
CREATE INDEX IF NOT EXISTS idx_alerts_hospital_code ON alerts(hospital_code);

-- ตรวจสอบ columns ที่มีอยู่
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'alerts'
ORDER BY ordinal_position;
