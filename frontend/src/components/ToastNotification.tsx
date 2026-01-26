import { useEffect, useState, useRef, useCallback } from 'react';
import { X, XCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { Alert } from '../types';

interface ToastNotificationProps {
  alerts: Alert[];
  onDismiss: (timestamp: string) => void;
}

interface ToastItem {
  alert: Alert;
  visible: boolean;
}

// LocalStorage key for seen toast alerts
const SEEN_TOASTS_KEY = 'monitorapp_seen_toasts';

// Helper to generate unique alert key
const getAlertKey = (alert: Alert): string => {
  return `${alert.timestamp}_${alert.process_name}_${alert.alert_type}`;
};

// Helper to get seen alerts from localStorage
const getSeenAlertsFromStorage = (): Set<string> => {
  try {
    const stored = localStorage.getItem(SEEN_TOASTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Clean old entries (older than 1 day)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const filtered = parsed.filter((item: { key: string; timestamp: number }) =>
        item.timestamp > oneDayAgo
      );
      // Save cleaned data back
      if (filtered.length !== parsed.length) {
        localStorage.setItem(SEEN_TOASTS_KEY, JSON.stringify(filtered));
      }
      return new Set(filtered.map((item: { key: string }) => item.key));
    }
  } catch (e) {
    console.error('Error reading seen toasts from storage:', e);
  }
  return new Set();
};

// Helper to save seen alerts to localStorage
const saveSeenAlertsToStorage = (seenAlerts: Set<string>) => {
  try {
    const items = Array.from(seenAlerts).map(key => ({
      key,
      timestamp: Date.now()
    }));
    localStorage.setItem(SEEN_TOASTS_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Error saving seen toasts to storage:', e);
  }
};

const ToastNotification = ({ alerts, onDismiss }: ToastNotificationProps) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Use ref to track seen alerts to avoid stale closure issues
  const seenAlertsRef = useRef<Set<string>>(getSeenAlertsFromStorage());

  // Track which alert keys we've already processed in this session
  const processedAlertsRef = useRef<Set<string>>(new Set());

  // Mark alert as seen in both ref and localStorage
  const markAsSeen = useCallback((alertKey: string) => {
    if (!seenAlertsRef.current.has(alertKey)) {
      seenAlertsRef.current.add(alertKey);
      saveSeenAlertsToStorage(seenAlertsRef.current);
    }
  }, []);

  useEffect(() => {
    // Re-read from localStorage on each check to ensure consistency
    const currentSeenAlerts = getSeenAlertsFromStorage();
    seenAlertsRef.current = currentSeenAlerts;

    // Filter for new process alerts that haven't been seen or processed
    const newAlerts = alerts.filter(alert => {
      const alertKey = getAlertKey(alert);
      const isProcessAlert = ['process_stopped', 'process_started'].includes(alert.alert_type.toLowerCase());
      const isNotSeen = !currentSeenAlerts.has(alertKey);
      const isNotProcessed = !processedAlertsRef.current.has(alertKey);

      return isProcessAlert && isNotSeen && isNotProcessed;
    });

    if (newAlerts.length > 0) {
      // Mark as processed immediately to prevent duplicates
      newAlerts.forEach(alert => {
        const alertKey = getAlertKey(alert);
        processedAlertsRef.current.add(alertKey);
        markAsSeen(alertKey);
      });

      // Add new alerts to toasts
      const newToasts = newAlerts.map(alert => ({
        alert,
        visible: true
      }));

      setToasts(prev => [...prev, ...newToasts]);

      // Auto-dismiss after timeout
      newAlerts.forEach(alert => {
        const timeout = alert.alert_type.toLowerCase() === 'process_stopped' ? 30000 : 10000;
        setTimeout(() => {
          handleDismiss(alert.timestamp);
        }, timeout);
      });
    }
  }, [alerts, markAsSeen]);

  const handleDismiss = (timestamp: string) => {
    setToasts(prev =>
      prev.map(t =>
        t.alert.timestamp === timestamp ? { ...t, visible: false } : t
      )
    );
    // Remove from DOM after animation
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.alert.timestamp !== timestamp));
    }, 300);
    onDismiss(timestamp);
  };

  const getToastStyle = (type: string) => {
    switch (type.toLowerCase()) {
      case 'process_stopped':
        return 'bg-red-600 text-white';
      case 'process_started':
        return 'bg-green-600 text-white';
      default:
        return 'bg-yellow-500 text-white';
    }
  };

  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'process_stopped':
        return <XCircle className="w-6 h-6" />;
      case 'process_started':
        return <CheckCircle className="w-6 h-6" />;
      default:
        return <AlertTriangle className="w-6 h-6" />;
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={`${toast.alert.timestamp}_${toast.alert.process_name}`}
          className={`
            ${getToastStyle(toast.alert.alert_type)}
            rounded-lg shadow-lg p-4 pr-10 relative
            transform transition-all duration-300 ease-in-out
            ${toast.visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
          `}
        >
          <button
            onClick={() => handleDismiss(toast.alert.timestamp)}
            className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {getIcon(toast.alert.alert_type)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm">
                {toast.alert.alert_type.toLowerCase() === 'process_stopped'
                  ? 'โปรแกรมหยุดทำงาน!'
                  : 'โปรแกรมเริ่มทำงาน'}
              </h4>
              <p className="text-sm opacity-90 mt-1">
                {toast.alert.process_name}
              </p>
              <p className="text-xs opacity-75 mt-1">
                {new Date(toast.alert.timestamp).toLocaleTimeString('th-TH')}
              </p>
            </div>
          </div>

          {/* Progress bar for auto-dismiss */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30 rounded-b-lg overflow-hidden">
            <div
              className="h-full bg-white/50 animate-shrink"
              style={{
                animationDuration: toast.alert.alert_type.toLowerCase() === 'process_stopped' ? '30s' : '10s'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToastNotification;
