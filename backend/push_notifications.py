"""
Web Push Notifications Module for MonitorApp
ส่ง Push Notifications ไปยัง subscribers
"""

import os
import json
import logging
from typing import Optional, List, Dict, Any
from pywebpush import webpush, WebPushException
from database_supabase import SupabaseDB

logger = logging.getLogger(__name__)

# VAPID Configuration
VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY', '')
VAPID_EMAIL = os.getenv('VAPID_EMAIL', 'mailto:admin@monitorapp.com')


class PushNotificationService:
    """Service for sending Web Push Notifications"""

    def __init__(self, db: SupabaseDB):
        self.db = db
        self.vapid_claims = {
            "sub": VAPID_EMAIL
        }

    def _get_vapid_private_key(self) -> str:
        """Get VAPID private key with proper padding"""
        key = VAPID_PRIVATE_KEY
        # Add padding if needed
        padding = 4 - len(key) % 4
        if padding != 4:
            key += '=' * padding
        return key

    async def send_notification(
        self,
        subscription: Dict[str, Any],
        title: str,
        body: str,
        icon: str = "/icon-192.png",
        badge: str = "/icon-96.png",
        tag: Optional[str] = None,
        data: Optional[Dict] = None,
        url: Optional[str] = None
    ) -> bool:
        """
        Send push notification to a single subscription

        Args:
            subscription: Push subscription object with endpoint, keys.p256dh, keys.auth
            title: Notification title
            body: Notification body
            icon: Icon URL
            badge: Badge icon URL
            tag: Tag for grouping notifications
            data: Additional data to send
            url: URL to open when notification is clicked

        Returns:
            True if successful, False otherwise
        """
        if not VAPID_PRIVATE_KEY:
            logger.error("VAPID_PRIVATE_KEY not configured")
            return False

        try:
            payload = {
                "title": title,
                "body": body,
                "icon": icon,
                "badge": badge,
                "tag": tag or "monitorapp-alert",
                "data": data or {},
                "timestamp": int(__import__('time').time() * 1000)
            }

            if url:
                payload["data"]["url"] = url

            subscription_info = {
                "endpoint": subscription.get("endpoint"),
                "keys": {
                    "p256dh": subscription.get("p256dh"),
                    "auth": subscription.get("auth")
                }
            }

            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=self._get_vapid_private_key(),
                vapid_claims=self.vapid_claims
            )

            logger.info(f"Push notification sent to {subscription.get('endpoint', '')[:50]}...")
            return True

        except WebPushException as e:
            logger.error(f"WebPush error: {e}")

            # Handle expired/invalid subscription
            if e.response and e.response.status_code in [404, 410]:
                # Subscription is no longer valid, remove it
                await self._remove_subscription(subscription.get("endpoint"))
                logger.info(f"Removed invalid subscription: {subscription.get('endpoint', '')[:50]}...")

            return False
        except Exception as e:
            logger.error(f"Push notification error: {e}")
            return False

    async def _remove_subscription(self, endpoint: str) -> None:
        """Remove invalid subscription from database"""
        try:
            await self.db.delete(
                "push_subscriptions",
                {"endpoint": f"eq.{endpoint}"}
            )
        except Exception as e:
            logger.error(f"Error removing subscription: {e}")

    async def send_alert_notification(
        self,
        alert_type: str,
        process_name: str,
        message: str,
        hospital_name: Optional[str] = None,
        hospital_code: Optional[str] = None,
        hostname: Optional[str] = None,
        alert_id: Optional[int] = None
    ) -> int:
        """
        Send alert notification to all active subscribers

        Args:
            alert_type: Type of alert (PROCESS_STARTED, PROCESS_STOPPED, CPU, etc.)
            process_name: Name of the process
            message: Alert message
            hospital_name: Hospital name
            hospital_code: Hospital code (for filtering)
            hostname: Hostname
            alert_id: Alert ID for reference

        Returns:
            Number of notifications sent successfully
        """
        # Get all active subscriptions
        try:
            subscriptions = await self.db.select(
                "push_subscriptions",
                filters={"is_active": "eq.true"}
            )
        except Exception as e:
            logger.error(f"Error fetching subscriptions: {e}")
            return 0

        if not subscriptions:
            logger.debug("No active push subscriptions")
            return 0

        # Prepare notification content
        if alert_type == "PROCESS_STARTED":
            title = f"✅ {process_name} Started"
            icon = "/icon-success.png"
        elif alert_type == "PROCESS_STOPPED":
            title = f"❌ {process_name} Stopped"
            icon = "/icon-error.png"
        elif alert_type == "CPU":
            title = f"⚠️ High CPU: {process_name}"
            icon = "/icon-warning.png"
        elif alert_type == "MEMORY":
            title = f"⚠️ High Memory: {process_name}"
            icon = "/icon-warning.png"
        else:
            title = f"🔔 Alert: {process_name}"
            icon = "/icon-192.png"

        body = message
        if hospital_name:
            body = f"{hospital_name}\n{message}"

        # Send to all subscriptions
        sent_count = 0
        for sub in subscriptions:
            # Optionally filter by hospital_code
            # if hospital_code and sub.get("hospital_code") and sub.get("hospital_code") != hospital_code:
            #     continue

            success = await self.send_notification(
                subscription=sub,
                title=title,
                body=body,
                icon=icon,
                tag=f"alert-{alert_type}-{process_name}",
                data={
                    "alert_type": alert_type,
                    "alert_id": alert_id,
                    "process_name": process_name,
                    "hospital_code": hospital_code,
                    "hospital_name": hospital_name,
                    "hostname": hostname
                },
                url=f"/Monitor-App/?alert={alert_id}" if alert_id else None
            )

            if success:
                sent_count += 1

        logger.info(f"Sent {sent_count}/{len(subscriptions)} push notifications for {alert_type}")
        return sent_count

    async def subscribe(
        self,
        endpoint: str,
        p256dh: str,
        auth: str,
        user_agent: Optional[str] = None,
        hospital_code: Optional[str] = None
    ) -> Optional[int]:
        """
        Register a new push subscription

        Returns:
            Subscription ID if successful, None otherwise
        """
        try:
            # Use RPC function for upsert
            result = await self.db.rpc(
                "upsert_push_subscription",
                {
                    "p_endpoint": endpoint,
                    "p_p256dh": p256dh,
                    "p_auth": auth,
                    "p_user_agent": user_agent,
                    "p_hospital_code": hospital_code
                }
            )

            if result:
                return result

            # Fallback to direct insert
            data = {
                "endpoint": endpoint,
                "p256dh": p256dh,
                "auth": auth,
                "user_agent": user_agent,
                "hospital_code": hospital_code,
                "is_active": True
            }

            inserted = await self.db.insert("push_subscriptions", data)
            return inserted[0].get("id") if inserted else None

        except Exception as e:
            logger.error(f"Error subscribing: {e}")
            return None

    async def unsubscribe(self, endpoint: str) -> bool:
        """
        Remove a push subscription

        Returns:
            True if successful, False otherwise
        """
        try:
            await self.db.delete(
                "push_subscriptions",
                {"endpoint": f"eq.{endpoint}"}
            )
            return True
        except Exception as e:
            logger.error(f"Error unsubscribing: {e}")
            return False


# Global instance (initialized in main.py)
push_service: Optional[PushNotificationService] = None


def get_push_service() -> Optional[PushNotificationService]:
    """Get the global push notification service instance"""
    return push_service


def init_push_service(db: SupabaseDB) -> PushNotificationService:
    """Initialize the global push notification service"""
    global push_service
    push_service = PushNotificationService(db)
    return push_service
