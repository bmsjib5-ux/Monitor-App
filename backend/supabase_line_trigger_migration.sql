-- ============================================================
-- Supabase LINE Alert Trigger Migration v2
-- ส่ง LINE แจ้งเตือนอัตโนมัติเมื่อมี INSERT ใน alerts table
-- ไม่ต้องพึ่ง client เปิดโปรแกรมอยู่
-- ============================================================
-- ⚠️ IMPORTANT: Run each step separately in Supabase SQL Editor

-- ============================================================
-- Step 1: Enable pg_net extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- Step 2: Create line_config table
-- ============================================================
CREATE TABLE IF NOT EXISTS line_config (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    channel_access_token TEXT NOT NULL,
    user_ids JSONB DEFAULT '[]'::jsonb,
    group_ids JSONB DEFAULT '[]'::jsonb,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Step 3: Create trigger function
-- Uses AFTER INSERT + separate UPDATE for line_sent
-- pg_net runs async in background worker (requires AFTER trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION send_line_alert()
RETURNS TRIGGER AS $$
DECLARE
    _config RECORD;
    _target TEXT;
    _hospital TEXT;
    _color TEXT;
    _title TEXT;
    _body JSONB;
    _flex JSONB;
    _details JSONB;
    _header_contents JSONB;
    _timestamp TEXT;
BEGIN
    -- Only process PROCESS_STOPPED and PROCESS_STARTED
    IF NEW.alert_type NOT IN ('PROCESS_STOPPED', 'PROCESS_STARTED') THEN
        RETURN NEW;
    END IF;

    -- Get LINE config
    SELECT * INTO _config FROM line_config WHERE enabled = true LIMIT 1;
    IF _config IS NULL THEN
        RETURN NEW;
    END IF;

    -- Set color and title
    IF NEW.alert_type = 'PROCESS_STOPPED' THEN
        _color := '#FF0000';
        _title := 'โปรแกรมหยุดทำงาน!';
    ELSE
        _color := '#00C853';
        _title := 'โปรแกรมเริ่มทำงาน';
    END IF;

    -- Get hospital name (from alert or lookup from process_history)
    _hospital := NEW.hospital_name;
    IF _hospital IS NULL AND NEW.hostname IS NOT NULL THEN
        SELECT ph.hospital_name INTO _hospital
        FROM process_history ph
        WHERE ph.hostname = NEW.hostname AND ph.hospital_name IS NOT NULL
        ORDER BY ph.recorded_at DESC
        LIMIT 1;
    END IF;

    -- Format timestamp in Thai timezone
    _timestamp := to_char(COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS');

    -- Build header
    _header_contents := jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', '🚨 Monitor Alert', 'color', '#ffffff', 'size', 'md', 'weight', 'bold')
    );

    IF _hospital IS NOT NULL THEN
        _header_contents := _header_contents || jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', '🏥 ' || _hospital, 'color', '#ffffff', 'size', 'sm', 'weight', 'bold', 'margin', 'sm', 'wrap', true)
        );
    END IF;

    -- Build details
    _details := jsonb_build_array();

    IF NEW.hostname IS NOT NULL THEN
        _details := _details || jsonb_build_array(
            jsonb_build_object('type', 'box', 'layout', 'horizontal', 'contents', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', '💻 เครื่อง', 'size', 'sm', 'color', '#555555', 'flex', 0, 'wrap', true),
                jsonb_build_object('type', 'text', 'text', NEW.hostname, 'size', 'sm', 'color', '#111111', 'align', 'end', 'wrap', true)
            ))
        );
    END IF;

    _details := _details || jsonb_build_array(
        jsonb_build_object('type', 'box', 'layout', 'horizontal', 'contents', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', '📦 โปรแกรม', 'size', 'sm', 'color', '#555555', 'flex', 0, 'wrap', true),
            jsonb_build_object('type', 'text', 'text', NEW.process_name, 'size', 'sm', 'color', '#111111', 'align', 'end', 'wrap', true)
        ))
    );

    _details := _details || jsonb_build_array(
        jsonb_build_object('type', 'box', 'layout', 'horizontal', 'contents', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', '📝 รายละเอียด', 'size', 'sm', 'color', '#555555', 'flex', 0, 'wrap', true),
            jsonb_build_object('type', 'text', 'text', COALESCE(NEW.message, NEW.alert_type), 'size', 'sm', 'color', '#111111', 'align', 'end', 'wrap', true)
        ))
    );

    -- Build Flex Message
    _flex := jsonb_build_object(
        'type', 'flex',
        'altText', '🚨 ' || COALESCE(_hospital || ' - ', '') || _title || ' ' || NEW.process_name,
        'contents', jsonb_build_object(
            'type', 'bubble',
            'header', jsonb_build_object('type', 'box', 'layout', 'vertical', 'contents', _header_contents, 'backgroundColor', _color, 'paddingAll', '15px'),
            'body', jsonb_build_object('type', 'box', 'layout', 'vertical', 'contents', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', _title, 'weight', 'bold', 'size', 'lg', 'margin', 'md', 'wrap', true),
                jsonb_build_object('type', 'text', 'text', NEW.alert_type, 'size', 'sm', 'color', _color, 'margin', 'sm'),
                jsonb_build_object('type', 'separator', 'margin', 'lg'),
                jsonb_build_object('type', 'box', 'layout', 'vertical', 'margin', 'lg', 'spacing', 'sm', 'contents', _details)
            )),
            'footer', jsonb_build_object('type', 'box', 'layout', 'vertical', 'contents', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', _timestamp, 'size', 'xs', 'color', '#aaaaaa', 'align', 'center')
            ))
        )
    );

    -- Send to each target (user_ids + group_ids)
    FOR _target IN
        SELECT jsonb_array_elements_text(_config.user_ids)
        UNION ALL
        SELECT jsonb_array_elements_text(_config.group_ids)
    LOOP
        _body := jsonb_build_object(
            'to', _target,
            'messages', jsonb_build_array(_flex)
        );

        -- pg_net http_post with named parameters
        PERFORM net.http_post(
            url := 'https://api.line.me/v2/bot/message/push'::text,
            body := _body::jsonb,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || _config.channel_access_token
            )::jsonb
        );
    END LOOP;

    -- Mark as sent (AFTER trigger can't modify NEW, use UPDATE)
    UPDATE alerts SET line_sent = true, line_sent_at = now() WHERE id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Step 4: Drop old trigger and create new AFTER INSERT trigger
-- ============================================================
DROP TRIGGER IF EXISTS trigger_line_alert ON alerts;
CREATE TRIGGER trigger_line_alert
    AFTER INSERT ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION send_line_alert();

-- ============================================================
-- Step 5: INSERT your LINE config
-- ⚠️ แก้ไข token และ user_ids ให้ตรงกับของจริง
-- ============================================================
-- DELETE FROM line_config;  -- ลบ config เก่า (ถ้ามี)
-- INSERT INTO line_config (channel_access_token, user_ids, group_ids, enabled)
-- VALUES (
--     'ใส่ LINE Channel Access Token ตรงนี้',
--     '["Uf62d036babce9bb2fedf569a56a1260c"]'::jsonb,
--     '[]'::jsonb,
--     true
-- );

-- ============================================================
-- Step 6: ทดสอบ
-- ============================================================
-- INSERT INTO alerts (process_name, alert_type, message, hostname, hospital_name)
-- VALUES ('test.exe', 'PROCESS_STOPPED', 'ทดสอบ trigger', 'TEST-PC', 'โรงพยาบาลทดสอบ');
--
-- ตรวจสอบผลลัพธ์:
-- SELECT id, process_name, alert_type, line_sent, line_sent_at FROM alerts ORDER BY id DESC LIMIT 1;
--
-- ตรวจสอบ pg_net request log:
-- SELECT * FROM net._http_response ORDER BY id DESC LIMIT 5;

-- ============================================================
-- ปิด/เปิด trigger (ถ้าต้องการ):
-- ============================================================
-- ALTER TABLE alerts DISABLE TRIGGER trigger_line_alert;
-- ALTER TABLE alerts ENABLE TRIGGER trigger_line_alert;

-- ============================================================
-- ลบ trigger (ถ้าต้องการ):
-- ============================================================
-- DROP TRIGGER IF EXISTS trigger_line_alert ON alerts;
-- DROP FUNCTION IF EXISTS send_line_alert();
