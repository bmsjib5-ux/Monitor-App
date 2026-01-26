import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
  createColumnHelper,
} from '@tanstack/react-table';
import { Trash2, ArrowUp, ArrowDown, StopCircle, PlayCircle, RotateCw, Edit } from 'lucide-react';
import { ProcessInfo } from '../types';
import BMSStatusIndicator from './BMSStatusIndicator';
import { useState } from 'react';

interface ProcessTableProps {
  processes: ProcessInfo[];
  onSelectProcess: (name: string) => void;
  onRemoveProcess: (process: ProcessInfo) => void;
  onStopProcess: (process: ProcessInfo) => void;
  onStartProcess: (process: ProcessInfo) => void;
  onRestartProcess: (process: ProcessInfo) => void;
  onEditProcess: (name: string) => void;
  selectedProcess: string | null;
}

const columnHelper = createColumnHelper<ProcessInfo>();

const ProcessTable = ({
  processes,
  onSelectProcess,
  onRemoveProcess,
  onStopProcess,
  onStartProcess,
  onRestartProcess,
  onEditProcess,
  selectedProcess,
}: ProcessTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([]);

  const getRowClassName = (process: ProcessInfo) => {
    const isWarning =
      process.cpu_percent > 80 ||
      process.memory_percent > 80 ||
      process.disk_read_mb + process.disk_write_mb > 100;

    const isSelected = process.name === selectedProcess;

    let className = 'transition-colors cursor-pointer ';

    if (isSelected) {
      className += 'bg-primary-100 dark:bg-primary-900/30 ';
    } else if (isWarning) {
      className += 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 ';
    } else {
      className += 'hover:bg-gray-50 dark:hover:bg-gray-800 ';
    }

    return className;
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Process Name',
        cell: (info) => (
          <div className="font-medium text-gray-900 dark:text-white">
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.accessor('window_info', {
        header: 'Version',
        cell: (info) => {
          const windowInfo = info.getValue();
          if (!windowInfo?.version) {
            return <span className="text-gray-400">-</span>;
          }
          return (
            <div className="text-xs text-blue-600 dark:text-blue-400 font-mono" title={windowInfo.window_title || ''}>
              {windowInfo.version}
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const status = info.getValue();
          const isRunning = status === 'running';
          return (
            <span
              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                isRunning
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {status}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'gateway_status',
        header: 'GW',
        cell: (props) => {
          const bmsStatus = props.row.original.bms_status;
          if (!bmsStatus) {
            return <span className="text-gray-400">-</span>;
          }
          return (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
              bmsStatus.gateway_status === 'running'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                : bmsStatus.gateway_status === 'stopped'
                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`} title={`Gateway: ${bmsStatus.gateway_status}`}>
              {bmsStatus.gateway_status === 'running' ? 'Start' : bmsStatus.gateway_status === 'stopped' ? 'Stop' : '?'}
            </span>
          );
        },
      }),
      columnHelper.accessor('bms_status', {
        header: 'DB HOSxP',
        cell: (info) => {
          const bmsStatus = info.getValue();
          if (!bmsStatus) {
            return <span className="text-gray-400">-</span>;
          }
          return (
            <BMSStatusIndicator
              status={bmsStatus.hosxp_db_status}
              tooltip={bmsStatus.hosxp_db_last_error || `HOSxP DB: ${bmsStatus.hosxp_db_status}`}
              size="md"
            />
          );
        },
      }),
      columnHelper.display({
        id: 'gateway_db_status',
        header: 'DB Gateway',
        cell: (props) => {
          const bmsStatus = props.row.original.bms_status;
          if (!bmsStatus) {
            return <span className="text-gray-400">-</span>;
          }
          return (
            <BMSStatusIndicator
              status={bmsStatus.gateway_db_status}
              tooltip={bmsStatus.gateway_db_last_error || `Gateway DB: ${bmsStatus.gateway_db_status}`}
              size="md"
            />
          );
        },
      }),
      columnHelper.accessor('pid', {
        header: 'PID',
        cell: (info) => (
          <div className="text-gray-700 dark:text-gray-300">
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.accessor('cpu_percent', {
        header: 'CPU %',
        cell: (info) => {
          const value = info.getValue();
          const isHigh = value > 80;
          return (
            <div
              className={`font-mono ${
                isHigh
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {value.toFixed(1)}%
            </div>
          );
        },
      }),
      columnHelper.accessor('memory_mb', {
        header: 'RAM (MB)',
        cell: (info) => (
          <div className="font-mono text-gray-700 dark:text-gray-300">
            {info.getValue().toFixed(1)}
          </div>
        ),
      }),
      columnHelper.accessor('memory_percent', {
        header: 'RAM %',
        cell: (info) => {
          const value = info.getValue();
          const isHigh = value > 80;
          return (
            <div
              className={`font-mono ${
                isHigh
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {value.toFixed(1)}%
            </div>
          );
        },
      }),
      columnHelper.accessor('disk_read_mb', {
        header: 'Disk Read (MB/s)',
        cell: (info) => (
          <div className="font-mono text-gray-700 dark:text-gray-300">
            {info.getValue().toFixed(2)}
          </div>
        ),
      }),
      columnHelper.accessor('disk_write_mb', {
        header: 'Disk Write (MB/s)',
        cell: (info) => (
          <div className="font-mono text-gray-700 dark:text-gray-300">
            {info.getValue().toFixed(2)}
          </div>
        ),
      }),
      columnHelper.accessor('net_sent_mb', {
        header: 'Net Sent (MB/s)',
        cell: (info) => (
          <div className="font-mono text-gray-700 dark:text-gray-300">
            {info.getValue().toFixed(2)}
          </div>
        ),
      }),
      columnHelper.accessor('net_recv_mb', {
        header: 'Net Recv (MB/s)',
        cell: (info) => (
          <div className="font-mono text-gray-700 dark:text-gray-300">
            {info.getValue().toFixed(2)}
          </div>
        ),
      }),
      columnHelper.accessor('uptime', {
        header: 'Uptime',
        cell: (info) => (
          <div className="text-gray-700 dark:text-gray-300">
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (props) => {
          const isRunning = props.row.original.status === 'running';
          return (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditProcess(props.row.original.name);
                }}
                className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors"
                title="Edit process details"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStopProcess(props.row.original);
                }}
                className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Stop process"
                disabled={!isRunning}
              >
                <StopCircle className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartProcess(props.row.original);
                }}
                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Start process"
                disabled={isRunning}
              >
                <PlayCircle className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestartProcess(props.row.original);
                }}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Restart process"
                disabled={!isRunning}
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveProcess(props.row.original);
                }}
                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                title="Remove from monitoring"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        },
      }),
    ],
    [selectedProcess, onEditProcess, onStopProcess, onStartProcess, onRestartProcess, onRemoveProcess]
  );

  const table = useReactTable({
    data: processes,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getIsSorted() && (
                        <span>
                          {header.column.getIsSorted() === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelectProcess(row.original.name)}
                className={getRowClassName(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProcessTable;
