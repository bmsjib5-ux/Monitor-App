import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Filter, RefreshCw, Building2, Activity, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, Moon, Sun, Monitor, LogOut, Play, Square, Trash2, X, TrendingUp, Clock, Bell, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, RotateCcw, GripVertical, Info, Shield, BookOpen } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ProcessInfo, Alert } from '../types';
import { api } from '../api';
import ToastNotification from './ToastNotification';
import AlertPanel from './AlertPanel';
import LineSettingsModal from './LineSettingsModal';
import BMSStatusIndicator from './BMSStatusIndicator';

interface ProcessHistoryData {
  timestamp: string;
  cpu_percent: number;
  memory_mb: number;
  disk_read_mb: number;
  disk_write_mb: number;
  net_sent_mb: number;
  net_recv_mb: number;
}

interface MasterDashboardProps {
  onSwitchToClient: () => void;
  onLogout: () => void;
}

interface HospitalGroup {
  hospitalCode: string;
  hospitalName: string;
  processes: ProcessInfo[];
  totalCpu: number;
  totalMemory: number;
  runningCount: number;
  stoppedCount: number;
  clientVersion?: string;
  programVersion?: string; // Version จาก window_info ของโปรแกรม BMS
}

// Sort configuration type
type SortField = 'hospital_code' | 'hospital_name' | 'name' | 'pid' | 'status' | 'cpu_percent' | 'memory_mb' | 'uptime';
type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  field: SortField | null;
  direction: SortDirection;
}

// LocalStorage key for read alerts
const READ_ALERTS_STORAGE_KEY = 'monitorapp_read_alerts';

// LocalStorage keys for column settings
const COLUMN_WIDTHS_STORAGE_KEY = 'monitorapp_column_widths';
const COLUMN_ORDER_STORAGE_KEY = 'monitorapp_column_order';

// Default column order
const DEFAULT_COLUMN_ORDER = [
  'hospital_code', 'hospital_name', 'program', 'version', 'pid', 'status',
  'gw_status', 'db_hosxp', 'db_gateway', 'cpu', 'memory', 'uptime', 'actions'
];

// Default column widths
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  hospital_code: 80,
  hospital_name: 180,
  program: 280,
  version: 100,
  pid: 70,
  status: 80,
  gw_status: 70,
  db_hosxp: 80,
  db_gateway: 90,
  cpu: 80,
  memory: 100,
  uptime: 100,
  actions: 80
};

// Helper to get column widths from localStorage
const getColumnWidthsFromStorage = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults in case new columns are added
      return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
    }
    return DEFAULT_COLUMN_WIDTHS;
  } catch {
    return DEFAULT_COLUMN_WIDTHS;
  }
};

// Helper to save column widths to localStorage
const saveColumnWidthsToStorage = (widths: Record<string, number>) => {
  try {
    localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch (error) {
    console.error('Error saving column widths to localStorage:', error);
  }
};

// Helper to get column order from localStorage
const getColumnOrderFromStorage = (): string[] => {
  try {
    const stored = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that all default columns are present
      const validOrder = parsed.filter((col: string) => DEFAULT_COLUMN_ORDER.includes(col));
      // Add any missing columns at the end
      DEFAULT_COLUMN_ORDER.forEach(col => {
        if (!validOrder.includes(col)) {
          validOrder.push(col);
        }
      });
      return validOrder;
    }
    return DEFAULT_COLUMN_ORDER;
  } catch {
    return DEFAULT_COLUMN_ORDER;
  }
};

