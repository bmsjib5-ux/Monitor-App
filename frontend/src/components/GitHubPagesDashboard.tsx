import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Activity, CheckCircle, XCircle, Clock, Building2, Monitor, LogOut, Cpu, HardDrive, Database, Wifi, ArrowUpDown, Shield, WifiOff } from 'lucide-react';
import { supabaseApi, ProcessHistory, AlertRecord, getGitHubPagesUser, UserInfo } from '../supabaseClient';
import PushNotificationToggle from './PushNotificationToggle';

type SortOption = 'hospital' | 'status' | 'cpu' | 'memory' | 'update';

interface ProcessGroup {
  hospitalCode: string;
  hospitalName: string;
  processes: ProcessHistory[];
}

interface GitHubPagesDashboardProps {
  onLogout?: () => void;
}

function GitHubPagesDashboard({ onLogout }: GitHubPagesDashboardProps) {
  const user = getGitHubPagesUser() as UserInfo | null;
  const isAdmin = user?.isAdmin ?? false;
  const userHospitalCode = user?.hospitalCode;

  const [processes, setProcesses] = useState<ProcessHistory[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'processes' | 'alerts'>('processes');
  const [sortBy, setSortBy] = useState<SortOption>('hospital');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [procs, alts] = await Promise.all([
        supabaseApi.getMonitoredProcesses(),
        supabaseApi.getProcessAlerts(100),
      ]);
      setProcesses(procs);
      setAlerts(alts);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Filter processes based on user's hospital_code (if not admin)
  const filteredProcesses = useMemo(() => {
    if (isAdmin || !userHospitalCode) {
      return processes;
    }
    return processes.filter(p => p.hospital_code === userHospitalCode);
  }, [processes, isAdmin, userHospitalCode]);

  // Filter alerts based on user's hospital_code (if not admin)
  const filteredAlerts = useMemo(() => {
    if (isAdmin || !userHospitalCode) {
      return alerts;
    }
    return alerts.filter(a => a.hospital_code === userHospitalCode);
  }, [alerts, isAdmin, userHospitalCode]);

  useEffect(() => {
    fetchData();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sort processes based on selected option (use filtered data)
  const sortedProcesses = [...filteredProcesses].sort((a, b) => {
    switch (sortBy) {
      case 'status':
        // Stopped first, then running
        if (a.status !== b.status) {
          return a.status === 'stopped' ? -1 : 1;
        }
        return (a.hospital_name || '').localeCompare(b.hospital_name || '', 'th');
      case 'cpu':
        return (b.cpu_percent || 0) - (a.cpu_percent || 0);
      case 'memory':
        return (b.memory_mb || 0) - (a.memory_mb || 0);
      case 'update':
        return new Date(b.recorded_at || 0).getTime() - new Date(a.recorded_at || 0).getTime();
      case 'hospital':
      default:
        return (a.hospital_name || '').localeCompare(b.hospital_name || '', 'th');
    }
  });

  // Group processes by hospital
  const groupedProcesses = sortedProcesses.reduce<ProcessGroup[]>((acc, proc) => {
    const code = proc.hospital_code || 'unknown';
    const name = proc.hospital_name || 'ไม่ระบุสถานพยาบาล';

    let group = acc.find(g => g.hospitalCode === code);
    if (!group) {
      group = { hospitalCode: code, hospitalName: name, processes: [] };
      acc.push(group);
    }
    group.processes.push(proc);
    return acc;
  }, []);

  // Sort groups by hospital name (only for hospital sort mode)
  if (sortBy === 'hospital') {
    groupedProcesses.sort((a, b) => a.hospitalName.localeCompare(b.hospitalName, 'th'));
  }

  // Offline detection: check if recorded_at is older than threshold
  const OFFLINE_THRESHOLD_MS = 30 * 1000; // 30 seconds - detect offline quickly

  const isProcessOffline = (recordedAt: string | null): boolean => {
    if (!recordedAt) return true;
    return (Date.now() - new Date(recordedAt).getTime()) > OFFLINE_THRESHOLD_MS;
  };

  const getOfflineDuration = (recordedAt: string | null): string => {
    if (!recordedAt) return 'ไม่ทราบ';
    const diffMs = Date.now() - new Date(recordedAt).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec} วินาที`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} นาที`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour} ชม. ${diffMin % 60} นาที`;
  };

  // Check if entire hospital group is offline (all processes stale)
  const isHospitalOffline = (procs: ProcessHistory[]): boolean => {
    return procs.every(p => isProcessOffline(p.recorded_at));
  };

  // Count stats (offline = stopped)
  const totalHospitals = new Set(filteredProcesses.map(p => p.hospital_code).filter(Boolean)).size;
  const totalProcesses = filteredProcesses.length;
  const runningProcesses = filteredProcesses.filter(p => p.status === 'running' && !isProcessOffline(p.recorded_at)).length;

  // Count offline hospitals
  const offlineHospitals = useMemo(() => {
    const hospitalMap = new Map<string, ProcessHistory[]>();
    filteredProcesses.forEach(p => {
      const code = p.hospital_code || 'unknown';
      if (!hospitalMap.has(code)) hospitalMap.set(code, []);
      hospitalMap.get(code)!.push(p);
    });
    let count = 0;
    hospitalMap.forEach((procs) => {
      if (isHospitalOffline(procs)) count++;
    });
    return count;
  }, [filteredProcesses]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  };

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${mins}m`;
  };

  const getDbStatusIcon = (status: string | null) => {
    if (status === 'connected') return <Database className="w-3 h-3 text-green-400" />;
    if (status === 'disconnected') return <Database className="w-3 h-3 text-red-400" />;
    return <Database className="w-3 h-3 text-gray-500" />;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold">MonitorApp</h1>
              <p className="text-xs text-gray-400">Read-Only Mode (GitHub Pages)</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">Admin</span>
                ) : (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{user.hospitalCode}</span>
                )}
                <span className="text-sm text-gray-300">
                  {user.displayName || user.username}
                </span>
              </div>
            )}
            {lastUpdate && (
              <span className="text-xs text-gray-400">
                อัพเดท: {lastUpdate.toLocaleTimeString('th-TH')}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              title="รีเฟรช"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <PushNotificationToggle />
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 bg-red-600 hover:bg-red-700 rounded-lg"
                title="ออกจากระบบ"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold">{totalHospitals}</p>
                <p className="text-sm text-gray-400">สถานพยาบาล</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold">{runningProcesses}<span className="text-lg text-gray-400">/{totalProcesses}</span></p>
                <p className="text-sm text-gray-400">Running</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-3">
              <Wifi className="w-8 h-8 text-cyan-400" />
              <div>
                <p className="text-2xl font-bold">{new Set(processes.filter(p => p.bms_gateway_status === 'running').map(p => p.hospital_code)).size}</p>
                <p className="text-sm text-gray-400">Gateway Online</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-3">
              <WifiOff className={`w-8 h-8 ${offlineHospitals > 0 ? 'text-red-400' : 'text-gray-600'}`} />
              <div>
                <p className={`text-2xl font-bold ${offlineHospitals > 0 ? 'text-red-400' : ''}`}>{offlineHospitals}</p>
                <p className="text-sm text-gray-400">Offline</p>
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Read-Only Notice */}
        <div className={`${isAdmin ? 'bg-blue-900/30 border-blue-500/50' : 'bg-yellow-900/30 border-yellow-500/50'} border rounded-lg p-3 mb-4`}>
          <p className={`${isAdmin ? 'text-blue-200' : 'text-yellow-200'} text-sm`}>
            {isAdmin ? (
              <>
                <span className="font-semibold flex items-center gap-1 inline-flex">
                  <Shield className="w-4 h-4" /> Admin Mode:
                </span> ดูข้อมูลทุกสถานพยาบาล (Read-Only)
              </>
            ) : (
              <>
                <span className="font-semibold flex items-center gap-1 inline-flex">
                  <Building2 className="w-4 h-4" /> {user?.hospitalName || user?.hospitalCode}:
                </span> ดูข้อมูลเฉพาะสถานพยาบาลของท่าน (Read-Only)
              </>
            )}
          </p>
        </div>

        {/* Tabs and Sort */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('processes')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'processes'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Processes ({totalProcesses})
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'alerts'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            >
              Alerts ({filteredAlerts.length})
            </button>
          </div>

          {/* Sort Dropdown - only show for processes tab */}
          {activeTab === 'processes' && (
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hospital">โรงพยาบาล</option>
                <option value="status">สถานะ (Stopped ก่อน)</option>
                <option value="cpu">CPU สูงสุด</option>
                <option value="memory">Memory สูงสุด</option>
                <option value="update">อัพเดทล่าสุด</option>
              </select>
            </div>
          )}
        </div>

        {/* Content */}
        {activeTab === 'processes' && (
          <div className="space-y-4">
            {loading && processes.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p>กำลังโหลดข้อมูล...</p>
              </div>
            ) : processes.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Monitor className="w-8 h-8 mx-auto mb-2" />
                <p>ไม่พบข้อมูล process</p>
                <p className="text-xs mt-2">อาจต้องรัน SQL เพื่อเปิด RLS policy</p>
              </div>
            ) : (
              groupedProcesses.map((group) => (
                <div key={group.hospitalCode} className={`bg-gray-800 rounded-lg border overflow-hidden ${isHospitalOffline(group.processes) ? 'border-red-500/50' : 'border-gray-700'}`}>
                  <div className={`px-4 py-3 border-b flex items-center justify-between ${isHospitalOffline(group.processes) ? 'bg-red-900/20 border-red-500/30' : 'bg-gray-750 border-gray-700'}`}>
                    <div className="flex items-center gap-2">
                      <Building2 className={`w-5 h-5 ${isHospitalOffline(group.processes) ? 'text-red-400' : 'text-blue-400'}`} />
                      <span className="font-semibold">{group.hospitalName}</span>
                      <span className="text-xs text-gray-400">({group.hospitalCode})</span>
                      {isHospitalOffline(group.processes) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded-full animate-pulse">
                          <WifiOff className="w-3 h-3" />
                          ออฟไลน์ {getOfflineDuration(group.processes[0]?.recorded_at)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-400">{group.processes.length} processes</span>
                  </div>
                  <div className="divide-y divide-gray-700">
                    {group.processes.map((proc) => (
                      <div key={proc.id} className={`px-4 py-3 hover:bg-gray-750 ${isProcessOffline(proc.recorded_at) ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {isProcessOffline(proc.recorded_at) ? (
                              <WifiOff className="w-5 h-5 text-gray-500 mt-0.5" />
                            ) : proc.status === 'running' ? (
                              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
                            )}
                            <div>
                              <p className={`font-medium ${isProcessOffline(proc.recorded_at) ? 'text-gray-500' : ''}`}>{proc.process_name}</p>
                              <p className="text-xs text-gray-400">{proc.hostname}</p>
                              {proc.window_info?.version && (
                                <p className="text-xs text-gray-500">v{proc.window_info.version}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            {isProcessOffline(proc.recorded_at) ? (
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                                offline ({getOfflineDuration(proc.recorded_at)})
                              </span>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                proc.status === 'running' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                              }`}>
                                {proc.status}
                              </span>
                            )}
                            {proc.uptime_seconds && proc.status === 'running' && (
                              <p className="text-xs text-gray-400">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {formatUptime(proc.uptime_seconds)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Resource Usage */}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs">
                          <span className={`flex items-center gap-1 ${proc.cpu_percent > 80 ? 'text-yellow-400' : 'text-gray-400'}`}>
                            <Cpu className="w-3 h-3" />
                            CPU: {proc.cpu_percent?.toFixed(1)}%
                          </span>
                          <span className="flex items-center gap-1 text-gray-400">
                            <HardDrive className="w-3 h-3" />
                            RAM: {proc.memory_mb?.toFixed(0)} MB
                          </span>
                          {proc.bms_hosxp_db_status && (
                            <span className="flex items-center gap-1">
                              {getDbStatusIcon(proc.bms_hosxp_db_status)}
                              <span className={proc.bms_hosxp_db_status === 'connected' ? 'text-green-400' : 'text-red-400'}>
                                HOSxP
                              </span>
                            </span>
                          )}
                          {proc.bms_gateway_db_status && (
                            <span className="flex items-center gap-1">
                              {getDbStatusIcon(proc.bms_gateway_db_status)}
                              <span className={proc.bms_gateway_db_status === 'connected' ? 'text-green-400' : 'text-red-400'}>
                                Gateway
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Last Update */}
                        <div className="mt-1 text-xs text-gray-500">
                          อัพเดท: {formatTime(proc.recorded_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="divide-y divide-gray-700">
              {filteredAlerts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p>ไม่มี alerts</p>
                </div>
              ) : (
                filteredAlerts.map((alert) => (
                  <div key={alert.id} className="px-4 py-3 hover:bg-gray-750">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {alert.alert_type === 'PROCESS_STARTED' ? (
                          <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium">{alert.process_name}</p>
                          <p className="text-sm text-gray-400">{alert.message}</p>
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2">
                            {alert.hospital_name && (
                              <span className="text-blue-400">{alert.hospital_name}</span>
                            )}
                            {alert.hostname && (
                              <span>{alert.hostname}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded ${
                          alert.alert_type === 'PROCESS_STARTED'
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-red-900/50 text-red-300'
                        }`}>
                          {alert.alert_type === 'PROCESS_STARTED' ? 'Started' : 'Stopped'}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">{formatTime(alert.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GitHubPagesDashboard;
