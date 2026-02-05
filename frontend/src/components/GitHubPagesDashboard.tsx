import { useState, useEffect } from 'react';
import { RefreshCw, Activity, AlertTriangle, CheckCircle, XCircle, Clock, Building2, Monitor, LogOut, Cpu, HardDrive, Database, Wifi } from 'lucide-react';
import { supabaseApi, ProcessHistory, AlertRecord, getGitHubPagesUser } from '../supabaseClient';

interface ProcessGroup {
  hospitalCode: string;
  hospitalName: string;
  processes: ProcessHistory[];
}

interface GitHubPagesDashboardProps {
  onLogout?: () => void;
}

function GitHubPagesDashboard({ onLogout }: GitHubPagesDashboardProps) {
  const user = getGitHubPagesUser();
  const [processes, setProcesses] = useState<ProcessHistory[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'processes' | 'alerts'>('processes');

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

  useEffect(() => {
    fetchData();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Group processes by hospital
  const groupedProcesses = processes.reduce<ProcessGroup[]>((acc, proc) => {
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

  // Sort by hospital name
  groupedProcesses.sort((a, b) => a.hospitalName.localeCompare(b.hospitalName, 'th'));

  // Count stats
  const totalHospitals = new Set(processes.map(p => p.hospital_code).filter(Boolean)).size;
  const totalProcesses = processes.length;
  const runningProcesses = processes.filter(p => p.status === 'running').length;
  const recentAlerts = alerts.filter(a => {
    const alertTime = new Date(a.created_at);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return alertTime > oneHourAgo;
  }).length;

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
              <span className="text-sm text-gray-300">
                {user.displayName || user.username}
              </span>
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
                <p className="text-2xl font-bold">{processes.filter(p => p.bms_gateway_status === 'running').length}</p>
                <p className="text-sm text-gray-400">Gateway Online</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-2xl font-bold">{recentAlerts}</p>
                <p className="text-sm text-gray-400">Alerts (1 ชม.)</p>
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
        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 mb-4">
          <p className="text-blue-200 text-sm">
            <span className="font-semibold">Read-Only Mode:</span> กำลังดูข้อมูลจาก Supabase โดยตรง
            ไม่สามารถควบคุม process หรือแก้ไขข้อมูลได้
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
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
            Alerts ({alerts.length})
          </button>
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
                <div key={group.hospitalCode} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="bg-gray-750 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-400" />
                      <span className="font-semibold">{group.hospitalName}</span>
                      <span className="text-xs text-gray-400">({group.hospitalCode})</span>
                    </div>
                    <span className="text-sm text-gray-400">{group.processes.length} processes</span>
                  </div>
                  <div className="divide-y divide-gray-700">
                    {group.processes.map((proc) => (
                      <div key={proc.id} className="px-4 py-3 hover:bg-gray-750">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {proc.status === 'running' ? (
                              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
                            )}
                            <div>
                              <p className="font-medium">{proc.process_name}</p>
                              <p className="text-xs text-gray-400">{proc.hostname}</p>
                              {proc.window_info?.version && (
                                <p className="text-xs text-gray-500">v{proc.window_info.version}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              proc.status === 'running' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                            }`}>
                              {proc.status}
                            </span>
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
              {alerts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p>ไม่มี alerts</p>
                </div>
              ) : (
                alerts.map((alert) => (
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
