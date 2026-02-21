import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Plus, Download, AlertTriangle, RefreshCw, Bell, Trash2, MessageCircle, Key } from 'lucide-react';
import { ProcessInfo, Alert, AlertSettings } from '../types';
import { api, WebSocketClient } from '../api';
import ProcessTable from './ProcessTable';
import ProcessCharts from './ProcessCharts';
import AddProcessModal from './AddProcessModal';
import AlertPanel from './AlertPanel';
import EditProcessModal, { RestartSchedule, AutoStartSchedule } from './EditProcessModal';
import AlertSettingsModal from './AlertSettingsModal';
import ToastNotification from './ToastNotification';
import LicenseModal, { getLicenseFromStorage, verifyLicenseKey } from './LicenseModal';
import { saveProcessMetadata, getStoredMetadata, getAlertSettings } from '../utils/localStorage';

interface ClientDashboardProps {
  onSwitchToMaster: () => void;
}

// LocalStorage key for read alerts
const READ_ALERTS_KEY = 'monitorapp_read_alerts';

// Helper functions for read alerts persistence
const getReadAlertsFromStorage = (): Set<string> => {
  try {
    const stored = localStorage.getItem(READ_ALERTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Clean old alerts (older than 7 days)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const filtered = parsed.filter((item: { key: string; timestamp: number }) =>
        item.timestamp > sevenDaysAgo
      );
      return new Set(filtered.map((item: { key: string }) => item.key));
    }
  } catch (e) {
    console.error('Error reading read alerts from storage:', e);
  }
  return new Set();
};

