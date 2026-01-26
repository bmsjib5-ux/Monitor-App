import axios from 'axios';
import { ProcessInfo, Alert, ThresholdConfig, AvailableProcess, ProcessMetrics, ProcessControlResponse, DatabaseConfig, DatabaseStatus, RestartSchedule, AutoStartSchedule, AlertSettings, WindowInfo, BMSGatewayStatus } from './types';

const API_BASE_URL = 'http://localhost:3001';

export const api = {
  // System info
  getHostname: async (): Promise<string> => {
    const response = await axios.get(`${API_BASE_URL}/api/hostname`);
    return response.data.hostname;
  },

  // Process management
  getProcesses: async (): Promise<ProcessInfo[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/processes`);
    return response.data;
  },

  addProcess: async (name: string): Promise<void> => {
    await axios.post(`${API_BASE_URL}/api/processes`, { name });
  },

  removeProcess: async (name: string, pid?: number, hostname?: string): Promise<void> => {
    await axios.delete(`${API_BASE_URL}/api/processes/${name}`, {
      data: { pid, hostname }
    });
  },

  updateProcessMetadata: async (name: string, pid?: number, hostname?: string, hospitalCode?: string, hospitalName?: string, programPath?: string, isEdit: boolean = false, restartSchedule?: RestartSchedule, autoStartSchedule?: AutoStartSchedule): Promise<{ message: string; supabase_warning?: string }> => {
    const response = await axios.patch(`${API_BASE_URL}/api/processes/${name}/metadata`, {
      pid: pid,
      hostname: hostname,
      hospital_code: hospitalCode,
      hospital_name: hospitalName,
      program_path: programPath,
      is_edit: isEdit,
      restart_schedule: restartSchedule,
      auto_start_schedule: autoStartSchedule
    });
    return response.data;
  },

  getProcessHistory: async (name: string): Promise<ProcessMetrics[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/processes/${name}/history`);
    return response.data;
  },

  getAvailableProcesses: async (): Promise<AvailableProcess[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/available-processes`);
    return response.data;
  },

  // Window Info
  getProcessWindowInfo: async (processName: string, pid?: number): Promise<{
    window_title: string | null;
    window_info: WindowInfo | null;
    pid?: number;
    message?: string;
    all_titles?: string[];
  }> => {
    const params = pid ? `?pid=${pid}` : '';
    const response = await axios.get(`${API_BASE_URL}/api/processes/${encodeURIComponent(processName)}/window-info${params}`);
    return response.data;
  },

  // BMS Gateway Status
  getBMSStatus: async (processName: string): Promise<{
    success: boolean;
    message: string;
    bms_status: BMSGatewayStatus | null;
  }> => {
    const response = await axios.get(`${API_BASE_URL}/api/processes/${encodeURIComponent(processName)}/bms-status`);
    return response.data;
  },

  // Alerts
  getAlerts: async (limit: number = 50): Promise<Alert[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/alerts?limit=${limit}`);
    return response.data;
  },

  // Thresholds
  getThresholds: async (): Promise<ThresholdConfig> => {
    const response = await axios.get(`${API_BASE_URL}/api/thresholds`);
    return response.data;
  },

  updateThresholds: async (thresholds: ThresholdConfig): Promise<void> => {
    await axios.post(`${API_BASE_URL}/api/thresholds`, thresholds);
  },

  // Export
  exportCSV: async (): Promise<Blob> => {
    const response = await axios.get(`${API_BASE_URL}/api/export/csv`, {
      responseType: 'blob'
    });
    return response.data;
  },

  exportExcel: async (): Promise<Blob> => {
    const response = await axios.get(`${API_BASE_URL}/api/export/excel`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Process Control
  stopProcess: async (
    processName: string,
    options: {
      pid?: number;
      hostname?: string;
      hospitalCode?: string;
      force?: boolean
    } = {}
  ): Promise<ProcessControlResponse> => {
    const response = await axios.post(`${API_BASE_URL}/api/processes/${processName}/stop`, {
      pid: options.pid,
      hostname: options.hostname,
      hospital_code: options.hospitalCode,
      force: options.force || false
    });
    return response.data;
  },

  startProcess: async (
    processName: string,
    options: {
      pid?: number;
      hostname?: string;
      hospitalCode?: string;
      executablePath?: string
    } = {}
  ): Promise<ProcessControlResponse> => {
    const response = await axios.post(`${API_BASE_URL}/api/processes/${processName}/start`, {
      pid: options.pid,
      hostname: options.hostname,
      hospital_code: options.hospitalCode,
      executable_path: options.executablePath
    });
    return response.data;
  },

  restartProcess: async (
    processName: string,
    options: {
      pid?: number;
      hostname?: string;
      hospitalCode?: string;
      executablePath?: string;
      force?: boolean
    } = {}
  ): Promise<ProcessControlResponse> => {
    const response = await axios.post(`${API_BASE_URL}/api/processes/${processName}/restart`, {
      pid: options.pid,
      hostname: options.hostname,
      hospital_code: options.hospitalCode,
      executable_path: options.executablePath,
      force: options.force || false
    });
    return response.data;
  },
  // Database
  getDatabaseStatus: async (): Promise<DatabaseStatus> => {
    const response = await axios.get(`${API_BASE_URL}/api/database/status`);
    return response.data;
  },

  getDatabaseConfig: async (): Promise<DatabaseConfig> => {
    const response = await axios.get(`${API_BASE_URL}/api/database/config`);
    return response.data;
  },

  testDatabaseConnection: async (config: DatabaseConfig): Promise<{ success: boolean; message: string; tables: string[] }> => {
    const response = await axios.post(`${API_BASE_URL}/api/database/test`, config);
    return response.data;
  },

  reconnectDatabase: async (): Promise<{ success: boolean; message: string }> => {
    const response = await axios.post(`${API_BASE_URL}/api/database/reconnect`);
    return response.data;
  },

  initDatabaseTables: async (): Promise<{ success: boolean; message: string; tables: string[] }> => {
    const response = await axios.post(`${API_BASE_URL}/api/database/init-tables`);
    return response.data;
  },

  // Alert Settings
  getAlertSettings: async (): Promise<AlertSettings> => {
    const response = await axios.get(`${API_BASE_URL}/api/alert-settings`);
    return response.data;
  },

  updateAlertSettings: async (settings: AlertSettings): Promise<void> => {
    await axios.post(`${API_BASE_URL}/api/alert-settings`, settings);
  },

  // Clear local cache - removes local orphaned data only (does NOT delete Supabase data)
  clearCache: async (): Promise<{ success: boolean; message: string; details: { logs_cleared: boolean; local_metadata_cleaned: number; local_cache_cleared: boolean; kept_processes: string[] } }> => {
    const response = await axios.post(`${API_BASE_URL}/api/clear-cache`);
    return response.data;
  },
};

// WebSocket connection
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private onMessageCallback: ((data: any) => void) | null = null;

  connect(onMessage: (data: any) => void) {
    this.onMessageCallback = onMessage;
    this.createConnection();
  }

  private createConnection() {
    try {
      // Close existing connection if any
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.ws = new WebSocket('ws://localhost:3001/ws');

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (this.onMessageCallback) {
            this.onMessageCallback(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        // Don't reconnect immediately if closed normally
        if (event.code !== 1000) {
          this.reconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.warn('WebSocket connection error - will retry...', error);
        // Error will trigger onclose, which handles reconnection
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      this.createConnection();
    }, 3000);
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
