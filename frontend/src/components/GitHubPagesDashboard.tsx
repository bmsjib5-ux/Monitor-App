import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Activity, CheckCircle, XCircle, Clock, Building2, Monitor, LogOut, Cpu, HardDrive, Database, Wifi, ArrowUpDown, Shield, WifiOff, Filter, Briefcase, ChevronDown, ChevronUp, AlertTriangle, Calendar } from 'lucide-react';
import { supabaseApi, ProcessHistory, AlertRecord, getGitHubPagesUser, UserInfo } from '../supabaseClient';
import PushNotificationToggle from './PushNotificationToggle';

// App version
const APP_VERSION = '4.3.0';

type SortOption = 'hospital' | 'status' | 'cpu' | 'memory' | 'update';
type ViewMode = 'list' | 'company';

interface ProcessGroup {
  hospitalCode: string;
  hospitalName: string;
  processes: ProcessHistory[];
}

interface CompanyGroup {
  companyName: string;
  hospitals: ProcessGroup[];
  totalProcesses: number;
  runningCount: number;
  stoppedCount: number;
  offlineCount: number;
  warrantyExpiredCount: number;
  warrantyWarningCount: number;
}

interface GitHubPagesDashboardProps {
  onLogout?: () => void;
}

// Offline detection threshold - same as MasterDashboard
const OFFLINE_THRESHOLD_MS = 60 * 1000; // 60 seconds

// Warranty warning threshold
const WARRANTY_WARNING_DAYS = 90;

