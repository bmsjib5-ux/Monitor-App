-- ============================================================
-- Supabase LINE Alert Migration v3
-- แจ้งเตือน LINE เฉพาะ PROCESS_STOPPED ที่หยุดเกิน 5 นาที
-- ใช้ pg_cron ตรวจสอบทุก 1 นาที (ไม่ใช่ trigger ทันที)
-- ============================================================

-- Step 1: Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Step 2: Create line_config table (ถ้ายังไม่มี)
CREATE TABLE IF NOT EXISTS line_config (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    channel_access_token TEXT NOT NULL,
    user_ids JSONB DEFAULT '[]'::jsonb,
    group_ids JSONB DEFAULT '[]'::jsonb,
    enabled BOOLEAN DEFAULT true,
    stop_delay_minutes INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 3: Drop old trigger (ถ้ามี)
DROP TRIGGER IF EXISTS trigger_line_alert ON alerts;

-- Step 4: Create function to check and send LINE for old STOPPED alerts
CREATE OR REPLACE FUNCTION check_and_send_line_stopped_alerts()
RETURNS void AS $$
DECLARE
    _config RECORD;
    _alert RECORD;
    _target TEXT;
    _hospital TEXT;
    _body JSONB;
    _flex JSONB;
    _details JSONB;
    _header_contents JSONB;
    _timestamp TEXT;
    _delay_minutes INT;
    _stopped_duration TEXT;
BEGIN
    -- Get LINE config
    SELECT * INTO _config FROM line_config WHERE enabled = true LIMIT 1;
    IF _config IS NULL THEN
        RETURN;
    END IF;

    _delay_minutes := COALESCE(_config.stop_delay_minutes, 5);

    -- Find PROCESS_STOPPED alerts that:
    -- 1. Created more than X minutes ago (confirmed stopped)
    -- 2. Not yet sent via LINE (line_sent IS NOT TRUE)
    -- 3. Created within last 30 minutes (don't send very old alerts)
    FOR _alert IN
        SELECT *
        FROM alerts
        WHERE alert_type = 'PROCESS_STOPPED'
          AND (line_sent IS NOT TRUE)
          AND created_at <= (now() - (_delay_minutes || ' minutes')::interval)
          AND created_at >= (now() - interval '30 minutes')
        ORDER BY created_at ASC
        LIMIT 10
    LOOP
        -- Check if process has restarted after this stop
        -- If there's a PROCESS_STARTED for same process+hostname after the stop, skip
        IF EXISTS (
            SELECT 1 FROM alerts
            WHERE alert_type = 'PROCESS_STARTED'
              AND process_name = _alert.process_name
              AND hostname = _alert.hostname
              AND created_at > _alert.created_at
        ) THEN
            -- Process restarted, mark as sent (no need to alert)
            UPDATE alerts SET line_sent = true, line_sent_at = now() WHERE id = _alert.id;
            CONTINUE;
        END IF;

        -- Get hospital name
        _hospital := _alert.hospital_name;
        IF _hospital IS NULL AND _alert.hostname IS NOT NULL THEN
            SELECT ph.hospital_name INTO _hospital
            FROM process_history ph
            WHERE ph.hostname = _alert.hostname AND ph.hospital_name IS NOT NULL
            ORDER BY ph.recorded_at DESC
            LIMIT 1;
        END IF;

        -- Calculate stopped duration
        _stopped_duration := EXTRACT(EPOCH FROM (now() - _alert.created_at))::int / 60 || ' นาที';

        -- Format timestamp
        _timestamp := to_char(_alert.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS');

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

        IF _alert.hostname IS NOT NULL THEN
            _details := _details || jsonb_build_array(
                jsonb_build_object('type', 'box', 'layout', 'horizontal', 'contents', jsonb_build_array(
                    jsonb_build_object('type', 'text', 'text', '💻 เครื่อง', 'size', 'sm', 'color', '#555555', 'flex', 0, 'wrap', true),
                    jsonb_build_object('type', 'text', 'text', _alert.hostname, 'size', 'sm', 'color', '#111111', 'align', 'end', 'wrap', true)
                ))
            );
        END IF;

        _details := _details || jsonb_build_array(
            jsonb_build_object('type', 'box', 'layout', 'horizontal', 'contents', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', '📦 โปรแกรม', 'size', 'sm', 'color', '#555555', 'flex', 0, 'wrap', true),
                jsonb_build_object('type', 'text', 'text', _alert.process_name, 'size', 'sm', 'color', '#111111', 'align', 'end', 'wrap', true)
            ))
        );

        _details := _details || jsonb_build_array(
            jsonb_build_object('type', 'box', 'layout', 'horizontal', 'contents', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', '⏱️ หยุดแล้ว', 'size', 'sm', 'color', '#555555', 'flex', 0, 'wrap', true),
                jsonb_build_object('type', 'text', 'text', _stopped_duration, 'size', 'sm', 'color', '#FF0000', 'align', 'end', 'weight', 'bold', 'wrap', true)
            ))
        );

        _details := _details || jsonb_build_array(
            jsonb_build_object('type', 'box', 'layout', 'horizontal', 'contents', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', '📝 รายละเอียด', 'size', 'sm', 'color', '#555555', 'flex', 0, 'wrap', true),
                jsonb_build_object('type', 'text', 'text', COALESCE(_alert.message, 'PROCESS_STOPPED'), 'size', 'sm', 'color', '#111111', 'align', 'end', 'wrap', true)
            ))
        );

        -- Build Flex Message
        _flex := jsonb_build_object(
            'type', 'flex',
            'altText', '🚨 ' || COALESCE(_hospital || ' - ', '') || 'โปรแกรมหยุดทำงาน! ' || _alert.process_name || ' (' || _stopped_duration || ')',
            'contents', jsonb_build_object(
                'type', 'bubble',
                'header', jsonb_build_object('type', 'box', 'layout', 'vertical', 'contents', _header_contents, 'backgroundColor', '#FF0000', 'paddingAll', '15px'),
                'body', jsonb_build_object('type', 'box', 'layout', 'vertical', 'contents', jsonb_build_array(
                    jsonb_build_object('type', 'text', 'text', 'โปรแกรมหยุดทำงาน!', 'weight', 'bold', 'size', 'lg', 'margin', 'md', 'wrap', true),
                    jsonb_build_object('type', 'text', 'text', 'PROCESS_STOPPED', 'size', 'sm', 'color', '#FF0000', 'margin', 'sm'),
                    jsonb_build_object('type', 'separator', 'margin', 'lg'),
                    jsonb_build_object('type', 'box', 'layout', 'vertical', 'margin', 'lg', 'spacing', 'sm', 'contents', _details)
                )),
                'footer', jsonb_build_object('type', 'box', 'layout', 'vertical', 'contents', jsonb_build_array(
                    jsonb_build_object('type', 'text', 'text', _timestamp, 'size', 'xs', 'color', '#aaaaaa', 'align', 'center')
                ))
            )
        );

        -- Send to each target
        FOR _target IN
            SELECT jsonb_array_elements_text(_config.user_ids)
            UNION ALL
            SELECT jsonb_array_elements_text(_config.group_ids)
        LOOP
            _body := jsonb_build_object(
                'to', _target,
                'messages', jsonb_build_array(_flex)
            );

            PERFORM net.http_post(
                url := 'https://api.line.me/v2/bot/message/push'::text,
                body := _body::jsonb,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || _config.channel_access_token
                )::jsonb
            );
        END LOOP;

        -- Mark as sent
        UPDATE alerts SET line_sent = true, line_sent_at = now() WHERE id = _alert.id;

        RAISE NOTICE 'LINE sent for alert %: % - %', _alert.id, _alert.process_name, _hospital;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create pg_cron job - run every 1 minute
