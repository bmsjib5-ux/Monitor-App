import { useState, useEffect, useMemo } from 'react';
import { X, Search, Filter, RefreshCw, Building2, Activity, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { ProcessInfo } from '../types';
import { api } from '../api';
import BMSStatusIndicator from './BMSStatusIndicator';

interface AdminDashboardProps {
  onClose: () => void;
}

interface HospitalGroup {
  hospitalCode: string;
  hospitalName: string;
  processes: ProcessInfo[];
  totalCpu: number;
  totalMemory: number;
  runningCount: number;
  stoppedCount: number;
}

const AdminDashboard = ({ onClose }: AdminDashboardProps) => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterHospital, setFilterHospital] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProgram, setFilterProgram] = useState<string>('all');

  // View mode
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [expandedHospitals, setExpandedHospitals] = useState<Set<string>>(new Set());

  // Load data
  const loadData = async () => {
    try {
      const data = await api.getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('Error loading processes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto refresh every 10 seconds
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
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
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchName = p.name.toLowerCase().includes(search);
        const matchHospital = p.hospital_name?.toLowerCase().includes(search) || false;
        const matchCode = p.hospital_code?.toLowerCase().includes(search) || false;
        if (!matchName && !matchHospital && !matchCode) return false;
      }

      // Hospital filter
      if (filterHospital !== 'all' && p.hospital_code !== filterHospital) {
        return false;
      }

      // Status filter
      if (filterStatus !== 'all') {
        const isRunning = p.status === 'running';
        if (filterStatus === 'running' && !isRunning) return false;
        if (filterStatus === 'stopped' && isRunning) return false;
      }

      // Program filter
      if (filterProgram !== 'all' && p.name !== filterProgram) {
        return false;
      }

      return true;
    });
  }, [processes, searchTerm, filterHospital, filterStatus, filterProgram]);

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
          stoppedCount: 0
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full h-full max-w-[95vw] max-h-[95vh] mx-4 my-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-600 to-purple-600">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">Admin Monitor Dashboard</h2>
              <p className="text-sm text-indigo-100">ภาพรวมการทำงานของทุกสถานพยาบาล</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-white ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Statistics Bar */}
        <div className="grid grid-cols-5 gap-4 p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">สถานพยาบาล</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.hospitalCount}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">โปรแกรมทั้งหมด</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{filteredProcesses.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">กำลังทำงาน</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{stats.running}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">หยุดทำงาน</span>
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{stats.stopped}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">CPU รวม</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalCpu.toFixed(1)}%</p>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหา ชื่อโปรแกรม, สถานพยาบาล, รหัส..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Hospital Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filterHospital}
                onChange={(e) => setFilterHospital(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="running">กำลังทำงาน</option>
              <option value="stopped">หยุดทำงาน</option>
            </select>

            {/* Program Filter */}
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                ตาราง
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 text-sm ${viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                การ์ด
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</p>
              </div>
            </div>
          ) : viewMode === 'table' ? (
            /* Table View */
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานพยาบาล</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">โปรแกรม</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">VERSION</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">GW</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">DB HOSxP</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">DB Gateway</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CPU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Memory</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uptime</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredProcesses.map((process, idx) => (
                    <tr key={`${process.name}-${process.pid}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-indigo-600 dark:text-indigo-400">
                        {process.hospital_code || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white max-w-[200px]">
                        <div className="break-words">
                          {process.hospital_name || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium max-w-xs">
                        <div className="break-words" title={process.window_title || process.name}>
                          {process.window_title || process.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 font-mono">
                        {process.window_info?.version || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {process.pid}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(process.status)}`}>
                          {getStatusIcon(process.status)}
                          {process.status === 'running' ? 'ทำงาน' : 'หยุด'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
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
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {process.bms_status ? (
                          <BMSStatusIndicator
                            status={process.bms_status.hosxp_db_status}
                            tooltip={process.bms_status.hosxp_db_last_error || `HOSxP DB: ${process.bms_status.hosxp_db_status}`}
                            size="md"
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {process.bms_status ? (
                          <BMSStatusIndicator
                            status={process.bms_status.gateway_db_status}
                            tooltip={process.bms_status.gateway_db_last_error || `Gateway DB: ${process.bms_status.gateway_db_status}`}
                            size="md"
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${process.cpu_percent > 80 ? 'bg-red-500' : process.cpu_percent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(process.cpu_percent, 100)}%` }}
                            />
                          </div>
                          <span>{process.cpu_percent.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {process.memory_mb.toFixed(1)} MB
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {process.uptime}
                      </td>
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
                    className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 hover:from-indigo-100 hover:to-purple-100 dark:hover:from-indigo-900/50 dark:hover:to-purple-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {group.hospitalCode !== 'unknown' ? `[${group.hospitalCode}] ` : ''}{group.hospitalName}
                        </p>
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
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.processes.map((process, idx) => (
                        <div
                          key={`${process.name}-${process.pid}-${idx}`}
                          className={`p-3 rounded-lg border ${
                            process.status === 'running'
                              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                              : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="font-medium text-gray-900 dark:text-white truncate"
                              title={process.window_info?.window_title || process.name}
                            >
                              {process.window_info?.window_title || process.name}
                            </span>
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
                            {process.window_info?.version && (
                              <div className="flex justify-between">
                                <span>Version:</span>
                                <span className="font-medium text-blue-600 dark:text-blue-400">v{process.window_info.version}</span>
                              </div>
                            )}
                            {/* BMS Status */}
                            {process.bms_status && (
                              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
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
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {hospitalGroups.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  ไม่พบข้อมูลที่ตรงกับเงื่อนไข
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-center text-sm text-gray-500 dark:text-gray-400">
          อัพเดทอัตโนมัติทุก 10 วินาที | แสดงผล {filteredProcesses.length} จาก {processes.length} รายการ
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
