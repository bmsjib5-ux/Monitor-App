import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ProcessMetrics } from '../types';
import { api } from '../api';

interface ProcessChartsProps {
  processName: string;
}

const ProcessCharts = ({ processName }: ProcessChartsProps) => {
  const [history, setHistory] = useState<ProcessMetrics[]>([]);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 2000);
    return () => clearInterval(interval);
  }, [processName]);

  const loadHistory = async () => {
    try {
      const data = await api.getProcessHistory(processName);
      setHistory(data);
    } catch (error) {
      console.error('Error loading process history:', error);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const chartData = history.map((metric) => ({
    time: formatTime(metric.timestamp),
    cpu: metric.cpu_percent,
    memory: metric.memory_mb,
    memoryPercent: metric.memory_percent,
    diskRead: metric.disk_read_mb,
    diskWrite: metric.disk_write_mb,
    netSent: metric.net_sent_mb,
    netRecv: metric.net_recv_mb,
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          CPU Usage - {processName}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
              label={{
                value: 'CPU %',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'currentColor' },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="cpu"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="CPU %"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Memory Usage - {processName}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
              label={{
                value: 'Memory (MB)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'currentColor' },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="memory"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorMemory)"
              name="Memory (MB)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Disk I/O - {processName}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
              label={{
                value: 'MB/s',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'currentColor' },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="diskRead"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="Read (MB/s)"
            />
            <Line
              type="monotone"
              dataKey="diskWrite"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              name="Write (MB/s)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Network Usage - {processName}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorRecv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis
              tick={{ fill: 'currentColor' }}
              className="text-gray-600 dark:text-gray-400"
              label={{
                value: 'MB/s',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'currentColor' },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="netSent"
              stroke="#8b5cf6"
              fillOpacity={1}
              fill="url(#colorSent)"
              name="Sent (MB/s)"
            />
            <Area
              type="monotone"
              dataKey="netRecv"
              stroke="#06b6d4"
              fillOpacity={1}
              fill="url(#colorRecv)"
              name="Received (MB/s)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProcessCharts;
