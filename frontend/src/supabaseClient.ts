/**
 * Supabase Client for GitHub Pages (Read-Only Mode)
 *
 * ใช้สำหรับดึงข้อมูลจาก Supabase โดยตรงเมื่อรันบน GitHub Pages
 * เนื่องจาก GitHub Pages ไม่มี backend API
 */

// Supabase configuration - Public anon key (read-only)
const SUPABASE_URL = 'https://ktkklfpncuhvduxxumhb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a2tsZnBuY3VodmR1eHh1bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5NTM2NjAsImV4cCI6MjA1MzUyOTY2MH0.sb_publishable_5O2X0d0UEweFyrQA5dQ74w_VV5FbiXUU_bJ-B0Q';

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

  // Get all monitored processes
  getMonitoredProcesses: async (): Promise<MonitoredProcess[]> => {
    return supabase.select<MonitoredProcess>('monitored_processes', {
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
};
