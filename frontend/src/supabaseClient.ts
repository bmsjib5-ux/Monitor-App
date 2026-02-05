/**
 * Supabase Client for GitHub Pages (Read-Only Mode)
 *
 * ใช้สำหรับดึงข้อมูลจาก Supabase โดยตรงเมื่อรันบน GitHub Pages
 * เนื่องจาก GitHub Pages ไม่มี backend API
 */

// Supabase configuration - Public anon key (read-only)
const SUPABASE_URL = 'https://ktkklfpncuhvduxxumhb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a2tsZnBuY3VodmR1eHh1bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxODg5NTQsImV4cCI6MjA4Mzc2NDk1NH0.zJDdchPJWwQoSFi2Q9pB72_TcvTfvuvz2pXECtM8NwA';

// Check if running on GitHub Pages
export const isGitHubPages = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('github.io');
};

// Supabase REST API helper
class SupabaseClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseUrl = `${SUPABASE_URL}/rest/v1`;
    this.headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  async select<T>(table: string, options?: {
    columns?: string;
    filters?: Record<string, string>;
    order?: string;
    limit?: number;
  }): Promise<T[]> {
    const params = new URLSearchParams();

    if (options?.columns) {
      params.set('select', options.columns);
    } else {
      params.set('select', '*');
    }

    if (options?.order) {
      params.set('order', options.order);
    }

    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }

    // Add filters
    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        params.set(key, value);
      }
    }

    const response = await fetch(`${this.baseUrl}/${table}?${params}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`);
    }

    return response.json();
  }
}

export const supabase = new SupabaseClient();

// Types for Supabase data
export interface MonitoredProcess {
  id: number;
  process_name: string;
  hostname: string;
  hospital_code: string | null;
  hospital_name: string | null;
  program_path: string | null;
  pid: number | null;
  status: string | null;
  last_seen: string | null;
  created_at: string;
}

// Process History - ข้อมูลละเอียดจาก process_history table
export interface ProcessHistory {
  id: number;
  process_name: string;
  pid: number | null;
  status: string;
  cpu_percent: number;
  memory_mb: number;
  memory_percent: number;
  disk_read_mb: number;
  disk_write_mb: number;
  net_sent_mb: number;
  net_recv_mb: number;
  recorded_at: string;
  hostname: string;
  uptime_seconds: number | null;
  thread_count: number | null;
  hospital_code: string | null;
  hospital_name: string | null;
  last_started: string | null;
  last_stopped: string | null;
  program_path: string | null;
  client_version: string | null;
  window_title: string | null;
  window_info: {
    company?: string | null;
    version?: string | null;
    window_title?: string | null;
    hospital_code?: string | null;
    hospital_name?: string | null;
  } | null;
  bms_gateway_status: string | null;
  bms_hosxp_db_status: string | null;
  bms_gateway_db_status: string | null;
  bms_last_heartbeat: string | null;
  bms_heartbeat_stale: boolean | null;
  bms_log_path: string | null;
  bms_hosxp_db_error: string | null;
  bms_gateway_db_error: string | null;
}

export interface AlertRecord {
  id: number;
  process_name: string;
  alert_type: string;
  message: string;
  value: number;
  threshold: number;
  created_at: string;
  severity: string;
  is_read: boolean;
  hostname: string | null;
  hospital_code: string | null;
  hospital_name: string | null;
  line_sent: boolean | null;
}

// Auth response type
export interface AuthResult {
  success: boolean;
  user_id: number | null;
  username: string | null;
  display_name: string | null;
  role: string | null;
}

// Session storage keys
const AUTH_KEY = 'ghPagesAuth';
const AUTH_USER_KEY = 'ghPagesUser';
const AUTH_TIME_KEY = 'ghPagesAuthTime';

// Check if authenticated on GitHub Pages
export const isGitHubPagesAuthenticated = (): boolean => {
  if (!isGitHubPages()) return false;

  const auth = sessionStorage.getItem(AUTH_KEY);
  const authTime = sessionStorage.getItem(AUTH_TIME_KEY);

  if (auth === 'true' && authTime) {
    const elapsed = Date.now() - parseInt(authTime);
    const maxAge = 8 * 60 * 60 * 1000; // 8 hours
    if (elapsed < maxAge) {
      return true;
    }
    // Session expired
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TIME_KEY);
  }
  return false;
};

