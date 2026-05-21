// Restart schedule types
export type RestartScheduleType = 'none' | 'interval' | 'daily';

export interface RestartSchedule {
  type: RestartScheduleType;
  intervalMinutes?: number;
  intervalSeconds?: number;
  dailyTime?: string; // HH:mm format
  enabled: boolean;
}

// Auto-start schedule types (start when process is stopped)
export type AutoStartScheduleType = 'none' | 'interval' | 'daily';

export interface AutoStartSchedule {
  type: AutoStartScheduleType;
  intervalMinutes?: number;
  intervalSeconds?: number;
  dailyTime?: string; // HH:mm format
  enabled: boolean;
}

// Window info parsed from BMS process window title
export interface WindowInfo {
  version?: string;
  hospital_code?: string;
  hospital_name?: string;
  company?: string;
  window_title?: string;
}

// BMS Gateway status types
export type BMSConnectionStatus = 'connected' | 'disconnected' | 'unknown';
export type BMSGatewayRunStatus = 'running' | 'stopped' | 'unknown';

// BMS Gateway status from log files
export interface BMSGatewayStatus {
  process_name: string;
  log_path: string;

  // Gateway status
  gateway_status: BMSGatewayRunStatus;
  gateway_last_event?: string;
  gateway_last_event_time?: string;

  // Heartbeat
  last_heartbeat?: string;
  heartbeat_stale: boolean;

  // DB Connection status
  hosxp_db_status: BMSConnectionStatus;
  hosxp_db_host?: string;
  hosxp_db_last_error?: string;

  gateway_db_status: BMSConnectionStatus;
  gateway_db_host?: string;
  gateway_db_last_error?: string;

  // Thread info
  active_threads: number;
  thread_errors: string[];

  // Timestamps
  last_check?: string;
  last_error_time?: string;
}

export interface ProcessInfo {
  name: string;
  pid: number;
  status: string;
  cpu_percent: number;
  memory_mb: number;
  memory_percent: number;
  disk_read_mb: number;
  disk_write_mb: number;
  net_sent_mb: number;
  net_recv_mb: number;
  uptime: string;
  create_time?: number;
  hospital_code?: string;
  hospital_name?: string;
  company_name?: string;
  install_date?: string;          // YYYY-MM-DD
  warranty_expiry_date?: string;  // YYYY-MM-DD
  hostname?: string;
  program_path?: string;
  last_started?: string;
  last_stopped?: string;
  recorded_at?: string;
  restart_schedule?: RestartSchedule;
  auto_start_schedule?: AutoStartSchedule;
  client_version?: string;
  window_title?: string;
  window_info?: WindowInfo;
  bms_status?: BMSGatewayStatus;
}

export interface ProcessMetrics {
  timestamp: string;
  name: string;
  pid: number;
  cpu_percent: number;
  memory_mb: number;
  memory_percent: number;
  disk_read_mb: number;
  disk_write_mb: number;
  net_sent_mb: number;
  net_recv_mb: number;
}

export interface Alert {
  timestamp: string;
  process_name: string;
  alert_type: string;
  message: string;
  value: number;
  threshold?: number;
  hospital_code?: string;
  hospital_name?: string;
  hostname?: string;
}

export interface ThresholdConfig {
  cpu_threshold: number;
  ram_threshold: number;
  disk_io_threshold: number;
  network_threshold: number;
}

export interface AvailableProcess {
  name: string;
  pid: number;
}

export interface ProcessControlRequest {
  process_name: string;
  executable_path?: string;
  force?: boolean;
}

export interface ProcessControlResponse {
  success: boolean;
  message: string;
  pid?: number;
}

export interface DatabaseConfig {
  db_host: string;
  db_port: number;
  db_user: string;
  db_password: string;
  db_name: string;
}

export interface DatabaseStatus {
  connected: boolean;
  host: string;
  port: number;
  database: string;
  tables: string[];
  error?: string;
}

export interface AddProcessData {
  processName: string;
  pid?: number;
  hostname?: string;
  hospitalCode: string;
  hospitalName: string;
  companyName?: string;
  installDate?: string;          // YYYY-MM-DD
  warrantyExpiryDate?: string;   // YYYY-MM-DD
  programPath?: string;
}

// Alert Settings - การตั้งค่าการแจ้งเตือน
export interface AlertSettings {
  // เปิด/ปิดการแจ้งเตือนแต่ละประเภท
  cpuAlertEnabled: boolean;
  ramAlertEnabled: boolean;
  diskIoAlertEnabled: boolean;
  networkAlertEnabled: boolean;
  processStoppedAlertEnabled: boolean;

  // ค่า threshold
  cpuThreshold: number;
  ramThreshold: number;
  diskIoThreshold: number;
  networkThreshold: number;

  // ตั้งค่าแจ้งเตือนเมื่อ process หยุดนานเกิน X นาที X วินาที
  processStoppedMinutes: number;
  processStoppedSeconds: number;
}
