import { useState, useEffect } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed
} from '../supabaseClient';

interface PushNotificationToggleProps {
  className?: string;
}

function PushNotificationToggle({ className = '' }: PushNotificationToggleProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    // Check support and current state
    const checkState = async () => {
      const supported = isPushSupported();
      setIsSupported(supported);

      if (supported) {
        setPermission(getNotificationPermission());
        const subscribed = await isPushSubscribed();
        setIsSubscribed(subscribed);
      }
    };

    checkState();
  }, []);

  const handleToggle = async () => {
    if (loading) return;

    setLoading(true);

    try {
      if (isSubscribed) {
        // Unsubscribe
        const success = await unsubscribeFromPush();
        if (success) {
          setIsSubscribed(false);
        }
      } else {
        // Request permission first
        if (permission !== 'granted') {
          const newPermission = await requestNotificationPermission();
          setPermission(newPermission);

          if (newPermission !== 'granted') {
            setShowTooltip(true);
            setTimeout(() => setShowTooltip(false), 3000);
            return;
          }
        }

        // Subscribe
        const subscription = await subscribeToPush();
        if (subscription) {
          setIsSubscribed(true);

          // Show test notification
          if (Notification.permission === 'granted') {
            new Notification('MonitorApp', {
              body: 'การแจ้งเตือนเปิดใช้งานแล้ว!',
              icon: '/Monitor-App/pwa-192x192.png'
            });
          }
        }
      }
    } catch (error) {
      console.error('Error toggling push:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isSupported) {
    return null; // Don't show if not supported
  }

  const getIcon = () => {
    if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;
    if (isSubscribed) return <BellRing className="w-5 h-5" />;
    if (permission === 'denied') return <BellOff className="w-5 h-5" />;
    return <Bell className="w-5 h-5" />;
  };

  const getTitle = () => {
    if (loading) return 'กำลังดำเนินการ...';
    if (isSubscribed) return 'ปิดการแจ้งเตือน';
    if (permission === 'denied') return 'การแจ้งเตือนถูกบล็อก - โปรดเปิดใน Browser Settings';
    return 'เปิดการแจ้งเตือน';
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleToggle}
        disabled={loading || permission === 'denied'}
        className={`p-2 rounded-lg transition-colors ${
          isSubscribed
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : permission === 'denied'
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
        }`}
        title={getTitle()}
      >
        {getIcon()}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 p-2 bg-yellow-600 text-white text-xs rounded-lg whitespace-nowrap z-50">
          กรุณาอนุญาตการแจ้งเตือนใน Browser
        </div>
      )}
    </div>
  );
}

export default PushNotificationToggle;
