-- =============================================
-- Supabase RLS Policy for GitHub Pages Access
-- อนุญาตให้ anon role อ่านข้อมูลได้
-- =============================================

-- 1. Enable RLS on tables (ถ้ายังไม่ได้เปิด)
ALTER TABLE monitored_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any (เพื่อป้องกัน duplicate)
DROP POLICY IF EXISTS "Allow anon read monitored_processes" ON monitored_processes;
DROP POLICY IF EXISTS "Allow anon read alerts" ON alerts;
DROP POLICY IF EXISTS "Allow service role full access monitored_processes" ON monitored_processes;
DROP POLICY IF EXISTS "Allow service role full access alerts" ON alerts;

-- 3. Create policies for anon (read-only for GitHub Pages)
CREATE POLICY "Allow anon read monitored_processes"
ON monitored_processes
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow anon read alerts"
ON alerts
FOR SELECT
TO anon
USING (true);

-- 4. Create policies for service_role (full access for backend API)
CREATE POLICY "Allow service role full access monitored_processes"
ON monitored_processes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role full access alerts"
ON alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Grant SELECT to anon role
GRANT SELECT ON monitored_processes TO anon;
GRANT SELECT ON alerts TO anon;

-- =============================================
-- วิธีใช้งาน:
-- 1. ไปที่ Supabase Dashboard > SQL Editor
-- 2. Copy SQL นี้ไปรัน
-- 3. Refresh หน้า GitHub Pages
-- =============================================
