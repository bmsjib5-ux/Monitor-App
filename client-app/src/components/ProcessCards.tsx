import { Trash2, StopCircle, PlayCircle, RotateCw, Edit, CheckCircle, XCircle, Inbox, Cpu, Database, HardDrive, Activity } from 'lucide-react';
import { ProcessInfo } from '../types';
import BMSStatusIndicator from './BMSStatusIndicator';

interface ProcessCardsProps {
  processes: ProcessInfo[];
  onSelectProcess: (name: string) => void;
  onRemoveProcess: (process: ProcessInfo) => void;
  onStopProcess: (process: ProcessInfo) => void;
  onStartProcess: (process: ProcessInfo) => void;
  onRestartProcess: (process: ProcessInfo) => void;
  onEditProcess: (name: string) => void;
  selectedProcess: string | null;
}

const ProcessCards = ({
  processes,
  onSelectProcess,
  onRemoveProcess,
  onStopProcess,
  onStartProcess,
  onRestartProcess,
  onEditProcess,
  selectedProcess,
}: ProcessCardsProps) => {
  if (processes.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
        <Inbox className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">ยังไม่มี process ที่ติดตาม</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {processes.map((p) => {
        const isRunning = p.status === 'running';
        const isSelected = p.name === selectedProcess;
        const isCpuHigh = p.cpu_percent > 80;
        const isMemHigh = p.memory_percent > 80;
        const isWarning = isCpuHigh || isMemHigh || (p.disk_read_mb + p.disk_write_mb) > 100;

        let cardClass = 'bg-white dark:bg-gray-800 rounded-lg shadow border transition-all cursor-pointer ';
        if (isSelected) {
          cardClass += 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800 ';
        } else if (isWarning) {
          cardClass += 'border-red-300 dark:border-red-700 hover:shadow-lg ';
        } else {
          cardClass += 'border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 ';
        }

        return (
          <div
            key={`${p.name}-${p.pid}`}
            className={cardClass}
            onClick={() => onSelectProcess(p.name)}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight break-all">
                  {p.name}
                </h3>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                    isRunning
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  }`}
                >
                  {isRunning ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {p.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-mono">PID {p.pid}</span>
                {p.window_info?.version && (
                  <span className="text-blue-600 dark:text-blue-400 font-mono" title={p.window_info.window_title || ''}>
                    v{p.window_info.version}
                  </span>
                )}
                {p.uptime && p.uptime !== '-' && (
                  <span className="ml-auto">⏱ {p.uptime}</span>
                )}
              </div>
            </div>

            {/* Metrics grid */}
            <div className="p-4 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">CPU</div>
                  <div className={`font-mono font-semibold ${isCpuHigh ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>
                    {p.cpu_percent.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">RAM</div>
                  <div className={`font-mono font-semibold ${isMemHigh ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>
                    {p.memory_mb.toFixed(0)} MB · {p.memory_percent.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Disk R/W</div>
                  <div className="font-mono text-xs text-gray-700 dark:text-gray-200">
                    {p.disk_read_mb.toFixed(1)}/{p.disk_write_mb.toFixed(1)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Net ↑/↓</div>
                  <div className="font-mono text-xs text-gray-700 dark:text-gray-200">
                    {p.net_sent_mb.toFixed(1)}/{p.net_recv_mb.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>

            {/* BMS Status (if available) */}
            {p.bms_status && (
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                    p.bms_status.gateway_status === 'running'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                      : p.bms_status.gateway_status === 'stopped'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                  title={`Gateway: ${p.bms_status.gateway_status}`}
                >
                  GW: {p.bms_status.gateway_status === 'running' ? 'Start' : p.bms_status.gateway_status === 'stopped' ? 'Stop' : '?'}
                </span>
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  HOSxP <BMSStatusIndicator status={p.bms_status.hosxp_db_status} tooltip={p.bms_status.hosxp_db_last_error || ''} size="sm" />
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  GW DB <BMSStatusIndicator status={p.bms_status.gateway_db_status} tooltip={p.bms_status.gateway_db_last_error || ''} size="sm" />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-1 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onEditProcess(p.name); }}
                className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors"
                title="Edit process details"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStopProcess(p); }}
                className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Stop process"
                disabled={!isRunning}
              >
                <StopCircle className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStartProcess(p); }}
                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Start process"
                disabled={isRunning}
              >
                <PlayCircle className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRestartProcess(p); }}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                title="Restart process"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveProcess(p); }}
                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                title="Remove from monitoring"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProcessCards;