-- Remove old job if exists (ignore error if not found)
DO $$
BEGIN
    PERFORM cron.unschedule('send-line-stopped-alerts');
EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist yet, ignore
END;
$$;

SELECT cron.schedule(
    'send-line-stopped-alerts',
    '* * * * *',  -- every 1 minute
    $$SELECT check_and_send_line_stopped_alerts()$$
);

-- ============================================================
-- Step 6: INSERT LINE config (แก้ token ให้ตรง)
-- ============================================================
-- DELETE FROM line_config;
-- INSERT INTO line_config (channel_access_token, user_ids, group_ids, enabled, stop_delay_minutes)
-- VALUES (
--     'YOUR_CHANNEL_ACCESS_TOKEN',
--     '["Uf62d036babce9bb2fedf569a56a1260c"]'::jsonb,
--     '[]'::jsonb,
--     true,
--     5  -- แจ้งเตือนเมื่อ stop เกิน 5 นาที
-- );

-- ============================================================
-- ทดสอบ: insert alert ที่ created_at เมื่อ 6 นาทีก่อน
-- ============================================================
-- INSERT INTO alerts (process_name, alert_type, message, hostname, hospital_name, created_at)
-- VALUES ('test.exe', 'PROCESS_STOPPED', 'ทดสอบ stop 6 นาที', 'TEST-PC', 'โรงพยาบาลทดสอบ', now() - interval '6 minutes');
--
-- รอ 1 นาที (cron job) แล้วตรวจสอบ:
-- SELECT id, process_name, line_sent, line_sent_at FROM alerts WHERE process_name = 'test.exe' ORDER BY id DESC LIMIT 1;

-- ============================================================
-- ทดสอบ manual (ไม่ต้องรอ cron):
-- ============================================================
-- SELECT check_and_send_line_stopped_alerts();

-- ============================================================
-- ตรวจสอบ cron job:
-- ============================================================
-- SELECT * FROM cron.job WHERE jobname = 'send-line-stopped-alerts';
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- ============================================================
-- ปรับเวลา delay (เช่น เปลี่ยนเป็น 10 นาที):
-- ============================================================
-- UPDATE line_config SET stop_delay_minutes = 10;

-- ============================================================
-- ปิด/เปิด:
-- ============================================================
-- UPDATE line_config SET enabled = false;  -- ปิด
-- UPDATE line_config SET enabled = true;   -- เปิด
-- SELECT cron.unschedule('send-line-stopped-alerts');  -- ลบ cron job