// Helper to save column order to localStorage
const saveColumnOrderToStorage = (order: string[]) => {
  try {
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch (error) {
    console.error('Error saving column order to localStorage:', error);
  }
};

// Helper to get read alerts from localStorage
const getReadAlertsFromStorage = (): Set<string> => {
  try {
    const stored = localStorage.getItem(READ_ALERTS_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

// Helper to save read alerts to localStorage
const saveReadAlertsToStorage = (readAlerts: Set<string>) => {
  try {
    // Keep only last 500 to prevent localStorage from growing too large
    const alertsArray = Array.from(readAlerts).slice(-500);
    localStorage.setItem(READ_ALERTS_STORAGE_KEY, JSON.stringify(alertsArray));
  } catch (error) {
    console.error('Error saving read alerts to localStorage:', error);
  }
};

// Helper to generate unique alert key
const getAlertKey = (alert: Alert): string => {
  return `${alert.timestamp}_${alert.process_name}_${alert.alert_type}`;
};

const MasterDashboard = ({ onSwitchToClient, onLogout }: MasterDashboardProps) => {
  const [darkMode, setDarkMode] = useState(false);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [readAlerts, setReadAlerts] = useState<Set<string>>(() => getReadAlertsFromStorage());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterHospital, setFilterHospital] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProgram, setFilterProgram] = useState<string>('all');

  // View mode
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [expandedHospitals, setExpandedHospitals] = useState<Set<string>>(new Set());

  // Sort state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: null, direction: null });

  // Process detail modal
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [processHistory, setProcessHistory] = useState<ProcessHistoryData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Alert panel
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  // Settings modals
  const [showLineSettingsModal, setShowLineSettingsModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoTab, setInfoTab] = useState<'manual' | 'security'>('manual');

  // Column resize state - load from localStorage
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => getColumnWidthsFromStorage());
  const resizingColumn = useRef<string | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  // Column order state - load from localStorage
  const [columnOrder, setColumnOrder] = useState<string[]>(() => getColumnOrderFromStorage());
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Column resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumn.current = columnKey;
    startX.current = e.clientX;
    startWidth.current = columnWidths[columnKey];
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingColumn.current) return;
    const diff = e.clientX - startX.current;
    const newWidth = Math.max(50, startWidth.current + diff);
    setColumnWidths(prev => ({
      ...prev,
      [resizingColumn.current!]: newWidth
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    if (resizingColumn.current) {
      // Save to localStorage after resize completes
      setColumnWidths(prev => {
        saveColumnWidthsToStorage(prev);
        return prev;
      });
    }
    resizingColumn.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);

  // Column drag & drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, columnKey: string) => {
    // Don't allow dragging the actions column
    if (columnKey === 'actions') {
      e.preventDefault();
      return;
    }
    setDraggedColumn(columnKey);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnKey);
    // Make the drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedColumn(null);
    setDragOverColumn(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (columnKey !== 'actions' && columnKey !== draggedColumn) {
      setDragOverColumn(columnKey);
    }
  }, [draggedColumn]);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    const sourceColumn = e.dataTransfer.getData('text/plain');

    if (sourceColumn && sourceColumn !== targetColumn && targetColumn !== 'actions') {
      setColumnOrder(prev => {
        const newOrder = [...prev];
        const sourceIndex = newOrder.indexOf(sourceColumn);
        const targetIndex = newOrder.indexOf(targetColumn);

        if (sourceIndex !== -1 && targetIndex !== -1) {
          // Remove source and insert at target position
          newOrder.splice(sourceIndex, 1);
          newOrder.splice(targetIndex, 0, sourceColumn);
          // Save to localStorage
          saveColumnOrderToStorage(newOrder);
        }
        return newOrder;
      });
    }
    setDraggedColumn(null);
    setDragOverColumn(null);
  }, []);

  // Reset column settings to defaults
  const resetColumnSettings = useCallback(() => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    saveColumnWidthsToStorage(DEFAULT_COLUMN_WIDTHS);
    saveColumnOrderToStorage(DEFAULT_COLUMN_ORDER);
  }, []);

  // Cleanup resize listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Calculate unread alerts count
  const unreadAlertsCount = useMemo(() => {
    return alerts.filter(alert => !readAlerts.has(getAlertKey(alert))).length;
  }, [alerts, readAlerts]);

  // Mark single alert as read
  const markAlertAsRead = (alert: Alert) => {
    const alertKey = getAlertKey(alert);
    if (!readAlerts.has(alertKey)) {
      const newReadAlerts = new Set(readAlerts);
      newReadAlerts.add(alertKey);
      setReadAlerts(newReadAlerts);
      saveReadAlertsToStorage(newReadAlerts);
    }
  };

  // Mark all alerts as read
  const markAllAlertsAsRead = () => {
    const newReadAlerts = new Set(readAlerts);
    alerts.forEach(alert => {
      newReadAlerts.add(getAlertKey(alert));
    });
    setReadAlerts(newReadAlerts);
    saveReadAlertsToStorage(newReadAlerts);
  };

  // Check if alert is read
  const isAlertRead = (alert: Alert): boolean => {
    return readAlerts.has(getAlertKey(alert));
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load alerts from Supabase
  const loadAlerts = async () => {
    try {
      // Fetch recent alerts from Supabase (last 24 hours)
      const response = await fetch('http://localhost:3001/api/supabase/query/alerts?limit=50');
      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          const alertsData: Alert[] = result.data.map((item: any) => ({
            timestamp: item.timestamp || item.created_at,
            process_name: item.process_name,
            alert_type: item.alert_type,
            message: item.message,
            value: item.value || 0,
            threshold: item.threshold || 0,
            hospital_code: item.hospital_code || null,
            hospital_name: item.hospital_name || null,
            hostname: item.hostname || null
          }));
          setAlerts(alertsData);
        }
      }
    } catch (error) {
      console.error('Error loading alerts from Supabase:', error);
      // Try to get from local API
      try {
        const alertsData = await api.getAlerts();
        setAlerts(alertsData);
      } catch (e) {
        console.error('Error loading local alerts:', e);
      }
    }
  };

  // Load data from Supabase
  const loadData = async () => {
    try {
      // Load alerts alongside process data
      loadAlerts();

      // Try to get data from Supabase first
      // process_history now contains hospital_code and hospital_name directly
      const response = await fetch('http://localhost:3001/api/supabase/query/process_history?limit=100');
      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          // Transform Supabase data to ProcessInfo format
          // hospital_code is now stored directly in process_history
          const processData: ProcessInfo[] = result.data.map((item: any) => ({
            name: item.process_name,
            pid: item.pid,
            status: item.status,
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
            client_version: item.client_version || null,
            window_title: item.window_title || null,
            window_info: item.window_info || null,
            // Map BMS status from Supabase fields
            bms_status: (item.bms_gateway_status || item.bms_hosxp_db_status || item.bms_gateway_db_status) ? {
              process_name: item.process_name,
              log_path: item.bms_log_path || '',
              gateway_status: item.bms_gateway_status || 'unknown',
              last_heartbeat: item.bms_last_heartbeat || null,
              heartbeat_stale: item.bms_heartbeat_stale || false,
              hosxp_db_status: item.bms_hosxp_db_status || 'unknown',
              hosxp_db_last_error: item.bms_hosxp_db_error || null,
              gateway_db_status: item.bms_gateway_db_status || 'unknown',
              gateway_db_last_error: item.bms_gateway_db_error || null,
              active_threads: 0,
              thread_errors: []
            } : null
          }));

          setProcesses(processData);
        }
      }
    } catch (error) {
      console.error('Error loading from Supabase:', error);
      // Fallback to local API
      try {
        const data = await api.getProcesses();
        setProcesses(data);
      } catch (e) {
        console.error('Error loading local data:', e);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDateTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Stop process - disabled temporarily
  // const handleStopProcess = async (processName: string, hospitalCode?: string) => {
  //   if (!confirm(`ต้องการหยุด process "${processName}" หรือไม่?`)) return;
  //   try {
  //     const response = await fetch(`http://localhost:3001/api/processes/${encodeURIComponent(processName)}/stop`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ hospital_code: hospitalCode })
  //     });
  //     if (response.ok) {
  //       alert(`หยุด ${processName} สำเร็จ`);
  //       loadData();
  //     } else {
  //       const error = await response.json();
  //       alert(`ไม่สามารถหยุด process ได้: ${error.detail || 'Unknown error'}`);
  //     }
  //   } catch (error) {
  //     console.error('Error stopping process:', error);
  //     alert('เกิดข้อผิดพลาดในการหยุด process');
  //   }
  // };

  // Start process - disabled temporarily
  // const handleStartProcess = async (processName: string, hospitalCode?: string) => {
  //   if (!confirm(`ต้องการเริ่ม process "${processName}" หรือไม่?`)) return;
  //   try {
  //     const response = await fetch(`http://localhost:3001/api/processes/${encodeURIComponent(processName)}/start`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ hospital_code: hospitalCode })
  //     });
  //     if (response.ok) {
  //       alert(`เริ่ม ${processName} สำเร็จ`);
  //       loadData();
  //     } else {
  //       const error = await response.json();
  //       alert(`ไม่สามารถเริ่ม process ได้: ${error.detail || 'Unknown error'}`);
  //     }
  //   } catch (error) {
  //     console.error('Error starting process:', error);
  //     alert('เกิดข้อผิดพลาดในการเริ่ม process');
  //   }
  // };

  // Delete process from monitoring
  const handleDeleteProcess = async (processName: string, pid: number, hospitalCode?: string) => {
    if (!confirm(`ต้องการลบ "${processName}" (PID: ${pid}) ออกจากการ monitor หรือไม่?\n\n(Process จะไม่ถูกหยุดทำงาน แต่จะไม่แสดงในรายการอีกต่อไป)`)) return;

    try {
      const response = await fetch(`http://localhost:3001/api/processes/${encodeURIComponent(processName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospital_code: hospitalCode, pid: pid })
      });

      if (response.ok) {
        alert(`ลบ ${processName} ออกจากรายการสำเร็จ`);
        loadData();
      } else {
        const error = await response.json();
        alert(`ไม่สามารถลบ process ได้: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting process:', error);
      alert('เกิดข้อผิดพลาดในการลบ process');
    }
  };

  // Open process detail modal
  const handleProcessClick = async (process: ProcessInfo) => {
    setSelectedProcess(process);
    setLoadingHistory(true);
    setProcessHistory([]);

    try {
      // Generate mock history data for demo (in production, fetch from API)
      // TODO: Replace with actual API call to get process history
      const now = new Date();
      const mockHistory: ProcessHistoryData[] = [];

      for (let i = 30; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - i * 60000); // Every minute for last 30 minutes
        mockHistory.push({
          timestamp: timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          cpu_percent: Math.max(0, process.cpu_percent + (Math.random() - 0.5) * 20),
          memory_mb: Math.max(0, process.memory_mb + (Math.random() - 0.5) * 50),
          disk_read_mb: Math.random() * 10,
          disk_write_mb: Math.random() * 5,
          net_sent_mb: Math.random() * 2,
          net_recv_mb: Math.random() * 3,
        });
      }

      setProcessHistory(mockHistory);
    } catch (error) {
      console.error('Error loading process history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Close modal
  const closeModal = () => {
    setSelectedProcess(null);
    setProcessHistory([]);
  };

  // Get unique values for filters
  const uniqueHospitals = useMemo(() => {
    const hospitals = new Map<string, string>();
    processes.forEach(p => {
      if (p.hospital_code) {
        hospitals.set(p.hospital_code, p.hospital_name || p.hospital_code);
      }
    });
    return Array.from(hospitals.entries());
  }, [processes]);

  const uniquePrograms = useMemo(() => {
    return [...new Set(processes.map(p => p.name))];
  }, [processes]);

  // Filter processes
  const filteredProcesses = useMemo(() => {
    return processes.filter(p => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchName = p.name.toLowerCase().includes(search);
        const matchHospital = p.hospital_name?.toLowerCase().includes(search) || false;
        const matchCode = p.hospital_code?.toLowerCase().includes(search) || false;
        if (!matchName && !matchHospital && !matchCode) return false;
      }

      if (filterHospital !== 'all' && p.hospital_code !== filterHospital) {
        return false;
      }

      if (filterStatus !== 'all') {
        const isRunning = p.status === 'running';
        if (filterStatus === 'running' && !isRunning) return false;
        if (filterStatus === 'stopped' && isRunning) return false;
      }

      if (filterProgram !== 'all' && p.name !== filterProgram) {
        return false;
      }

      return true;
    });
  }, [processes, searchTerm, filterHospital, filterStatus, filterProgram]);

  // Handle sort click
  const handleSort = (field: SortField) => {
    setSortConfig(prev => {
      if (prev.field !== field) {
        return { field, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { field, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { field: null, direction: null };
      }
      return { field, direction: 'asc' };
    });
  };

  // Get sort icon
  const getSortIcon = (field: SortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    if (sortConfig.direction === 'asc') {
      return <ArrowUp className="w-4 h-4 text-purple-600" />;
    }
    return <ArrowDown className="w-4 h-4 text-purple-600" />;
  };

  // Parse uptime string to seconds for sorting
  const parseUptimeToSeconds = (uptime: string | undefined): number => {
    if (!uptime || uptime === '-') return 0;
    const parts = uptime.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  // Sorted and filtered processes
  const sortedProcesses = useMemo(() => {
    if (!sortConfig.field || !sortConfig.direction) {
      return filteredProcesses;
    }

    return [...filteredProcesses].sort((a, b) => {
      const field = sortConfig.field!;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      let aValue: any;
      let bValue: any;

      switch (field) {
        case 'hospital_code':
          aValue = a.hospital_code || '';
          bValue = b.hospital_code || '';
          break;
        case 'hospital_name':
          aValue = a.hospital_name || '';
          bValue = b.hospital_name || '';
          break;
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'pid':
          aValue = a.pid;
          bValue = b.pid;
          break;
        case 'status':
          aValue = a.status === 'running' ? 1 : 0;
          bValue = b.status === 'running' ? 1 : 0;
          break;
        case 'cpu_percent':
          aValue = a.cpu_percent;
          bValue = b.cpu_percent;
          break;
        case 'memory_mb':
          aValue = a.memory_mb;
          bValue = b.memory_mb;
          break;
        case 'uptime':
          aValue = parseUptimeToSeconds(a.uptime);
          bValue = parseUptimeToSeconds(b.uptime);
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string') {
        return aValue.localeCompare(bValue) * direction;
      }
      return (aValue - bValue) * direction;
    });
  }, [filteredProcesses, sortConfig]);

  // Group by hospital
  const hospitalGroups = useMemo(() => {
    const groups = new Map<string, HospitalGroup>();

    filteredProcesses.forEach(p => {
      const code = p.hospital_code || 'unknown';
      const name = p.hospital_name || 'ไม่ระบุสถานพยาบาล';

      if (!groups.has(code)) {
        groups.set(code, {
          hospitalCode: code,
          hospitalName: name,
          processes: [],
          totalCpu: 0,
          totalMemory: 0,
          runningCount: 0,
          stoppedCount: 0,
          clientVersion: undefined,
          programVersion: undefined
        });
      }

      const group = groups.get(code)!;
      group.processes.push(p);
      group.totalCpu += p.cpu_percent;
      group.totalMemory += p.memory_mb;
      if (p.status === 'running') {
        group.runningCount++;
      } else {
        group.stoppedCount++;
      }
      // เก็บ version ล่าสุดของแต่ละ รพ.
      if (p.client_version && !group.clientVersion) {
        group.clientVersion = p.client_version;
      }
      // เก็บ program version จาก window_info (BMS version)
      if (p.window_info?.version && !group.programVersion) {
        group.programVersion = p.window_info.version;
      }
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.hospitalCode.localeCompare(b.hospitalCode)
    );
  }, [filteredProcesses]);

  // Statistics
  const stats = useMemo(() => {
    const running = filteredProcesses.filter(p => p.status === 'running').length;
    const stopped = filteredProcesses.filter(p => p.status !== 'running').length;
    const totalCpu = filteredProcesses.reduce((sum, p) => sum + p.cpu_percent, 0);
    const totalMemory = filteredProcesses.reduce((sum, p) => sum + p.memory_mb, 0);
    const hospitalCount = new Set(filteredProcesses.map(p => p.hospital_code).filter(Boolean)).size;

    return { running, stopped, totalCpu, totalMemory, hospitalCount };
  }, [filteredProcesses]);

  const toggleHospital = (code: string) => {
    const newExpanded = new Set(expandedHospitals);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedHospitals(newExpanded);
  };

  const expandAll = () => {
    const allCodes = hospitalGroups.map(g => g.hospitalCode);
    setExpandedHospitals(new Set(allCodes));
  };

  const collapseAll = () => {
    setExpandedHospitals(new Set());
  };

  const getStatusColor = (status: string) => {
    return status === 'running'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  const getStatusIcon = (status: string) => {
    return status === 'running'
      ? <CheckCircle className="w-4 h-4 text-green-500" />
      : <XCircle className="w-4 h-4 text-red-500" />;
  };

  // Column configuration for dynamic rendering
  const columnConfig: Record<string, {
    label: string;
    sortField?: SortField;
    align?: 'left' | 'center' | 'right';
    draggable?: boolean;
  }> = {
    hospital_code: { label: 'รหัส', sortField: 'hospital_code', align: 'left', draggable: true },
    hospital_name: { label: 'สถานพยาบาล', sortField: 'hospital_name', align: 'left', draggable: true },
    program: { label: 'โปรแกรม', sortField: 'name', align: 'left', draggable: true },
    version: { label: 'Version', align: 'left', draggable: true },
    pid: { label: 'PID', sortField: 'pid', align: 'left', draggable: true },
    status: { label: 'สถานะ', sortField: 'status', align: 'left', draggable: true },
    gw_status: { label: 'GW', align: 'center', draggable: true },
    db_hosxp: { label: 'DB HOSxP', align: 'center', draggable: true },
    db_gateway: { label: 'DB Gateway', align: 'center', draggable: true },
    cpu: { label: 'CPU', sortField: 'cpu_percent', align: 'left', draggable: true },
    memory: { label: 'Memory', sortField: 'memory_mb', align: 'left', draggable: true },
    uptime: { label: 'Uptime', sortField: 'uptime', align: 'left', draggable: true },
    actions: { label: 'Actions', align: 'center', draggable: false }
  };

  // Render column header
  const renderColumnHeader = (columnKey: string) => {
    const config = columnConfig[columnKey];
    if (!config) return null;

    const isDraggable = config.draggable !== false;
    const isDragOver = dragOverColumn === columnKey;

    return (
      <th
        key={columnKey}
        style={{ width: columnWidths[columnKey] }}
        className={`relative px-4 py-3 text-${config.align || 'left'} text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none ${
          config.sortField ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800' : ''
        } ${isDragOver ? 'bg-purple-100 dark:bg-purple-900/30' : ''} ${
          isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        onClick={() => config.sortField && handleSort(config.sortField)}
        draggable={isDraggable}
        onDragStart={(e) => isDraggable && handleDragStart(e, columnKey)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, columnKey)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, columnKey)}
      >
        <div className={`flex items-center ${config.align === 'center' ? 'justify-center' : ''} gap-1`}>
          {isDraggable && <GripVertical className="w-3 h-3 text-gray-400 opacity-50" />}
          {config.label}
          {config.sortField && getSortIcon(config.sortField)}
        </div>
        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-purple-500 group"
          onMouseDown={(e) => handleMouseDown(e, columnKey)}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        >
          <div className="h-full w-1 group-hover:bg-purple-500" />
        </div>
      </th>
    );
  };

  // Render column cell
  const renderColumnCell = (columnKey: string, process: ProcessInfo) => {
    switch (columnKey) {
      case 'hospital_code':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-sm font-medium text-purple-600 dark:text-purple-400 truncate">
            {process.hospital_code || '-'}
          </td>
        );
      case 'hospital_name':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-sm text-gray-900 dark:text-white truncate" title={process.hospital_name || '-'}>
            {process.hospital_name || '-'}
          </td>
        );
      case 'program':
        return (
          <td
            key={columnKey}
            style={{ width: columnWidths[columnKey] }}
            className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium truncate"
            title={process.window_info?.window_title || process.name}
          >
            {process.window_info?.window_title || process.name}
          </td>
        );
      case 'version':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-sm text-blue-600 dark:text-blue-400 font-mono truncate" title={process.window_title || ''}>
            {process.window_info?.version ? `v${process.window_info.version}` : '-'}
          </td>
        );
      case 'pid':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 truncate">
            {process.pid}
          </td>
        );
      case 'status':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(process.status)}`}>
              {getStatusIcon(process.status)}
              {process.status === 'running' ? 'ทำงาน' : 'หยุด'}
            </span>
          </td>
        );
      case 'gw_status':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-center">
            {process.bms_status ? (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                process.bms_status.gateway_status === 'running'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                  : process.bms_status.gateway_status === 'stopped'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`} title={`Gateway: ${process.bms_status.gateway_status}`}>
                {process.bms_status.gateway_status === 'running' ? 'Start' : process.bms_status.gateway_status === 'stopped' ? 'Stop' : '?'}
              </span>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </td>
        );
      case 'db_hosxp':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-center">
            {process.bms_status ? (
              <div className="flex justify-center">
                <BMSStatusIndicator
                  status={process.bms_status.hosxp_db_status}
                  tooltip={process.bms_status.hosxp_db_last_error || `HOSxP DB: ${process.bms_status.hosxp_db_status}`}
                  size="md"
                />
              </div>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </td>
        );
      case 'db_gateway':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-center">
            {process.bms_status ? (
              <div className="flex justify-center">
                <BMSStatusIndicator
                  status={process.bms_status.gateway_db_status}
                  tooltip={process.bms_status.gateway_db_last_error || `Gateway DB: ${process.bms_status.gateway_db_status}`}
                  size="md"
                />
              </div>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </td>
        );
      case 'cpu':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-sm text-gray-900 dark:text-white">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 min-w-8">
                <div
                  className={`h-2 rounded-full ${process.cpu_percent > 80 ? 'bg-red-500' : process.cpu_percent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(process.cpu_percent, 100)}%` }}
                />
              </div>
              <span className="text-xs whitespace-nowrap">{process.cpu_percent.toFixed(1)}%</span>
            </div>
          </td>
        );
      case 'memory':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-sm text-gray-900 dark:text-white truncate">
            {process.memory_mb.toFixed(1)} MB
          </td>
        );
      case 'uptime':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 truncate">
            {process.uptime}
          </td>
        );
      case 'actions':
        return (
          <td key={columnKey} style={{ width: columnWidths[columnKey] }} className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1">
              {process.status === 'running' ? (
                <button
                  disabled
                  className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50"
                  title="ปิดใช้งานชั่วคราว"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  disabled
                  className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50"
                  title="ปิดใช้งานชั่วคราว"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => handleDeleteProcess(process.name, process.pid, process.hospital_code || undefined)}
                className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
                title="ลบออกจากรายการ"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </td>
        );
      default:
        return <td key={columnKey}>-</td>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 to-indigo-600 shadow-lg">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Building2 className="w-10 h-10 text-white" />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">
                    Admin Monitor Dashboard
                  </h1>
                  <span className="px-3 py-1 bg-white/20 text-white text-sm font-medium rounded-full">
                    Master Mode
                  </span>
                  <span className="px-2 py-0.5 bg-white/30 text-white text-xs font-mono rounded">
                    v4.0.60
                  </span>
                </div>
                <p className="text-sm text-purple-100">
                  ภาพรวมการทำงานของทุกสถานพยาบาล
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Alert Button */}
              <button
                onClick={() => setShowAlertPanel(true)}
                className="relative p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                title="ดูการแจ้งเตือน"
              >
                <Bell className="w-5 h-5 text-white" />
                {unreadAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                    {unreadAlertsCount > 99 ? '99+' : unreadAlertsCount}
                  </span>
                )}
              </button>
              {/* Information Button */}
              <button
                onClick={() => setShowInfoModal(true)}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                title="ข้อมูลระบบ"
              >
                <Info className="w-5 h-5 text-white" />
              </button>
              {/* LINE OA Settings Button */}
              <button
                onClick={() => setShowLineSettingsModal(true)}
                className="p-2 rounded-lg bg-green-500/80 hover:bg-green-600 transition-colors"
                title="ตั้งค่า LINE OA"
              >
                <MessageSquare className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-white ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onSwitchToClient}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                title="Switch to Client Mode"
              >
                <Monitor className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                title={darkMode ? 'Light Mode' : 'Dark Mode'}
              >
                {darkMode ? (
                  <Sun className="w-5 h-5 text-yellow-300" />
                ) : (
                  <Moon className="w-5 h-5 text-white" />
                )}
              </button>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-600 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 text-white" />
                <span className="text-white text-sm font-medium">ออกจากระบบ</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Statistics Bar */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Building2 className="w-5 h-5 text-purple-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">สถานพยาบาล</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.hospitalCount}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Activity className="w-5 h-5 text-blue-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">โปรแกรมทั้งหมด</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{filteredProcesses.length}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">กำลังทำงาน</span>
              </div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.running}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">หยุดทำงาน</span>
              </div>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.stopped}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">CPU รวม</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalCpu.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหา ชื่อโปรแกรม, สถานพยาบาล, รหัส..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Hospital Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filterHospital}
                onChange={(e) => setFilterHospital(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">ทุกสถานพยาบาล</option>
                {uniqueHospitals.map(([code, name]) => (
                  <option key={code} value={code}>{code} - {name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="running">กำลังทำงาน</option>
              <option value="stopped">หยุดทำงาน</option>
            </select>

            {/* Program Filter */}
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">ทุกโปรแกรม</option>
              {uniquePrograms.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                ตาราง
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 text-sm ${viewMode === 'cards' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                การ์ด
              </button>
            </div>

            {viewMode === 'cards' && (
              <div className="flex gap-2">
                <button
                  onClick={expandAll}
                  className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  ขยายทั้งหมด
                </button>
                <button
                  onClick={collapseAll}
                  className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  ย่อทั้งหมด
                </button>
              </div>
            )}

            {viewMode === 'table' && (
              <button
                onClick={resetColumnSettings}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                title="รีเซ็ตคอลัมน์"
              >
                <RotateCcw className="w-4 h-4" />
                รีเซ็ตคอลัมน์
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</p>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View with Resizable & Reorderable Columns */
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
            <table className="divide-y divide-gray-200 dark:divide-gray-700" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {columnOrder.map(columnKey => renderColumnHeader(columnKey))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {sortedProcesses.map((process, idx) => (
                  <tr key={`${process.name}-${process.pid}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    {columnOrder.map(columnKey => renderColumnCell(columnKey, process))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProcesses.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                ไม่พบข้อมูลที่ตรงกับเงื่อนไข
              </div>
            )}
          </div>
        ) : (
          /* Cards View - Grouped by Hospital */
          <div className="space-y-4">
            {hospitalGroups.map(group => (
              <div key={group.hospitalCode} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                {/* Hospital Header */}
                <button
                  onClick={() => toggleHospital(group.hospitalCode)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 hover:from-purple-100 hover:to-indigo-100 dark:hover:from-purple-900/50 dark:hover:to-indigo-900/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {group.hospitalCode !== 'unknown' ? `[${group.hospitalCode}] ` : ''}{group.hospitalName}
                        </p>
                        {group.programVersion && (
                          <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-mono rounded" title="BMS Program Version">
                            v{group.programVersion}
                          </span>
                        )}
                        {group.clientVersion && (
                          <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-mono rounded" title="Monitor Client Version">
                            {group.clientVersion}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {group.processes.length} โปรแกรม |
                        <span className="text-green-600 dark:text-green-400"> {group.runningCount} ทำงาน</span> |
                        <span className="text-red-600 dark:text-red-400"> {group.stoppedCount} หยุด</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500 dark:text-gray-400">CPU รวม</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{group.totalCpu.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Memory รวม</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{group.totalMemory.toFixed(1)} MB</p>
                    </div>
                    {expandedHospitals.has(group.hospitalCode) ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                </button>

                {/* Process List */}
                {expandedHospitals.has(group.hospitalCode) && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {group.processes.map((process, idx) => (
                      <div
                        key={`${process.name}-${process.pid}-${idx}`}
                        className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                          process.status === 'running'
                            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 hover:border-green-400'
                            : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:border-red-400'
                        }`}
                        onClick={() => handleProcessClick(process)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex flex-col min-w-0">
                            <span
                              className="font-medium text-gray-900 dark:text-white truncate flex items-center gap-1"
                              title={process.window_info?.window_title || process.name}
                            >
                              {process.window_info?.window_title || process.name}
                              <TrendingUp className="w-3 h-3 text-gray-400" />
                            </span>
                            {process.window_info?.version && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                                v{process.window_info.version}
                              </span>
                            )}
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(process.status)}`}>
                            {getStatusIcon(process.status)}
                            {process.status === 'running' ? 'ทำงาน' : 'หยุด'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          <div className="flex justify-between">
                            <span>PID:</span>
                            <span className="font-medium">{process.pid}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>CPU:</span>
                            <span className="font-medium">{process.cpu_percent.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Memory:</span>
                            <span className="font-medium">{process.memory_mb.toFixed(1)} MB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Uptime:</span>
                            <span className="font-medium">{process.uptime}</span>
                          </div>
                          {/* BMS Status */}
                          {process.bms_status && (
                            <>
                              <div className="flex justify-between items-center">
                                <span>GW:</span>
                                <span className={`text-xs font-medium ${
                                  process.bms_status.gateway_status === 'running'
                                    ? 'text-green-600 dark:text-green-400'
                                    : process.bms_status.gateway_status === 'stopped'
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-gray-500'
                                }`}>
                                  {process.bms_status.gateway_status === 'running' ? 'Start' :
                                   process.bms_status.gateway_status === 'stopped' ? 'Stop' : '-'}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>DB HOSxP:</span>
                                <BMSStatusIndicator status={process.bms_status.hosxp_db_status} size="sm" />
                              </div>
                              <div className="flex justify-between items-center">
                                <span>DB Gateway:</span>
                                <BMSStatusIndicator status={process.bms_status.gateway_db_status} size="sm" />
                              </div>
                            </>
                          )}
                        </div>
                        {/* Action Buttons - Stop/Start disabled */}
                        <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
                          {process.status === 'running' ? (
                            <button
                              disabled
                              className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-xs font-medium cursor-not-allowed opacity-50"
                              title="ปิดใช้งานชั่วคราว"
                            >
                              <Square className="w-3 h-3" />
                              Stop
                            </button>
                          ) : (
                            <button
                              disabled
                              className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-xs font-medium cursor-not-allowed opacity-50"
                              title="ปิดใช้งานชั่วคราว"
                            >
                              <Play className="w-3 h-3" />
                              Start
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProcess(process.name, process.pid, process.hospital_code || undefined); }}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium transition-colors"
                            title="ลบออกจากรายการ"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {hospitalGroups.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg">
                ไม่พบข้อมูลที่ตรงกับเงื่อนไข
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-3">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          อัพเดทอัตโนมัติทุก 10 วินาที | แสดงผล {filteredProcesses.length} จาก {processes.length} รายการ
        </div>
      </footer>

      {/* Toast Notifications */}
      <ToastNotification alerts={alerts} onDismiss={() => {}} />

      {/* Alert Panel Modal */}
      {showAlertPanel && (
        <AlertPanel
          alerts={alerts}
          onClose={() => setShowAlertPanel(false)}
          onMarkAsRead={markAlertAsRead}
          onMarkAllAsRead={markAllAlertsAsRead}
          isAlertRead={isAlertRead}
        />
      )}

      {/* LINE OA Settings Modal */}
      {showLineSettingsModal && (
        <LineSettingsModal
          isOpen={showLineSettingsModal}
          onClose={() => setShowLineSettingsModal(false)}
        />
      )}

      {/* Process Detail Modal */}
      {selectedProcess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-indigo-600">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedProcess.name}</h2>
                  <p className="text-sm text-purple-100">
                    PID: {selectedProcess.pid} | {selectedProcess.hospital_name || 'ไม่ระบุสถานพยาบาล'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Current Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                  <p className={`text-xl font-bold ${selectedProcess.status === 'running' ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedProcess.status === 'running' ? 'กำลังทำงาน' : 'หยุดทำงาน'}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">CPU Usage</p>
                  <p className="text-xl font-bold text-green-600">{selectedProcess.cpu_percent.toFixed(1)}%</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memory</p>
                  <p className="text-xl font-bold text-purple-600">{selectedProcess.memory_mb.toFixed(1)} MB</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Uptime</p>
                  <p className="text-xl font-bold text-orange-600">{selectedProcess.uptime || '-'}</p>
                </div>
              </div>

              {/* Start/Stop Times */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 flex items-start gap-3">
                  <Play className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">เริ่มทำงานล่าสุด</p>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{formatDateTime(selectedProcess.last_started)}</p>
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 flex items-start gap-3">
                  <Square className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">หยุดทำงานล่าสุด</p>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">{formatDateTime(selectedProcess.last_stopped)}</p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">บันทึกข้อมูลล่าสุด</p>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatDateTime(selectedProcess.recorded_at)}</p>
                  </div>
                </div>
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* CPU & Memory Chart */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">CPU & Memory Usage (30 นาทีล่าสุด)</h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={processHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="timestamp" stroke="#9CA3AF" fontSize={12} />
                          <YAxis yAxisId="left" stroke="#10B981" fontSize={12} />
                          <YAxis yAxisId="right" orientation="right" stroke="#8B5CF6" fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                              border: '1px solid #374151',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="cpu_percent"
                            stroke="#10B981"
                            fill="#10B981"
                            fillOpacity={0.3}
                            name="CPU (%)"
                          />
                          <Area
                            yAxisId="right"
                            type="monotone"
                            dataKey="memory_mb"
                            stroke="#8B5CF6"
                            fill="#8B5CF6"
                            fillOpacity={0.3}
                            name="Memory (MB)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Disk I/O Chart */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Disk I/O</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={processHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="timestamp" stroke="#9CA3AF" fontSize={12} />
                          <YAxis stroke="#9CA3AF" fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                              border: '1px solid #374151',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="disk_read_mb" stroke="#3B82F6" name="Read (MB/s)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="disk_write_mb" stroke="#F59E0B" name="Write (MB/s)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Network Chart */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Network I/O</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={processHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="timestamp" stroke="#9CA3AF" fontSize={12} />
                          <YAxis stroke="#9CA3AF" fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                              border: '1px solid #374151',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="net_sent_mb" stroke="#EC4899" name="Sent (MB/s)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="net_recv_mb" stroke="#06B6D4" name="Received (MB/s)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Information Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInfoModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-indigo-600">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6 text-white" />
                <h2 className="text-xl font-bold text-white">Information</h2>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-2 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setInfoTab('manual')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  infoTab === 'manual'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                คู่มือการใช้งาน
              </button>
              <button
                onClick={() => setInfoTab('security')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  infoTab === 'security'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Shield className="w-4 h-4" />
                มาตรฐาน Cyber Security
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)]">
              {infoTab === 'manual' ? (
                <div className="space-y-6 text-gray-700 dark:text-gray-300">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Windows Application Monitor v4.0.60</h3>
                    <p className="text-sm">ระบบ Monitor การทำงานของโปรแกรม BMS HOSxP LIS Gateway แบบ Real-time สำหรับผู้ดูแลระบบส่วนกลาง</p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-purple-500" /> โหมดการใช้งาน
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                        <span className="font-medium text-purple-700 dark:text-purple-300">Admin Mode (Master)</span>
                        <p className="mt-1">ดูภาพรวมทุกสถานพยาบาล, จัดการ Process, ตั้งค่า LINE OA, ดู Alerts</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <span className="font-medium text-blue-700 dark:text-blue-300">Client Mode</span>
                        <p className="mt-1">ดูสถานะ Process ของเครื่องตัวเอง, เพิ่ม/ลบ Process ที่ต้องการ Monitor</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-green-500" /> ฟีเจอร์หลัก
                    </h4>
                    <ul className="space-y-1.5 text-sm list-none">
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Monitor สถานะ Process แบบ Real-time (อัพเดททุก 2 วินาที)</li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> ดู CPU, Memory, Disk I/O, Network ของแต่ละ Process</li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> ตรวจสอบสถานะ BMS Gateway, DB HOSxP, DB Gateway</li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> แจ้งเตือนผ่าน LINE OA เมื่อ Process หยุดทำงาน</li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> กราฟแสดงข้อมูลย้อนหลัง 30 นาที</li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> รองรับ Dark Mode / Light Mode</li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> ปรับขนาดและลำดับคอลัมน์ได้ (ลาก Drag & Drop)</li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> กรองข้อมูลตามสถานพยาบาล, สถานะ, โปรแกรม</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-yellow-500" /> ระบบแจ้งเตือน
                    </h4>
                    <ul className="space-y-1.5 text-sm list-none">
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" /> แจ้งเตือนเมื่อ CPU เกิน 100%</li>
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" /> แจ้งเตือนเมื่อ Memory เกิน 100%</li>
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" /> แจ้งเตือนเมื่อ Process หยุดทำงาน</li>
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" /> ส่ง LINE Notification อัตโนมัติ</li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">ปุ่มบน Header</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2"><Info className="w-4 h-4 text-white bg-purple-500 rounded p-0.5" /> ข้อมูลระบบ (หน้านี้)</div>
                      <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-white bg-green-500 rounded p-0.5" /> ตั้งค่า LINE OA</div>
                      <div className="flex items-center gap-2"><Bell className="w-4 h-4 text-white bg-purple-500 rounded p-0.5" /> ดูการแจ้งเตือน</div>
                      <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-white bg-purple-500 rounded p-0.5" /> Refresh ข้อมูล</div>
                      <div className="flex items-center gap-2"><Monitor className="w-4 h-4 text-white bg-purple-500 rounded p-0.5" /> สลับไป Client Mode</div>
                      <div className="flex items-center gap-2"><Moon className="w-4 h-4 text-white bg-purple-500 rounded p-0.5" /> สลับ Dark/Light Mode</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 text-gray-700 dark:text-gray-300">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-green-500" /> Cyber Security Standards
                    </h3>
                    <p className="text-sm">มาตรการรักษาความปลอดภัยที่ใช้ในระบบ MonitorApp v4.0.60</p>
                  </div>

                  {/* Authentication & Authorization */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">1. Authentication & Authorization</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left border-b border-blue-200 dark:border-blue-800">
                          <th className="pb-2 pr-4">มาตรการ</th><th className="pb-2 pr-4">รายละเอียด</th><th className="pb-2">มาตรฐาน</th>
                        </tr></thead>
                        <tbody className="space-y-1">
                          <tr><td className="py-1.5 pr-4 font-medium">JWT Token</td><td className="py-1.5 pr-4">HS256 signed, หมดอายุ 8 ชม.</td><td className="py-1.5 text-xs text-blue-600 dark:text-blue-400">RFC 7519</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Password Hashing</td><td className="py-1.5 pr-4">bcrypt with salt</td><td className="py-1.5 text-xs text-blue-600 dark:text-blue-400">OWASP Password Storage</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Password Complexity</td><td className="py-1.5 pr-4">8+ ตัวอักษร, ตัวอักษร+ตัวเลข</td><td className="py-1.5 text-xs text-blue-600 dark:text-blue-400">NIST SP 800-63B</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">WebSocket Auth</td><td className="py-1.5 pr-4">Protocol-based token</td><td className="py-1.5 text-xs text-blue-600 dark:text-blue-400">RFC 6455</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Encryption */}
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <h4 className="font-semibold text-green-800 dark:text-green-300 mb-3">2. Encryption & Data Protection</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left border-b border-green-200 dark:border-green-800">
                          <th className="pb-2 pr-4">มาตรการ</th><th className="pb-2 pr-4">รายละเอียด</th><th className="pb-2">มาตรฐาน</th>
                        </tr></thead>
                        <tbody>
                          <tr><td className="py-1.5 pr-4 font-medium">Fernet Encryption</td><td className="py-1.5 pr-4">AES-128-CBC + HMAC-SHA256</td><td className="py-1.5 text-xs text-green-600 dark:text-green-400">NIST AES</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Master Key แยกไฟล์</td><td className="py-1.5 pr-4">ไม่อยู่ใน Git repository</td><td className="py-1.5 text-xs text-green-600 dark:text-green-400">OWASP Key Management</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Key Rotation</td><td className="py-1.5 pr-4">CLI tool หมุนเปลี่ยน key ได้</td><td className="py-1.5 text-xs text-green-600 dark:text-green-400">NIST SP 800-57</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Network Security */}
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-3">3. Network Security</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left border-b border-purple-200 dark:border-purple-800">
                          <th className="pb-2 pr-4">มาตรการ</th><th className="pb-2 pr-4">รายละเอียด</th><th className="pb-2">มาตรฐาน</th>
                        </tr></thead>
                        <tbody>
                          <tr><td className="py-1.5 pr-4 font-medium">CORS Restriction</td><td className="py-1.5 pr-4">จำกัด origins เฉพาะที่กำหนด</td><td className="py-1.5 text-xs text-purple-600 dark:text-purple-400">OWASP CORS</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">HTTPS/TLS</td><td className="py-1.5 pr-4">รองรับ SSL cert/key config</td><td className="py-1.5 text-xs text-purple-600 dark:text-purple-400">TLS 1.2+</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Security Headers</td><td className="py-1.5 pr-4">CSP, X-Frame-Options, HSTS</td><td className="py-1.5 text-xs text-purple-600 dark:text-purple-400">OWASP Secure Headers</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Input Validation */}
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-800 dark:text-orange-300 mb-3">4. Input Validation & Rate Limiting</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left border-b border-orange-200 dark:border-orange-800">
                          <th className="pb-2 pr-4">มาตรการ</th><th className="pb-2 pr-4">รายละเอียด</th><th className="pb-2">มาตรฐาน</th>
                        </tr></thead>
                        <tbody>
                          <tr><td className="py-1.5 pr-4 font-medium">Login Rate Limiting</td><td className="py-1.5 pr-4">สูงสุด 5 ครั้ง / 5 นาที</td><td className="py-1.5 text-xs text-orange-600 dark:text-orange-400">OWASP Brute Force</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Request Size Limit</td><td className="py-1.5 pr-4">จำกัด body 1MB</td><td className="py-1.5 text-xs text-orange-600 dark:text-orange-400">OWASP Input Validation</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Input Sanitization</td><td className="py-1.5 pr-4">Pydantic validators</td><td className="py-1.5 text-xs text-orange-600 dark:text-orange-400">OWASP Input Validation</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Error Sanitization</td><td className="py-1.5 pr-4">ไม่ส่ง internal error ให้ client</td><td className="py-1.5 text-xs text-orange-600 dark:text-orange-400">OWASP Error Handling</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Logging */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-800 dark:text-gray-300 mb-3">5. Logging & Audit</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left border-b border-gray-200 dark:border-gray-700">
                          <th className="pb-2 pr-4">มาตรการ</th><th className="pb-2 pr-4">รายละเอียด</th><th className="pb-2">มาตรฐาน</th>
                        </tr></thead>
                        <tbody>
                          <tr><td className="py-1.5 pr-4 font-medium">Security Audit</td><td className="py-1.5 pr-4">บันทึก request ที่น่าสงสัย</td><td className="py-1.5 text-xs text-gray-600 dark:text-gray-400">OWASP Logging</td></tr>
                          <tr><td className="py-1.5 pr-4 font-medium">Structured Logging</td><td className="py-1.5 pr-4">Log file แยก, ระดับ configurable</td><td className="py-1.5 text-xs text-gray-600 dark:text-gray-400">-</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Standards Reference */}
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
                    <h4 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-3">มาตรฐานที่อ้างอิง</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                        <div><span className="font-medium">OWASP Top 10</span><br/><span className="text-xs text-gray-500 dark:text-gray-400">Injection, Broken Auth, Security Misconfiguration, Sensitive Data Exposure</span></div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                        <div><span className="font-medium">NIST SP 800-63B</span><br/><span className="text-xs text-gray-500 dark:text-gray-400">Digital Identity / Password Guidelines</span></div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                        <div><span className="font-medium">NIST SP 800-57</span><br/><span className="text-xs text-gray-500 dark:text-gray-400">Key Management Recommendation</span></div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                        <div><span className="font-medium">RFC 7519 / RFC 6455</span><br/><span className="text-xs text-gray-500 dark:text-gray-400">JSON Web Token / WebSocket Protocol</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDashboard;