// Get current user info
export const getGitHubPagesUser = (): { username: string; displayName: string; role: string } | null => {
  const userStr = sessionStorage.getItem(AUTH_USER_KEY);
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
};

// Logout
export const logoutGitHubPages = (): void => {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TIME_KEY);
};

// API functions for GitHub Pages
export const supabaseApi = {
  // Login via Supabase RPC function
  login: async (username: string, password: string): Promise<{ success: boolean; message: string; user?: AuthResult }> => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_admin_password`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_username: username,
          p_password: password,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Login error:', errorText);
        return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' };
      }

      const results: AuthResult[] = await response.json();
      const result = results[0];

      if (result && result.success) {
        // Save session
        sessionStorage.setItem(AUTH_KEY, 'true');
        sessionStorage.setItem(AUTH_TIME_KEY, Date.now().toString());
        sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify({
          username: result.username,
          displayName: result.display_name,
          role: result.role,
        }));

        return {
          success: true,
          message: 'เข้าสู่ระบบสำเร็จ',
          user: result,
        };
      } else {
        return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
      }
    } catch (error: any) {
      console.error('Login error:', error);
      return { success: false, message: error.message || 'เกิดข้อผิดพลาด' };
    }
  },

  // Get all monitored processes (from process_history)
  getMonitoredProcesses: async (): Promise<ProcessHistory[]> => {
    return supabase.select<ProcessHistory>('process_history', {
      order: 'hospital_name.asc,hostname.asc',
    });
  },

  // Get recent alerts
  getAlerts: async (limit: number = 100): Promise<AlertRecord[]> => {
    return supabase.select<AlertRecord>('alerts', {
      order: 'created_at.desc',
      limit,
    });
  },

  // Get alerts by type
  getAlertsByType: async (alertType: string, limit: number = 50): Promise<AlertRecord[]> => {
    return supabase.select<AlertRecord>('alerts', {
      filters: { 'alert_type': `eq.${alertType}` },
      order: 'created_at.desc',
      limit,
    });
  },

  // Get process alerts (STARTED/STOPPED only)
  getProcessAlerts: async (limit: number = 50): Promise<AlertRecord[]> => {
    return supabase.select<AlertRecord>('alerts', {
      filters: { 'alert_type': 'in.(PROCESS_STARTED,PROCESS_STOPPED)' },
      order: 'created_at.desc',
      limit,
    });
  },

  // Subscribe to push notifications
  subscribePush: async (subscription: PushSubscription): Promise<boolean> => {
    try {
      const keys = subscription.toJSON().keys;
      if (!keys) {
        console.error('No keys in subscription');
        return false;
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_push_subscription`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_endpoint: subscription.endpoint,
          p_p256dh: keys.p256dh,
          p_auth: keys.auth,
          p_user_agent: navigator.userAgent,
          p_hospital_code: null
        }),
      });

      if (!response.ok) {
        console.error('Failed to save subscription:', await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving subscription:', error);
      return false;
    }
  },

  // Unsubscribe from push notifications
  unsubscribePush: async (endpoint: string): Promise<boolean> => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/remove_push_subscription`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_endpoint: endpoint
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error removing subscription:', error);
      return false;
    }
  },
};

// =============================================
// Push Notification Helper Functions
// =============================================

// VAPID Public Key - ต้องตรงกับ backend
export const VAPID_PUBLIC_KEY = 'BP4on457V_VQNQsnBKXlsXVEBTPpHZzfBpfOO-pfmVqYd_XhzS7lfg0LjJc_hKqJMMJiT9gvetjwiGpjYNsN9LI';

// Convert VAPID key to ArrayBuffer for subscription
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

// Check if push notifications are supported
export const isPushSupported = (): boolean => {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

// Check current notification permission
export const getNotificationPermission = (): NotificationPermission => {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
};

// Subscribe to push notifications
export const subscribeToPush = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) {
    console.error('Push notifications not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // Save to Supabase
    const saved = await supabaseApi.subscribePush(subscription);
    if (!saved) {
      console.warn('Failed to save subscription to server');
    }

    return subscription;
  } catch (error) {
    console.error('Error subscribing to push:', error);
    return null;
  }
};

// Unsubscribe from push notifications
export const unsubscribeFromPush = async (): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Remove from Supabase
      await supabaseApi.unsubscribePush(subscription.endpoint);
      // Unsubscribe from browser
      await subscription.unsubscribe();
    }

    return true;
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    return false;
  }
};

// Check if already subscribed
export const isPushSubscribed = async (): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
};
