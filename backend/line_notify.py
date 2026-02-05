"""
LINE Official Account (Messaging API) Service for sending alerts
"""
import httpx
import ssl
import logging
from typing import Optional, List
from datetime import datetime, timezone, timedelta

# Try to import certifi for SSL certificates
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = None

logger = logging.getLogger(__name__)

# Thailand timezone
THAI_TZ = timezone(timedelta(hours=7))

class LineOAService:
    """Service for sending notifications via LINE Official Account (Messaging API)"""

    # LINE Messaging API endpoints
    PUSH_MESSAGE_URL = "https://api.line.me/v2/bot/message/push"
    BROADCAST_URL = "https://api.line.me/v2/bot/message/broadcast"

    def __init__(self):
        self.channel_access_token: Optional[str] = None
        self.user_ids: List[str] = []  # List of user IDs to send messages to
        self.group_ids: List[str] = []  # List of group IDs to send messages to
        self.enabled: bool = False
        # Track sent alerts to avoid duplicates (alert_key -> timestamp)
        self.sent_alerts: dict = {}
        # Cooldown period in seconds (don't resend same alert within this period)
        self.cooldown_seconds: int = 300  # 5 minutes

    def configure(self, channel_access_token: str, user_ids: List[str] = None,
                  group_ids: List[str] = None, enabled: bool = True):
        """Configure LINE OA with Channel Access Token, User IDs and Group IDs"""
        self.channel_access_token = channel_access_token
        if user_ids and isinstance(user_ids, list):
            self.user_ids = user_ids
        if group_ids and isinstance(group_ids, list):
            self.group_ids = group_ids
        self.enabled = enabled
        logger.info(f"LINE OA configured. Enabled: {enabled}, Users: {len(self.user_ids)}, Groups: {len(self.group_ids)}")

    def add_user_id(self, user_id: str):
        """Add a user ID to receive notifications"""
        if user_id and user_id not in self.user_ids:
            self.user_ids.append(user_id)
            logger.info(f"Added LINE user: {user_id[:10]}...")

    def remove_user_id(self, user_id: str):
        """Remove a user ID from notifications"""
        if user_id in self.user_ids:
            self.user_ids.remove(user_id)
            logger.info(f"Removed LINE user: {user_id[:10]}...")

    def add_group_id(self, group_id: str):
        """Add a group ID to receive notifications"""
        if group_id and group_id not in self.group_ids:
            self.group_ids.append(group_id)
            logger.info(f"Added LINE group: {group_id[:10]}...")

    def remove_group_id(self, group_id: str):
        """Remove a group ID from notifications"""
        if group_id in self.group_ids:
            self.group_ids.remove(group_id)
            logger.info(f"Removed LINE group: {group_id[:10]}...")

    def is_configured(self) -> bool:
        """Check if LINE OA is properly configured"""
        return bool(self.channel_access_token) and self.enabled and (len(self.user_ids) > 0 or len(self.group_ids) > 0)

    def _get_alert_key(self, process_name: str, alert_type: str) -> str:
        """Generate unique key for alert to track duplicates"""
        return f"{process_name}:{alert_type}"

    def _should_send_alert(self, alert_key: str) -> bool:
        """Check if we should send this alert (not in cooldown)"""
        if alert_key not in self.sent_alerts:
            return True

        last_sent = self.sent_alerts[alert_key]
        now = datetime.now(THAI_TZ)
        elapsed = (now - last_sent).total_seconds()

        return elapsed >= self.cooldown_seconds

    def _mark_alert_sent(self, alert_key: str):
        """Mark alert as sent with current timestamp"""
        self.sent_alerts[alert_key] = datetime.now(THAI_TZ)

        # Clean old entries (older than 1 hour)
        one_hour_ago = datetime.now(THAI_TZ) - timedelta(hours=1)
        self.sent_alerts = {
            k: v for k, v in self.sent_alerts.items()
            if v > one_hour_ago
        }

    def _create_flex_message(self, title: str, alert_type: str, details: List[dict],
                             color: str = "#FF0000", hospital_name: Optional[str] = None) -> dict:
        """Create a Flex Message for LINE"""
        # Build detail rows
        detail_contents = []
        for detail in details:
            detail_contents.append({
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "text",
                        "text": detail["label"],
                        "size": "sm",
                        "color": "#555555",
                        "flex": 0
                    },
                    {
                        "type": "text",
                        "text": detail["value"],
                        "size": "sm",
                        "color": "#111111",
                        "align": "end"
                    }
                ]
            })

        # Build header contents - show hospital name prominently if available
        header_contents = [
            {
                "type": "text",
                "text": "🚨 Monitor Alert",
                "color": "#ffffff",
                "size": "md",
                "weight": "bold"
            }
        ]

        # Add hospital name to header if available
        if hospital_name:
            header_contents.append({
                "type": "text",
                "text": f"🏥 {hospital_name}",
                "color": "#ffffff",
                "size": "lg",
                "weight": "bold",
                "margin": "sm"
            })

        return {
            "type": "flex",
            "altText": f"🚨 {hospital_name + ' - ' if hospital_name else ''}{title}",
            "contents": {
                "type": "bubble",
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": header_contents,
                    "backgroundColor": color,
                    "paddingAll": "15px"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": title,
                            "weight": "bold",
                            "size": "lg",
                            "margin": "md",
                            "wrap": True
                        },
                        {
                            "type": "text",
                            "text": alert_type,
                            "size": "sm",
                            "color": color,
                            "margin": "sm"
                        },
                        {
                            "type": "separator",
                            "margin": "lg"
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "margin": "lg",
                            "spacing": "sm",
                            "contents": detail_contents
                        }
                    ]
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": datetime.now(THAI_TZ).strftime("%Y-%m-%d %H:%M:%S"),
                            "size": "xs",
                            "color": "#aaaaaa",
                            "align": "center"
                        }
                    ]
                }
            }
        }

    async def send_push_message(self, user_id: str, messages: List[dict]) -> bool:
        """Send push message to a specific user"""
        if not self.channel_access_token:
            logger.debug("LINE OA not configured, skipping push message")
            return False

        try:
            headers = {
                "Authorization": f"Bearer {self.channel_access_token}",
                "Content-Type": "application/json"
            }

            data = {
                "to": user_id,
                "messages": messages
            }

            async with httpx.AsyncClient(verify=SSL_CONTEXT if SSL_CONTEXT else True) as client:
                response = await client.post(
                    self.PUSH_MESSAGE_URL,
                    headers=headers,
                    json=data,
                    timeout=10.0
                )

            if response.status_code == 200:
                logger.info(f"LINE push message sent to {user_id[:10]}...")
                return True
            else:
                logger.error(f"LINE push error: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            logger.error(f"Error sending LINE push message: {e}")
            return False

    async def send_to_all_users(self, messages: List[dict]) -> bool:
        """Send message to all configured users and groups"""
        if not self.is_configured():
            logger.debug("LINE OA not configured or no users/groups, skipping notification")
            return False

        success_count = 0
        total_targets = len(self.user_ids) + len(self.group_ids)

        # Send to users
        for user_id in self.user_ids:
            if await self.send_push_message(user_id, messages):
                success_count += 1

        # Send to groups
        for group_id in self.group_ids:
            if await self.send_push_message(group_id, messages):
                success_count += 1

        logger.info(f"Sent to {success_count}/{total_targets} targets (users + groups)")
        return success_count > 0

    async def send_text_message(self, text: str) -> bool:
        """Send simple text message to all users"""
        messages = [{"type": "text", "text": text}]
        return await self.send_to_all_users(messages)

    async def send_alert(self, process_name: str, alert_type: str, message: str,
                         hostname: Optional[str] = None, hospital_name: Optional[str] = None) -> bool:
        """Send alert notification to LINE with deduplication"""
        if not self.is_configured():
            return False

        # Check cooldown
        alert_key = self._get_alert_key(process_name, alert_type)
        if not self._should_send_alert(alert_key):
            logger.debug(f"Alert {alert_key} in cooldown, skipping")
            return False

        # Determine color based on alert type
        color = "#FF0000"  # Default red
        if alert_type == "PROCESS_STARTED":
            color = "#00C853"  # Green
        elif alert_type in ["CPU", "RAM"]:
            color = "#FF6D00"  # Orange
        elif alert_type in ["Disk I/O", "Network"]:
            color = "#FFD600"  # Yellow

        # Build details (hospital_name now in header, so not duplicated here)
        details = []
        if hostname:
            details.append({"label": "💻 เครื่อง", "value": hostname})
        details.append({"label": "📦 โปรแกรม", "value": process_name})
        details.append({"label": "📝 รายละเอียด", "value": message})

        # Create flex message with hospital_name in header
        flex_message = self._create_flex_message(
            title=f"แจ้งเตือน {alert_type}",
            alert_type=alert_type,
            details=details,
            color=color,
            hospital_name=hospital_name
        )

        # Send to all users
        success = await self.send_to_all_users([flex_message])

        if success:
            self._mark_alert_sent(alert_key)

        return success

    async def send_process_stopped_alert(self, process_name: str, hostname: Optional[str] = None,
                                         hospital_name: Optional[str] = None,
                                         stopped_duration_seconds: float = 0) -> bool:
        """Send process stopped alert"""
        mins = int(stopped_duration_seconds // 60)
        secs = int(stopped_duration_seconds % 60)
        message = f"หยุดทำงานแล้ว {mins} นาที {secs} วินาที"

        return await self.send_alert(
            process_name=process_name,
            alert_type="PROCESS_STOPPED",
            message=message,
            hostname=hostname,
            hospital_name=hospital_name
        )

    async def send_process_started_alert(self, process_name: str, hostname: Optional[str] = None,
                                         hospital_name: Optional[str] = None) -> bool:
        """Send process started alert"""
        return await self.send_alert(
            process_name=process_name,
            alert_type="PROCESS_STARTED",
            message="เริ่มทำงานแล้ว",
            hostname=hostname,
            hospital_name=hospital_name
        )

    async def send_threshold_alert(self, process_name: str, alert_type: str,
                                   value: float, threshold: float,
                                   hostname: Optional[str] = None,
                                   hospital_name: Optional[str] = None) -> bool:
        """Send threshold exceeded alert"""
        unit = ""
        if alert_type == "CPU":
            unit = "%"
        elif alert_type == "RAM":
            unit = "%"
        elif alert_type in ["Disk I/O", "Network"]:
            unit = " MB/s"

        message = f"สูงถึง {value:.2f}{unit} (เกิน {threshold}{unit})"

        return await self.send_alert(
            process_name=process_name,
            alert_type=alert_type,
            message=message,
            hostname=hostname,
            hospital_name=hospital_name
        )

    async def test_connection(self) -> dict:
        """Test LINE OA connection by sending a test message"""
        if not self.channel_access_token:
            return {"success": False, "message": "Channel Access Token ยังไม่ได้ตั้งค่า"}

        if not self.user_ids and not self.group_ids:
            return {"success": False, "message": "ยังไม่มี User ID หรือ Group ID สำหรับรับข้อความ"}

        try:
            # Create test flex message
            test_message = self._create_flex_message(
                title="ทดสอบการเชื่อมต่อ",
                alert_type="TEST",
                details=[
                    {"label": "สถานะ", "value": "เชื่อมต่อสำเร็จ ✓"},
                    {"label": "ระบบ", "value": "Monitor App"}
                ],
                color="#00C853"
            )

            success = await self.send_to_all_users([test_message])

            if success:
                return {"success": True, "message": f"ส่งข้อความทดสอบสำเร็จไปยัง {len(self.user_ids)} ผู้ใช้ และ {len(self.group_ids)} กลุ่ม"}
            else:
                return {"success": False, "message": "ไม่สามารถส่งข้อความได้ กรุณาตรวจสอบ Token และ User ID/Group ID"}
        except Exception as e:
            return {"success": False, "message": f"Error: {str(e)}"}


# Global instance
line_notify_service = LineOAService()