const saveReadAlertsToStorage = (readAlerts: Set<string>) => {
  try {
    const items = Array.from(readAlerts).map(key => ({
      key,
      timestamp: Date.now()
    }));
    localStorage.setItem(READ_ALERTS_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Error saving read alerts to storage:', e);
  }
};

function ClientDashboard({ onSwitchToMaster }: ClientDashboardProps) {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('monitorapp_dark_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProcess, setEditingProcess] = useState<ProcessInfo | null>(null);
  const [showAlertSettingsModal, setShowAlertSettingsModal] = useState(false);
  const [, setAlertSettings] = useState<AlertSettings>(() => getAlertSettings());
  const [wsClient] = useState(() => new WebSocketClient());
  const [readAlerts, setReadAlerts] = useState<Set<string>>(() => getReadAlertsFromStorage());
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isSyncingLineSettings, setIsSyncingLineSettings] = useState(false);
  // License state
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<{ licenseKey: string; hospitalCode: string; hospitalName: string } | null>(null);
  const [licenseValid, setLicenseValid] = useState(false);
  // Store Supabase processes separately to preserve them during WebSocket updates
  const supabaseProcessesRef = useRef<ProcessInfo[]>([]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('monitorapp_dark_mode', darkMode.toString());
    } catch { /* ignore */ }
  }, [darkMode]);

  // Load and verify license on startup
  useEffect(() => {
    const checkLicense = async () => {
      const storedLicense = getLicenseFromStorage();
      if (storedLicense) {
        // Verify license is still valid
        const result = await verifyLicenseKey(storedLicense.licenseKey);
        if (result.valid) {
          setLicenseInfo(storedLicense);
          setLicenseValid(true);
        } else {
          // License no longer valid
          setLicenseValid(false);
        }
      }
    };
    checkLicense();
  }, []);

  // Merge process data with local storage metadata
  const mergeWithLocalMetadata = (processesData: ProcessInfo[]): ProcessInfo[] => {
    const localMetadata = getStoredMetadata();
    return processesData.map(process => {
      const localData = localMetadata[process.name];
      if (localData) {
        // Use local storage data if server doesn't have it
        return {
          ...process,
          hospital_code: process.hospital_code || localData.hospitalCode,
          hospital_name: process.hospital_name || localData.hospitalName,
          program_path: process.program_path || localData.programPath
        };
      }
      return process;
    });
  };

  // Merge live data with Supabase data
  const mergeWithSupabaseData = (liveProcesses: ProcessInfo[], savedSupabaseProcesses: ProcessInfo[]): ProcessInfo[] => {
    if (savedSupabaseProcesses.length === 0) {
      return liveProcesses;
    }

    // Create map of live processes
    const liveMap = new Map(liveProcesses.map(p => [p.name.toLowerCase(), p]));

    // Start with Supabase data, update with live data
    const merged = savedSupabaseProcesses.map(sp => {
      const liveData = liveMap.get(sp.name.toLowerCase());
      if (liveData) {
        // Process is running - use live metrics but keep Supabase metadata
        return {
          ...sp,
          pid: liveData.pid,
          status: liveData.status,
          cpu_percent: liveData.cpu_percent,
          memory_mb: liveData.memory_mb,
          memory_percent: liveData.memory_percent,
          disk_read_mb: liveData.disk_read_mb,
          disk_write_mb: liveData.disk_write_mb,
          net_sent_mb: liveData.net_sent_mb,
          net_recv_mb: liveData.net_recv_mb,
          uptime: liveData.uptime,
          // Include schedule data from live data
          restart_schedule: liveData.restart_schedule,
          auto_start_schedule: liveData.auto_start_schedule,
          // Include BMS status and window info from live data
          window_title: liveData.window_title,
          window_info: liveData.window_info,
          bms_status: liveData.bms_status
        };
      }
      // Process not running - keep Supabase data with stopped status
      return { ...sp, status: 'stopped', cpu_percent: 0, memory_mb: 0, memory_percent: 0, disk_read_mb: 0, disk_write_mb: 0, net_sent_mb: 0, net_recv_mb: 0 };
    });

    // Add any live processes not in Supabase
    for (const lp of liveProcesses) {
      const exists = merged.some(mp => mp.name.toLowerCase() === lp.name.toLowerCase());
      if (!exists) {
        merged.push(lp);
      }
    }

    return merged;
  };

  useEffect(() => {
    wsClient.connect((data) => {
      if (data.type === 'update') {
        // Merge WebSocket data with Supabase data and local metadata
        const liveProcesses = data.local_processes || [];
        const merged = mergeWithSupabaseData(liveProcesses, supabaseProcessesRef.current);
        const finalProcesses = mergeWithLocalMetadata(merged);
        setProcesses(finalProcesses);
        setAlerts(data.alerts || []);
      }
    });

    loadInitialData();

    // Auto-sync LINE settings from Supabase on startup
    syncLineSettingsOnStartup();

    return () => {
      wsClient.disconnect();
    };
  }, []);

  // Auto-sync LINE settings from Supabase on startup (silent)
  const syncLineSettingsOnStartup = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/line-settings/sync', {
        method: 'POST'
      });
      const result = await response.json();
      if (result.success) {
        console.log(`LINE settings synced from ${result.source_hostname}: ${result.user_count} users, ${result.group_count} groups`);
      }
    } catch (error) {
      // Silent fail - LINE settings sync is not critical
      console.log('LINE settings sync skipped (no settings in Supabase)');
    }
  };

  // Helper function to format uptime
  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const loadInitialData = async () => {
    try {
      // Get current hostname first
      let currentHostname = '';
      try {
        const hostnameRes = await fetch('http://localhost:3001/api/hostname');
        if (hostnameRes.ok) {
          const hostnameData = await hostnameRes.json();
          currentHostname = hostnameData.hostname || '';
        }
      } catch (e) {
        console.error('Error getting hostname:', e);
      }

      // Try to load from Supabase first (to get processes even if not running)
      let loadedSupabaseProcesses: ProcessInfo[] = [];
      try {
        const response = await fetch('http://localhost:3001/api/supabase/query/process_history?limit=100');
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.length > 0) {
            // Filter by current hostname
            const filteredData = result.data.filter((item: any) =>
              !currentHostname || item.hostname === currentHostname
            );

            // Deduplicate: keep only the latest record per process_name (based on recorded_at)
            const processMap = new Map<string, any>();
            for (const item of filteredData) {
              const key = item.process_name?.toLowerCase() || '';
              const existing = processMap.get(key);
              if (!existing || new Date(item.recorded_at) > new Date(existing.recorded_at)) {
                processMap.set(key, item);
              }
            }

            // Transform to ProcessInfo
            loadedSupabaseProcesses = Array.from(processMap.values()).map((item: any) => ({
              name: item.process_name,
              pid: item.pid,
              status: item.status || 'stopped',
              cpu_percent: item.cpu_percent || 0,
              memory_mb: item.memory_mb || 0,
              memory_percent: item.memory_percent || 0,
              disk_read_mb: item.disk_read_mb || 0,
              disk_write_mb: item.disk_write_mb || 0,
              net_sent_mb: item.net_sent_mb || 0,
              net_recv_mb: item.net_recv_mb || 0,
              uptime: item.uptime_seconds ? formatUptime(item.uptime_seconds) : '-',
              hospital_code: item.hospital_code || null,
              hospital_name: item.hospital_name || null,
              hostname: item.hostname || null,
              program_path: item.program_path || null,
              recorded_at: item.recorded_at || null,
              last_started: item.last_started || null,
              last_stopped: item.last_stopped || null,
              window_title: item.window_title || null,
              window_info: item.window_info || null
            }));

            // Save to ref for WebSocket updates
            supabaseProcessesRef.current = loadedSupabaseProcesses;
          }
        }
      } catch (e) {
        console.error('Error loading from Supabase:', e);
      }

      // Also get live data from local API
      const [localProcesses, alertsData] = await Promise.all([
        api.getProcesses(),
        api.getAlerts()
      ]);

      // Merge: use Supabase data as base, update with live data from local API
      let mergedProcesses: ProcessInfo[];
      if (loadedSupabaseProcesses.length > 0) {
        // Create a map of local processes by name for quick lookup
        const localMap = new Map(localProcesses.map(p => [p.name.toLowerCase(), p]));

        // Update Supabase processes with live data
        mergedProcesses = loadedSupabaseProcesses.map(sp => {
          const liveData = localMap.get(sp.name.toLowerCase());
          if (liveData) {
            // Process is running - use live metrics and schedule data from local API
            return {
              ...sp,
              pid: liveData.pid,
              status: liveData.status,
              cpu_percent: liveData.cpu_percent,
              memory_mb: liveData.memory_mb,
              memory_percent: liveData.memory_percent,
              disk_read_mb: liveData.disk_read_mb,
              disk_write_mb: liveData.disk_write_mb,
              net_sent_mb: liveData.net_sent_mb,
              net_recv_mb: liveData.net_recv_mb,
              uptime: liveData.uptime,
              // Include schedule data from local API
              restart_schedule: liveData.restart_schedule,
              auto_start_schedule: liveData.auto_start_schedule
            };
          }
          // Process not running - keep Supabase data with stopped status
          return { ...sp, status: 'stopped' };
        });

        // Add any local processes not in Supabase
        for (const lp of localProcesses) {
          const exists = mergedProcesses.some(mp => mp.name.toLowerCase() === lp.name.toLowerCase());
          if (!exists) {
            mergedProcesses.push(lp);
          }
        }
      } else {
        // No Supabase data - use local data only
        mergedProcesses = localProcesses;
      }

      // Merge with local storage metadata
      const finalProcesses = mergeWithLocalMetadata(mergedProcesses);
      setProcesses(finalProcesses);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const handleAddProcess = async (data: {
    processName: string;
    pid?: number;
    hostname?: string;
    hospitalCode: string;
    hospitalName: string;
    companyName?: string;
    installDate?: string;
    warrantyExpiryDate?: string;
    programPath?: string;
  }) => {
    try {
      // Add process to monitoring
      await api.addProcess(data.processName);

      // Save metadata to server with pid and hostname (isEdit=false for Add)
      await api.updateProcessMetadata(
        data.processName,
        data.pid,
        data.hostname,
        data.hospitalCode,
        data.hospitalName,
        data.programPath,
        false,  // isEdit=false for Add Process
        undefined,
        undefined,
        data.companyName,
        data.installDate,
        data.warrantyExpiryDate
      );

      // Save to local storage for persistence
      saveProcessMetadata(
        data.processName,
        data.hospitalCode,
        data.hospitalName,
        data.programPath
      );

      setShowAddModal(false);
      await loadInitialData();
    } catch (error: any) {
      // Show user-friendly Thai error message
      const errorMessage = error.response?.data?.detail || 'เกิดข้อผิดพลาดในการเพิ่ม Process กรุณาลองใหม่อีกครั้ง';
      alert(errorMessage);
    }
  };

  const handleRemoveProcess = async (process: ProcessInfo) => {
    try {
      // Send pid and hostname to ensure we only delete the specific machine's process
      await api.removeProcess(process.name, process.pid, process.hostname);
      if (selectedProcess === process.name) {
        setSelectedProcess(null);
      }
      await loadInitialData();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Error removing process');
    }
  };

  const handleStopProcess = async (process: ProcessInfo) => {
    try {
      const result = await api.stopProcess(process.name, {
        pid: process.pid,
        hostname: process.hostname,
        hospitalCode: process.hospital_code,
        force: false
      });
      if (result.success) {
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Error stopping process');
    }
  };

  const handleStartProcess = async (process: ProcessInfo) => {
    try {
      const result = await api.startProcess(process.name, {
        pid: process.pid,
        hostname: process.hostname,
        hospitalCode: process.hospital_code,
        executablePath: process.program_path
      });
      if (result.success) {
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Error starting process');
    }
  };

  const handleRestartProcess = async (process: ProcessInfo) => {
    try {
      const result = await api.restartProcess(process.name, {
        pid: process.pid,
        hostname: process.hostname,
        hospitalCode: process.hospital_code,
        executablePath: process.program_path,
        force: false
      });
      if (result.success) {
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Error restarting process');
    }
  };

  const handleEditProcess = (name: string) => {
    const process = processes.find(p => p.name === name);
    if (process) {
      setEditingProcess(process);
      setShowEditModal(true);
    }
  };

  const handleSaveProcessMetadata = async (pid: number | undefined, hostname: string, hospitalCode: string, hospitalName: string, programPath: string, restartSchedule?: RestartSchedule, autoStartSchedule?: AutoStartSchedule, companyName?: string, installDate?: string, warrantyExpiryDate?: string) => {
    if (!editingProcess) return;

    try {
      // Save to server API with pid and hostname (isEdit=true for Edit)
      const response = await api.updateProcessMetadata(
        editingProcess.name,
        pid,
        hostname || undefined,
        hospitalCode || undefined,
        hospitalName || undefined,
        programPath || undefined,
        true,  // isEdit=true for Edit Process
        restartSchedule,
        autoStartSchedule,
        companyName,
        installDate,
        warrantyExpiryDate
      );

      // Save to local storage for persistence on this PC
      saveProcessMetadata(
        editingProcess.name,
        hospitalCode || undefined,
        hospitalName || undefined,
        programPath || undefined
      );

      setShowEditModal(false);
      setEditingProcess(null);
      await loadInitialData();

      // Show warning if Supabase failed but local save succeeded
      if (response?.supabase_warning) {
        console.warn(response.supabase_warning);
      }
    } catch (error: any) {
      // Show user-friendly Thai error message
      const errorMessage = error.response?.data?.detail || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง';
      alert(errorMessage);
    }
  };

  // Alert read status helpers
  const getAlertKey = (alert: Alert): string => {
    return `${alert.timestamp}_${alert.process_name}_${alert.alert_type}`;
  };

  const isAlertRead = (alert: Alert): boolean => {
    return readAlerts.has(getAlertKey(alert));
  };

  const handleMarkAsRead = (alert: Alert) => {
    const key = getAlertKey(alert);
    if (!readAlerts.has(key)) {
      const newReadAlerts = new Set(readAlerts);
      newReadAlerts.add(key);
      setReadAlerts(newReadAlerts);
      saveReadAlertsToStorage(newReadAlerts);
    }
  };

  const handleMarkAllAsRead = () => {
    const newReadAlerts = new Set(readAlerts);
    alerts.forEach(alert => {
      newReadAlerts.add(getAlertKey(alert));
    });
    setReadAlerts(newReadAlerts);
    saveReadAlertsToStorage(newReadAlerts);
  };

  const handleExportCSV = async () => {
    try {
      const blob = await api.exportCSV();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monitor_data_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Error exporting CSV');
    }
  };

  const handleExportExcel = async () => {
    try {
      const blob = await api.exportExcel();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monitor_data_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Error exporting Excel');
    }
  };

  const handleClearCache = async () => {
    const confirmClear = window.confirm(
      'ต้องการเคลียร์ข้อมูลเก่าในเครื่องนี้หรือไม่?\n\n' +
      '- จะลบ Log files ในเครื่อง\n' +
      '- จะลบ Local metadata ของ Process ที่ไม่ได้ Monitor\n' +
      '- จะไม่ลบข้อมูลใน Supabase\n' +
      '- จะไม่ลบข้อมูลของ Process ที่กำลัง Monitor อยู่'
    );

    if (!confirmClear) return;

    setIsClearingCache(true);
    try {
      const result = await api.clearCache();
      if (result.success) {
        const details = result.details as { logs_cleared: boolean; local_metadata_cleaned: number; local_cache_cleared: boolean; kept_processes: string[] };
        alert(
          `เคลียร์ Cache สำเร็จ!\n\n` +
          `- Logs cleared: ${details.logs_cleared ? 'Yes' : 'No'}\n` +
          `- Local metadata removed: ${details.local_metadata_cleaned || 0} รายการ\n` +
          `- Process ที่เก็บไว้: ${details.kept_processes.length} รายการ\n\n` +
          `(ข้อมูลใน Supabase ยังคงอยู่)`
        );
        // Reload data after clearing cache
        await loadInitialData();
      } else {
        alert('เกิดข้อผิดพลาดในการเคลียร์ Cache');
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Error clearing cache');
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleSyncLineSettings = async () => {
    setIsSyncingLineSettings(true);
    try {
      const response = await fetch('http://localhost:3001/api/line-settings/sync', {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success) {
        alert(
          `ซิงค์การตั้งค่า LINE สำเร็จ!\n\n` +
          `- จากเครื่อง: ${result.source_hostname}\n` +
          `- User IDs: ${result.user_count} คน\n` +
          `- Group IDs: ${result.group_count} กลุ่ม\n` +
          `- สถานะการแจ้งเตือน: ${result.enabled ? 'เปิด' : 'ปิด'}`
        );
      } else {
        alert(`ไม่สามารถซิงค์การตั้งค่าได้: ${result.message}`);
      }
    } catch (error: any) {
      alert('เกิดข้อผิดพลาดในการซิงค์การตั้งค่า LINE');
    } finally {
      setIsSyncingLineSettings(false);
    }
  };

  // Count unread alerts (within 5 minutes)
  const recentAlerts = alerts.filter(alert => {
    const alertTime = new Date(alert.timestamp).getTime();
    const now = new Date().getTime();
    return now - alertTime < 300000;
  });

  // Count only unread recent alerts for badge
  const unreadRecentAlerts = recentAlerts.filter(alert => !isAlertRead(alert));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Toast Notifications for process status changes */}
      <ToastNotification
        alerts={alerts}
        onDismiss={() => {}}
      />

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Process Monitor
                </h1>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-sm font-medium rounded-full">
                  Client Mode
                </span>
                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs font-mono rounded">
                  v4.1.0
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Monitor and manage processes on this machine
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAlerts(!showAlerts)}
                className="relative p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Alerts"
              >
                <AlertTriangle className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                {unreadRecentAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadRecentAlerts.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowAlertSettingsModal(true)}
                className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900 hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
                title="ตั้งค่าการแจ้งเตือน"
              >
                <Bell className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </button>
              <button
                onClick={handleSyncLineSettings}
                disabled={isSyncingLineSettings}
                className="p-2 rounded-lg bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="ซิงค์การตั้งค่า LINE (ดึงจาก Supabase)"
              >
                <MessageCircle className={`w-5 h-5 text-green-600 dark:text-green-400 ${isSyncingLineSettings ? 'animate-pulse' : ''}`} />
              </button>
              <button
                onClick={onSwitchToMaster}
                className="p-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 transition-colors"
                title="Switch to Master Mode"
              >
                <RefreshCw className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={handleClearCache}
                disabled={isClearingCache}
                className="p-2 rounded-lg bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="เคลียร์ Cache (ลบข้อมูลเก่าที่ไม่ใช้งาน)"
              >
                <Trash2 className={`w-5 h-5 text-red-600 dark:text-red-400 ${isClearingCache ? 'animate-spin' : ''}`} />
              </button>
              <div className="relative group">
                <button
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="Export"
                >
                  <Download className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>
                <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <button
                    onClick={handleExportCSV}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-t-lg"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-b-lg"
                  >
                    Export Excel
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowLicenseModal(true)}
                className={`p-2 rounded-lg transition-colors ${
                  licenseValid
                    ? 'bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800'
                    : 'bg-yellow-100 dark:bg-yellow-900 hover:bg-yellow-200 dark:hover:bg-yellow-800'
                }`}
                title={licenseValid ? `License: ${licenseInfo?.hospitalName || licenseInfo?.hospitalCode}` : 'คลิกเพื่อใส่ License'}
              >
                <Key className={`w-5 h-5 ${licenseValid ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
              </button>
              <button
                onClick={() => {
                  if (!licenseValid) {
                    alert('กรุณาใส่ License Key ก่อนเพิ่ม Process');
                    setShowLicenseModal(true);
                    return;
                  }
                  setShowAddModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Process
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={darkMode ? 'Light Mode' : 'Dark Mode'}
              >
                {darkMode ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-700" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showAlerts && (
          <AlertPanel
            alerts={alerts}
            onClose={() => setShowAlerts(false)}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            isAlertRead={isAlertRead}
          />
        )}

        <div className="mb-6">
          <ProcessTable
            processes={processes}
            onSelectProcess={setSelectedProcess}
            onRemoveProcess={handleRemoveProcess}
            onStopProcess={handleStopProcess}
            onStartProcess={handleStartProcess}
            onRestartProcess={handleRestartProcess}
            onEditProcess={handleEditProcess}
            selectedProcess={selectedProcess}
          />
        </div>

        {selectedProcess && (
          <div className="mb-6">
            <ProcessCharts processName={selectedProcess} />
          </div>
        )}

        {processes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {licenseValid ? 'No processes are being monitored' : 'กรุณาใส่ License Key ก่อนเพิ่ม Process'}
            </p>
            {!licenseValid ? (
              <button
                onClick={() => setShowLicenseModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                <Key className="w-5 h-5" />
                ใส่ License Key
              </button>
            ) : (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Your First Process
              </button>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {showLicenseModal && (
        <LicenseModal
          onClose={() => setShowLicenseModal(false)}
          onLicenseVerified={(hospitalCode, hospitalName) => {
            setLicenseInfo({
              licenseKey: getLicenseFromStorage()?.licenseKey || '',
              hospitalCode,
              hospitalName,
            });
            setLicenseValid(true);
          }}
          currentLicense={licenseInfo}
        />
      )}

      {showAddModal && (
        <AddProcessModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddProcess}
          defaultHospitalCode={licenseInfo?.hospitalCode}
          defaultHospitalName={licenseInfo?.hospitalName}
        />
      )}

      {showEditModal && editingProcess && (
        <EditProcessModal
          processName={editingProcess.name}
          pid={editingProcess.pid}
          currentHostname={editingProcess.hostname}
          currentHospitalCode={editingProcess.hospital_code}
          currentHospitalName={editingProcess.hospital_name}
          currentCompanyName={editingProcess.company_name}
          currentInstallDate={editingProcess.install_date}
          currentWarrantyExpiryDate={editingProcess.warranty_expiry_date}
          currentProgramPath={editingProcess.program_path}
          currentRestartSchedule={editingProcess.restart_schedule}
          currentAutoStartSchedule={editingProcess.auto_start_schedule}
          currentWindowTitle={editingProcess.window_title}
          currentWindowInfo={editingProcess.window_info}
          onClose={() => {
            setShowEditModal(false);
            setEditingProcess(null);
          }}
          onSave={handleSaveProcessMetadata}
        />
      )}

      {showAlertSettingsModal && (
        <AlertSettingsModal
          onClose={() => setShowAlertSettingsModal(false)}
          onSave={(settings) => {
            setAlertSettings(settings);
            console.log('Alert settings updated:', settings);
          }}
        />
      )}

    </div>
  );
}

export default ClientDashboard;