function GitHubPagesDashboard({ onLogout }: GitHubPagesDashboardProps) {
  const user = getGitHubPagesUser() as UserInfo | null;
  const isAdmin = user?.isAdmin ?? false;
  const isCompany = user?.role === 'company';
  const userHospitalCode = user?.hospitalCode;
  const userCompanyName = user?.companyName;

  const [processes, setProcesses] = useState<ProcessHistory[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'processes' | 'alerts'>('processes');
  const [sortBy, setSortBy] = useState<SortOption>('hospital');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [expandedHospitals, setExpandedHospitals] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rawProcs, alts] = await Promise.all([
        supabaseApi.getMonitoredProcesses(),
        supabaseApi.getProcessAlerts(100),
      ]);

      // Dedup by (process_name + hospital_code) keeping latest recorded_at
      const deduped = new Map<string, ProcessHistory>();
      for (const item of rawProcs) {
        const key = `${(item.process_name || '').toLowerCase()}__${item.hospital_code || ''}`;
        const existing = deduped.get(key);
        if (!existing || new Date(item.recorded_at) > new Date(existing.recorded_at)) {
          deduped.set(key, item);
        }
      }

      setProcesses(Array.from(deduped.values()));
      setAlerts(alts);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const isProcessOffline = (recordedAt: string | null): boolean => {
    if (!recordedAt) return true;
    return (Date.now() - new Date(recordedAt).getTime()) > OFFLINE_THRESHOLD_MS;
  };

  // Warranty helpers
  const getWarrantyStatus = (warrantyExpiry: string | null): 'expired' | 'warning' | 'ok' | null => {
    if (!warrantyExpiry) return null;
    const expiry = new Date(warrantyExpiry);
    const now = new Date();
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'expired';
    if (daysLeft < WARRANTY_WARNING_DAYS) return 'warning';
    return 'ok';
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  // Filter processes based on role + status + company filters
  const filteredProcesses = useMemo(() => {
    return processes.filter(p => {
      // Role-based filtering
      if (!isAdmin) {
        if (isCompany && userCompanyName) {
          if (p.company_name !== userCompanyName) return false;
        } else if (userHospitalCode) {
          if (p.hospital_code !== userHospitalCode) return false;
        }
      }

      // Company filter (admin only)
      if (isAdmin && filterCompany !== 'all' && p.company_name !== filterCompany) return false;

      // Status filter
      if (filterStatus !== 'all') {
        const offline = isProcessOffline(p.recorded_at);
        if (filterStatus === 'offline') {
          if (!offline) return false;
        } else if (filterStatus === 'running') {
          if (p.status !== 'running' || offline) return false;
        } else if (filterStatus === 'stopped') {
          if (p.status === 'running' && !offline) return false;
        }
      }

      return true;
    });
  }, [processes, isAdmin, isCompany, userHospitalCode, userCompanyName, filterStatus, filterCompany]);

  // Filter alerts based on role
  const filteredAlerts = useMemo(() => {
    if (isAdmin) return alerts;
    if (isCompany && userCompanyName) {
      // company role: filter by hospital codes within company
      const companyCodes = new Set(
        processes.filter(p => p.company_name === userCompanyName).map(p => p.hospital_code)
      );
      return alerts.filter(a => companyCodes.has(a.hospital_code));
    }
    if (userHospitalCode) return alerts.filter(a => a.hospital_code === userHospitalCode);
    return alerts;
  }, [alerts, isAdmin, isCompany, userHospitalCode, userCompanyName, processes]);

  // Unique companies (admin)
  const uniqueCompanies = useMemo(() => {
    return [...new Set(processes.map(p => p.company_name).filter(Boolean) as string[])].sort();
  }, [processes]);

  // Company groups (for company view)
  const companyGroups = useMemo((): CompanyGroup[] => {
    const map = new Map<string, CompanyGroup>();
    const noCompanyKey = '(ไม่ระบุ Company)';

    for (const p of filteredProcesses) {
      const cName = p.company_name || noCompanyKey;
      if (!map.has(cName)) {
        map.set(cName, {
          companyName: cName,
          hospitals: [],
          totalProcesses: 0,
          runningCount: 0,
          stoppedCount: 0,
          offlineCount: 0,
          warrantyExpiredCount: 0,
          warrantyWarningCount: 0,
        });
      }
      const cg = map.get(cName)!;

      // Hospital sub-group
      const hCode = p.hospital_code || 'unknown';
      let hGroup = cg.hospitals.find(h => h.hospitalCode === hCode);
      if (!hGroup) {
        hGroup = { hospitalCode: hCode, hospitalName: p.hospital_name || hCode, processes: [] };
        cg.hospitals.push(hGroup);
      }
      hGroup.processes.push(p);

      cg.totalProcesses++;
      const offline = isProcessOffline(p.recorded_at);
      if (offline) {
        cg.offlineCount++;
      } else if (p.status === 'running') {
        cg.runningCount++;
      } else {
        cg.stoppedCount++;
      }
      const ws = getWarrantyStatus(p.warranty_expiry_date);
      if (ws === 'expired') cg.warrantyExpiredCount++;
      else if (ws === 'warning') cg.warrantyWarningCount++;
    }

    return Array.from(map.values()).sort((a, b) => a.companyName.localeCompare(b.companyName, 'th'));
  }, [filteredProcesses]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sort processes (for list view)
  const sortedProcesses = [...filteredProcesses].sort((a, b) => {
    switch (sortBy) {
      case 'status':
        if (a.status !== b.status) return a.status === 'stopped' ? -1 : 1;
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

  // Group processes by hospital (list view)
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

  if (sortBy === 'hospital') {
    groupedProcesses.sort((a, b) => a.hospitalName.localeCompare(b.hospitalName, 'th'));
  }

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

  const isHospitalOffline = (procs: ProcessHistory[]): boolean => {
    return procs.every(p => isProcessOffline(p.recorded_at));
  };

  // Stats
  const totalHospitals = new Set(filteredProcesses.map(p => p.hospital_code).filter(Boolean)).size;
  const totalProcesses = filteredProcesses.length;
  const runningProcesses = filteredProcesses.filter(p => p.status === 'running' && !isProcessOffline(p.recorded_at)).length;
  const offlineHospitals = useMemo(() => {
    const hospitalMap = new Map<string, ProcessHistory[]>();
    filteredProcesses.forEach(p => {
      const code = p.hospital_code || 'unknown';
      if (!hospitalMap.has(code)) hospitalMap.set(code, []);
      hospitalMap.get(code)!.push(p);
    });
    let count = 0;
    hospitalMap.forEach((procs) => { if (isHospitalOffline(procs)) count++; });
    return count;
  }, [filteredProcesses]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('th-TH', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
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

  // Render a single process row (shared between list and company view)
  const renderProcessCard = (proc: ProcessHistory) => {
    const offline = isProcessOffline(proc.recorded_at);
    const ws = getWarrantyStatus(proc.warranty_expiry_date);
    return (
      <div key={proc.id} className={`px-4 py-3 hover:bg-gray-750 ${offline ? 'bg-red-900/10' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {offline ? (
              <WifiOff className="w-5 h-5 text-red-400 mt-0.5" />
            ) : proc.status === 'running' ? (
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${offline ? 'text-red-400' : ''}`}>{proc.process_name}</p>
              <p className="text-xs text-gray-400">{proc.hostname}</p>
              {proc.window_info?.version && (
                <p className="text-xs text-gray-500">v{proc.window_info.version}</p>
              )}
              {/* Company / Install / Warranty */}
              <div className="flex flex-wrap gap-2 mt-1">
                {proc.company_name && (
                  <span className="text-xs px-1.5 py-0.5 bg-orange-900/40 text-orange-300 rounded">
                    {proc.company_name}
                  </span>
                )}
                {proc.install_date && (
                  <span className="text-xs text-gray-500 flex items-center gap-0.5">
                    <Calendar className="w-3 h-3" />
                    ติดตั้ง: {formatDate(proc.install_date)}
                  </span>
                )}
                {proc.warranty_expiry_date && (
                  <span className={`text-xs flex items-center gap-0.5 ${
                    ws === 'expired' ? 'text-red-400' : ws === 'warning' ? 'text-yellow-400' : 'text-gray-500'
                  }`}>
                    <Shield className="w-3 h-3" />
                    ประกัน: {formatDate(proc.warranty_expiry_date)}
                    {ws === 'expired' && ' (หมด)'}
                    {ws === 'warning' && ' (ใกล้หมด)'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right space-y-1">
            {offline ? (
              <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400 animate-pulse">
                ออฟไลน์ ({getOfflineDuration(proc.recorded_at)})
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
    );
  };

  // Render hospital group header
  const renderHospitalGroup = (group: ProcessGroup, keyPrefix: string = '') => {
    const offline = isHospitalOffline(group.processes);
    return (
      <div key={`${keyPrefix}${group.hospitalCode}`} className={`bg-gray-800 rounded-lg border overflow-hidden ${offline ? 'border-red-500/50' : 'border-gray-700'}`}>
        <div className={`px-4 py-3 border-b flex items-center justify-between ${offline ? 'bg-red-900/20 border-red-500/30' : 'bg-gray-750 border-gray-700'}`}>
          <div className="flex items-center gap-2">
            <Building2 className={`w-5 h-5 ${offline ? 'text-red-400' : 'text-blue-400'}`} />
            <span className="font-semibold">{group.hospitalName}</span>
            <span className="text-xs text-gray-400">({group.hospitalCode})</span>
            {offline && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded-full animate-pulse">
                <WifiOff className="w-3 h-3" />
                ออฟไลน์ {getOfflineDuration(group.processes[0]?.recorded_at)}
              </span>
            )}
          </div>
          <span className="text-sm text-gray-400">{group.processes.length} processes</span>
        </div>
        <div className="divide-y divide-gray-700">
          {group.processes.map(proc => renderProcessCard(proc))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-400" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">MonitorApp</h1>
                <span className="px-1.5 py-0.5 bg-gray-700 text-gray-300 text-xs font-mono rounded">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {isAdmin ? 'Admin Mode' : isCompany ? `Company: ${userCompanyName}` : 'Read-Only Mode'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {user && (
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">Admin</span>
                ) : isCompany ? (
                  <span className="px-2 py-0.5 bg-orange-600 text-white text-xs rounded-full flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    Company
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{user.hospitalCode}</span>
                )}
                <span className="text-sm text-gray-300">{user.displayName || user.username}</span>
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
                <p className="text-2xl font-bold">
                  {new Set(filteredProcesses.filter(p => p.bms_gateway_status === 'running').map(p => p.hospital_code)).size}
                </p>
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

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Role notice */}
        <div className={`border rounded-lg p-3 mb-4 ${
          isAdmin ? 'bg-blue-900/30 border-blue-500/50' :
          isCompany ? 'bg-orange-900/30 border-orange-500/50' :
          'bg-yellow-900/30 border-yellow-500/50'
        }`}>
          <p className={`text-sm ${isAdmin ? 'text-blue-200' : isCompany ? 'text-orange-200' : 'text-yellow-200'}`}>
            {isAdmin ? (
              <span className="font-semibold flex items-center gap-1">
                <Shield className="w-4 h-4" /> Admin Mode: ดูข้อมูลทุกสถานพยาบาล (Read-Only)
              </span>
            ) : isCompany ? (
              <span className="font-semibold flex items-center gap-1">
                <Briefcase className="w-4 h-4" /> Company Mode: {userCompanyName} — เห็นเฉพาะข้อมูลของ Company ตนเอง
              </span>
            ) : (
              <span className="font-semibold flex items-center gap-1">
                <Building2 className="w-4 h-4" /> {user?.hospitalName || user?.hospitalCode}: ดูข้อมูลเฉพาะสถานพยาบาลของท่าน
              </span>
            )}
          </p>
        </div>

        {/* Tabs + View + Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('processes')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'processes' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Processes ({totalProcesses})
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'alerts' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Alerts ({filteredAlerts.length})
            </button>
            {/* Company view button - admin only */}
            {isAdmin && activeTab === 'processes' && (
              <button
                onClick={() => setViewMode(viewMode === 'company' ? 'list' : 'company')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                  viewMode === 'company' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Company View
              </button>
            )}
          </div>

          {activeTab === 'processes' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              {/* Company filter (admin only) */}
              {isAdmin && uniqueCompanies.length > 0 && (
                <select
                  value={filterCompany}
                  onChange={(e) => setFilterCompany(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">ทุก Company</option>
                  {uniqueCompanies.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="running">กำลังทำงาน</option>
                <option value="stopped">หยุดทำงาน</option>
                <option value="offline">ออฟไลน์</option>
              </select>
              {viewMode === 'list' && (
                <>
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
                </>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {activeTab === 'processes' && (
          <>
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
            ) : viewMode === 'company' ? (
              /* ===== Company View ===== */
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-orange-400">{companyGroups.length}</p>
                    <p className="text-xs text-gray-400">Companies</p>
                  </div>
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{totalProcesses}</p>
                    <p className="text-xs text-gray-400">Programs</p>
                  </div>
                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">
                      {companyGroups.reduce((s, cg) => s + cg.warrantyExpiredCount, 0)}
                    </p>
                    <p className="text-xs text-gray-400">ประกันหมด</p>
                  </div>
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-400">
                      {companyGroups.reduce((s, cg) => s + cg.warrantyWarningCount, 0)}
                    </p>
                    <p className="text-xs text-gray-400">ใกล้หมดประกัน</p>
                  </div>
                </div>

                {/* Company accordion cards */}
                {companyGroups.map(cg => {
                  const isExpanded = expandedCompanies.has(cg.companyName);
                  return (
                    <div key={cg.companyName} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                      {/* Company header */}
                      <button
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-750 transition-colors"
                        onClick={() => {
                          const next = new Set(expandedCompanies);
                          if (next.has(cg.companyName)) next.delete(cg.companyName);
                          else next.add(cg.companyName);
                          setExpandedCompanies(next);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Briefcase className="w-6 h-6 text-orange-400" />
                          <div className="text-left">
                            <p className="font-bold text-lg">{cg.companyName}</p>
                            <p className="text-xs text-gray-400">{cg.hospitals.length} สถานพยาบาล · {cg.totalProcesses} programs</p>
                          </div>
                          {/* Status badges */}
                          <div className="flex gap-1 ml-2 flex-wrap">
                            {cg.runningCount > 0 && (
                              <span className="px-2 py-0.5 bg-green-900/50 text-green-300 text-xs rounded-full">{cg.runningCount} running</span>
                            )}
                            {cg.stoppedCount > 0 && (
                              <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded-full">{cg.stoppedCount} stopped</span>
                            )}
                            {cg.offlineCount > 0 && (
                              <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full flex items-center gap-1">
                                <WifiOff className="w-3 h-3" />{cg.offlineCount} offline
                              </span>
                            )}
                            {cg.warrantyExpiredCount > 0 && (
                              <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded-full flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />{cg.warrantyExpiredCount} ประกันหมด
                              </span>
                            )}
                            {cg.warrantyWarningCount > 0 && (
                              <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 text-xs rounded-full flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />{cg.warrantyWarningCount} ใกล้หมด
                              </span>
                            )}
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </button>

                      {/* Hospital sub-groups */}
                      {isExpanded && (
                        <div className="border-t border-gray-700 divide-y divide-gray-700/50">
                          {cg.hospitals.map(hg => {
                            const hKey = `${cg.companyName}__${hg.hospitalCode}`;
                            const hExpanded = expandedHospitals.has(hKey);
                            const hOffline = isHospitalOffline(hg.processes);
                            return (
                              <div key={hKey} className="bg-gray-900/30">
                                <button
                                  className={`w-full px-5 py-2.5 flex items-center justify-between hover:bg-gray-700/30 transition-colors ${hOffline ? 'bg-red-900/10' : ''}`}
                                  onClick={() => {
                                    const next = new Set(expandedHospitals);
                                    if (next.has(hKey)) next.delete(hKey);
                                    else next.add(hKey);
                                    setExpandedHospitals(next);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <Building2 className={`w-4 h-4 ${hOffline ? 'text-red-400' : 'text-blue-400'}`} />
                                    <span className="text-sm font-medium">{hg.hospitalName}</span>
                                    <span className="text-xs text-gray-500">({hg.hospitalCode})</span>
                                    {hOffline && (
                                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-900/50 text-red-300 text-xs rounded-full animate-pulse">
                                        <WifiOff className="w-2.5 h-2.5" /> offline
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">{hg.processes.length} processes</span>
                                    {hExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                  </div>
                                </button>
                                {hExpanded && (
                                  <div className="border-t border-gray-700/50 divide-y divide-gray-700/30">
                                    {hg.processes.map(proc => renderProcessCard(proc))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ===== List View (grouped by hospital) ===== */
              <div className="space-y-4">
                {groupedProcesses.map(group => renderHospitalGroup(group))}
              </div>
            )}
          </>
        )}

        {/* Alerts tab */}
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
                            {alert.hostname && <span>{alert.hostname}</span>}
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
