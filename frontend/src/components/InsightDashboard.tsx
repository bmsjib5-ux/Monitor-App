import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, WifiOff, Calendar, Clock, TrendingUp, Zap, Building2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { ProcessInfo } from '../types';

interface InsightDashboardProps {
  processes: ProcessInfo[];
  isProcessOffline: (recordedAt?: string) => boolean;
}

interface Alert24h {
  id: number;
  process_name: string;
  alert_type: string;
  hostname: string | null;
  hospital_code: string | null;
  hospital_name: string | null;
  created_at: string;
}

const GW_COLORS: Record<string, string> = {
  running: '#22c55e',
  stopped: '#ef4444',
  unknown: '#9ca3af',
  'no bms': '#6b7280',
};

export default function InsightDashboard({ processes, isProcessOffline }: InsightDashboardProps) {
  const [alerts24h, setAlerts24h] = useState<Alert24h[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/supabase/alerts/24h?limit=500');
        if (res.ok) {
          const data = await res.json();
          // Append Z for UTC interpretation
          const normalized = (data.data || []).map((a: any) => ({
            ...a,
            created_at: a.created_at && !a.created_at.includes('+') && !a.created_at.endsWith('Z')
              ? a.created_at + 'Z'
              : a.created_at,
          }));
          setAlerts24h(normalized);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60000); // refresh every 1 min
    return () => clearInterval(interval);
  }, []);

  // Top cards
  const topCards = useMemo(() => {
    // Alerts 24h total
    const totalAlerts = alerts24h.length;

    // Flaky: process with stop+start > 3 events in 24h
    const eventCount: Record<string, number> = {};
    alerts24h.forEach(a => {
      const key = `${a.process_name}__${a.hostname || ''}`;
      eventCount[key] = (eventCount[key] || 0) + 1;
    });
    const flakyCount = Object.values(eventCount).filter(c => c >= 3).length;

    // Offline hospitals: all processes in hospital offline
    const hospitalMap = new Map<string, ProcessInfo[]>();
    processes.forEach(p => {
      const code = p.hospital_code || 'unknown';
      if (!hospitalMap.has(code)) hospitalMap.set(code, []);
      hospitalMap.get(code)!.push(p);
    });
    let offlineHospitals = 0;
    hospitalMap.forEach(procs => {
      if (procs.every(p => isProcessOffline(p.recorded_at))) offlineHospitals++;
    });

    // Expiring warranty within 30 days (unique hospitals)
    const expiringHospitals = new Set<string>();
    const now = Date.now();
    const in30days = now + 30 * 24 * 60 * 60 * 1000;
    processes.forEach(p => {
      if (p.warranty_expiry_date && p.hospital_code) {
        const exp = new Date(p.warranty_expiry_date).getTime();
        if (exp <= in30days) expiringHospitals.add(p.hospital_code);
      }
    });

    return { totalAlerts, flakyCount, offlineHospitals, expiringWarranty: expiringHospitals.size };
  }, [alerts24h, processes, isProcessOffline]);

  // Activity timeline (group by hour, last 24h)
  const timelineData = useMemo(() => {
    const hours: Record<string, { hour: string; stopped: number; started: number }> = {};
    const now = new Date();
    // Seed 24 empty hours
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const key = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:00`;
      hours[key] = { hour: key, stopped: 0, started: 0 };
    }
    alerts24h.forEach(a => {
      const d = new Date(a.created_at);
      const key = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:00`;
      if (!hours[key]) hours[key] = { hour: key, stopped: 0, started: 0 };
      if (a.alert_type === 'PROCESS_STOPPED') hours[key].stopped++;
      else if (a.alert_type === 'PROCESS_STARTED') hours[key].started++;
    });
    return Object.values(hours);
  }, [alerts24h]);

  // Top problematic hospitals (by alert count in 24h)
  const topHospitals = useMemo(() => {
    const count: Record<string, { code: string; name: string; alerts: number }> = {};
    alerts24h.forEach(a => {
      const code = a.hospital_code || a.hostname || 'unknown';
      if (!count[code]) {
        count[code] = {
          code,
          name: a.hospital_name || a.hostname || 'ไม่ระบุ',
          alerts: 0,
        };
      }
      count[code].alerts++;
    });
    return Object.values(count).sort((a, b) => b.alerts - a.alerts).slice(0, 10);
  }, [alerts24h]);

  // Flaky processes (top 10 by event count)
  const flakyProcesses = useMemo(() => {
    const count: Record<string, { name: string; hostname: string; hospital: string; events: number }> = {};
    alerts24h.forEach(a => {
      const key = `${a.process_name}__${a.hostname || ''}`;
      if (!count[key]) {
        count[key] = {
          name: a.process_name,
          hostname: a.hostname || '-',
          hospital: a.hospital_name || '-',
          events: 0,
        };
      }
      count[key].events++;
    });
    return Object.values(count).filter(p => p.events >= 2).sort((a, b) => b.events - a.events).slice(0, 10);
  }, [alerts24h]);

  // Warranty attention
  const warrantyList = useMemo(() => {
    const now = Date.now();
    const in30days = now + 30 * 24 * 60 * 60 * 1000;
    const seen = new Set<string>();
    const list: Array<{
      hospital_code: string;
      hospital_name: string;
      warranty_expiry_date: string;
      days_remaining: number;
      expired: boolean;
    }> = [];
    processes.forEach(p => {
      if (!p.warranty_expiry_date || !p.hospital_code) return;
      if (seen.has(p.hospital_code)) return;
      const exp = new Date(p.warranty_expiry_date).getTime();
      if (exp > in30days) return;
      seen.add(p.hospital_code);
      const days = Math.floor((exp - now) / (24 * 60 * 60 * 1000));
      list.push({
        hospital_code: p.hospital_code,
        hospital_name: p.hospital_name || '-',
        warranty_expiry_date: p.warranty_expiry_date,
        days_remaining: days,
        expired: days < 0,
      });
    });
    return list.sort((a, b) => a.days_remaining - b.days_remaining);
  }, [processes]);

  // GW status distribution
  const gwDistribution = useMemo(() => {
    const count = { running: 0, stopped: 0, unknown: 0, 'no bms': 0 };
    processes.forEach(p => {
      if (!p.bms_status) {
        count['no bms']++;
      } else {
        const s = p.bms_status.gateway_status;
        if (s === 'running') count.running++;
        else if (s === 'stopped') count.stopped++;
        else count.unknown++;
      }
    });
    return Object.entries(count)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [processes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">
        <Activity className="w-6 h-6 animate-pulse mr-2" />
        กำลังโหลดข้อมูล Insight...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Top Alert Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          icon={<Activity className="w-8 h-8 text-blue-500" />}
          label="Alerts ใน 24 ชม."
          value={topCards.totalAlerts}
          suffix="รายการ"
          color="blue"
        />
        <Card
          icon={<Zap className="w-8 h-8 text-orange-500" />}
          label="Flaky Processes"
          value={topCards.flakyCount}
          suffix="process"
          color="orange"
          hint="process ที่ stop/start ≥ 3 ครั้ง/24ชม."
        />
        <Card
          icon={<WifiOff className="w-8 h-8 text-red-500" />}
          label="Offline Hospitals"
          value={topCards.offlineHospitals}
          suffix="รพ."
          color="red"
        />
        <Card
          icon={<Calendar className="w-8 h-8 text-yellow-500" />}
          label="Warranty ใกล้หมด"
          value={topCards.expiringWarranty}
          suffix="รพ."
          color="yellow"
          hint="เหลือ ≤ 30 วัน"
        />
      </div>

      {/* 2. Activity Timeline */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-purple-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Timeline (24 ชม.)</h3>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={Math.floor(timelineData.length / 12)} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', border: 'none', borderRadius: '8px', color: '#fff' }} />
            <Legend />
            <Line type="monotone" dataKey="stopped" stroke="#ef4444" strokeWidth={2} name="หยุดทำงาน" dot={{ r: 3 }} />
            <Line type="monotone" dataKey="started" stroke="#22c55e" strokeWidth={2} name="เริ่มทำงาน" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 3. Top Issues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Problematic Hospitals */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top รพ. ที่มี Alerts มากสุด</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">24 ชม.</span>
          </div>
          {topHospitals.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">ไม่มีข้อมูล</p>
          ) : (
            <ul className="space-y-2">
              {topHospitals.map((h, i) => (
                <li key={h.code} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{h.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{h.code}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400 flex-shrink-0">{h.alerts}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Flaky Processes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Flaky Processes (stop/start บ่อย)</h3>
          </div>
          {flakyProcesses.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">ไม่มีข้อมูล</p>
          ) : (
            <ul className="space-y-2">
              {flakyProcesses.map((p, i) => (
                <li key={`${p.name}-${p.hostname}-${i}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.hospital} · {p.hostname}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 flex-shrink-0">{p.events} ครั้ง</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 4. Warranty Attention */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-yellow-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Warranty ใกล้หมดอายุ</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">≤ 30 วัน</span>
        </div>
        {warrantyList.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">ไม่มี รพ. ที่ warranty ใกล้หมด</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">รหัส</th>
                  <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">สถานพยาบาล</th>
                  <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">วันหมดประกัน</th>
                  <th className="pb-2 font-medium text-gray-500 dark:text-gray-400 text-right">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {warrantyList.map(w => (
                  <tr key={w.hospital_code}>
                    <td className="py-2 text-gray-900 dark:text-white font-mono">{w.hospital_code}</td>
                    <td className="py-2 text-gray-900 dark:text-white">{w.hospital_name}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">
                      {new Date(w.warranty_expiry_date).toLocaleDateString('th-TH')}
                    </td>
                    <td className="py-2 text-right">
                      {w.expired ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          <AlertTriangle className="w-3 h-3" /> หมดแล้ว {Math.abs(w.days_remaining)} วัน
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                          <Clock className="w-3 h-3" /> เหลือ {w.days_remaining} วัน
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. GW Status Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Gateway Status Distribution</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={gwDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}
              >
                {gwDistribution.map((entry) => (
                  <Cell key={entry.name} fill={GW_COLORS[entry.name] || '#9ca3af'} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', border: 'none', borderRadius: '8px', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="space-y-2">
            {gwDistribution.map(item => (
              <li key={item.name} className="flex items-center justify-between p-2 rounded">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: GW_COLORS[item.name] || '#9ca3af' }} />
                  <span className="text-sm capitalize text-gray-700 dark:text-gray-300">{item.name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  suffix,
  color,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  color: 'blue' | 'orange' | 'red' | 'yellow';
  hint?: string;
}) {
  const ring: Record<string, string> = {
    blue: 'border-blue-200 dark:border-blue-800',
    orange: 'border-orange-200 dark:border-orange-800',
    red: 'border-red-200 dark:border-red-800',
    yellow: 'border-yellow-200 dark:border-yellow-800',
  };
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 ${ring[color]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {value} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{suffix}</span>
          </p>
          {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
