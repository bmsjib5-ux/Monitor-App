import { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Clock, RotateCcw, Play, Monitor, Loader2, Calendar, Building2 } from 'lucide-react';
import { api } from '../api';
import { RestartSchedule, RestartScheduleType, AutoStartSchedule, AutoStartScheduleType, WindowInfo } from '../types';

// Re-export for backward compatibility
export type { RestartSchedule, RestartScheduleType, AutoStartSchedule, AutoStartScheduleType } from '../types';

interface EditProcessModalProps {
  processName: string;
  pid?: number;
  currentHostname?: string;
  currentHospitalCode?: string;
  currentHospitalName?: string;
  currentCompanyName?: string;
  currentInstallDate?: string;
  currentWarrantyExpiryDate?: string;
  currentProgramPath?: string;
  currentRestartSchedule?: RestartSchedule;
  currentAutoStartSchedule?: AutoStartSchedule;
  currentWindowTitle?: string;
  currentWindowInfo?: WindowInfo;
  onClose: () => void;
  onSave: (pid: number | undefined, hostname: string, hospitalCode: string, hospitalName: string, programPath: string, restartSchedule?: RestartSchedule, autoStartSchedule?: AutoStartSchedule, companyName?: string, installDate?: string, warrantyExpiryDate?: string) => void;
}

const EditProcessModal = ({
  processName,
  pid,
  currentHostname,
  currentHospitalCode,
  currentHospitalName,
  currentCompanyName,
  currentInstallDate,
  currentWarrantyExpiryDate,
  currentProgramPath,
  currentRestartSchedule,
  currentAutoStartSchedule,
  currentWindowTitle,
  currentWindowInfo,
  onClose,
  onSave
}: EditProcessModalProps) => {
  const [hostname, setHostname] = useState(currentHostname || '');
  const [hospitalCode, setHospitalCode] = useState(currentHospitalCode || '');
  const [hospitalName, setHospitalName] = useState(currentHospitalName || '');
  const [companyName, setCompanyName] = useState(currentCompanyName || '');
  const [installDate, setInstallDate] = useState(currentInstallDate || '');
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState(currentWarrantyExpiryDate || '');
  const [programPath, setProgramPath] = useState(currentProgramPath || '');
  const [codeError, setCodeError] = useState('');

  // Restart schedule state
  const [restartEnabled, setRestartEnabled] = useState(currentRestartSchedule?.enabled || false);
  const [restartType, setRestartType] = useState<RestartScheduleType>(currentRestartSchedule?.type || 'none');
  const [intervalMinutes, setIntervalMinutes] = useState(currentRestartSchedule?.intervalMinutes ?? 0);
  const [intervalSeconds, setIntervalSeconds] = useState(currentRestartSchedule?.intervalSeconds ?? 0);
  const [dailyTime, setDailyTime] = useState(currentRestartSchedule?.dailyTime || '06:00');

  // Auto-start schedule state (start when process is stopped)
  const [autoStartEnabled, setAutoStartEnabled] = useState(currentAutoStartSchedule?.enabled || false);
  const [autoStartType, setAutoStartType] = useState<AutoStartScheduleType>(currentAutoStartSchedule?.type || 'none');
  const [autoStartIntervalMinutes, setAutoStartIntervalMinutes] = useState(currentAutoStartSchedule?.intervalMinutes ?? 0);
  const [autoStartIntervalSeconds, setAutoStartIntervalSeconds] = useState(currentAutoStartSchedule?.intervalSeconds ?? 0);
  const [autoStartDailyTime, setAutoStartDailyTime] = useState(currentAutoStartSchedule?.dailyTime || '06:00');

  // Window info state
  const [windowTitle, setWindowTitle] = useState<string | null>(currentWindowTitle || null);
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(currentWindowInfo || null);

  // Update auto-start state when props change (e.g., when modal reopens with fresh data)
  useEffect(() => {
    if (currentAutoStartSchedule) {
      setAutoStartEnabled(currentAutoStartSchedule.enabled || false);
      setAutoStartType(currentAutoStartSchedule.type || 'none');
      setAutoStartIntervalMinutes(currentAutoStartSchedule.intervalMinutes ?? 1);
      setAutoStartIntervalSeconds(currentAutoStartSchedule.intervalSeconds ?? 0);
      setAutoStartDailyTime(currentAutoStartSchedule.dailyTime || '06:00');
    }
  }, [currentAutoStartSchedule]);

  // Update restart state when props change
  useEffect(() => {
    if (currentRestartSchedule) {
      setRestartEnabled(currentRestartSchedule.enabled || false);
      setRestartType(currentRestartSchedule.type || 'none');
      setIntervalMinutes(currentRestartSchedule.intervalMinutes ?? 0);
      setIntervalSeconds(currentRestartSchedule.intervalSeconds ?? 0);
      setDailyTime(currentRestartSchedule.dailyTime || '06:00');
    }
  }, [currentRestartSchedule]);
  const [loadingWindowInfo, setLoadingWindowInfo] = useState(false);

  // Load hostname from API if not already set
  useEffect(() => {
    if (!hostname) {
      loadHostname();
    }
  }, []);

  // Load window info on mount if not provided
  useEffect(() => {
    if (!currentWindowTitle && !currentWindowInfo && pid) {
      loadWindowInfo();
    }
  }, []);

  const loadWindowInfo = async () => {
    setLoadingWindowInfo(true);
    try {
      const result = await api.getProcessWindowInfo(processName, pid);
      setWindowTitle(result.window_title);
      setWindowInfo(result.window_info);
    } catch (error) {
      console.error('Error fetching window info:', error);
    } finally {
      setLoadingWindowInfo(false);
    }
  };

  const loadHostname = async () => {
    try {
      const computerName = await api.getHostname();
      setHostname(computerName);
    } catch (error) {
      console.error('Error loading hostname:', error);
    }
  };

  // Validate hospital code (5 digits only)
  const validateHospitalCode = (code: string): boolean => {
    if (!code) return true; // Empty is allowed
    const regex = /^\d{5}$/;
    return regex.test(code);
  };

  const handleCodeChange = (value: string) => {
    // Only allow digits and max 5 characters
    const filtered = value.replace(/\D/g, '').slice(0, 5);
    setHospitalCode(filtered);

    if (filtered && filtered.length !== 5) {
      setCodeError('รหัสสถานพยาบาลต้องเป็นตัวเลข 5 หลัก');
    } else {
      setCodeError('');
    }
  };

  const handleInstallDateChange = (value: string) => {
    setInstallDate(value);
    // Auto-calculate warranty expiry date = install_date + 1 year
    if (value) {
      const expiry = new Date(value);
      expiry.setFullYear(expiry.getFullYear() + 1);
      setWarrantyExpiryDate(expiry.toISOString().split('T')[0]);
    } else {
      setWarrantyExpiryDate('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate hospital code before save
    if (hospitalCode && !validateHospitalCode(hospitalCode)) {
      setCodeError('รหัสสถานพยาบาลต้องเป็นตัวเลข 5 หลัก');
      return;
    }

    // Build restart schedule object
    const restartSchedule: RestartSchedule = {
      type: restartEnabled ? restartType : 'none',
      enabled: restartEnabled,
      intervalMinutes: restartType === 'interval' ? intervalMinutes : undefined,
      intervalSeconds: restartType === 'interval' ? intervalSeconds : undefined,
      dailyTime: restartType === 'daily' ? dailyTime : undefined,
    };

    // Build auto-start schedule object
    const autoStartSchedule: AutoStartSchedule = {
      type: autoStartEnabled ? autoStartType : 'none',
      enabled: autoStartEnabled,
      intervalMinutes: autoStartType === 'interval' ? autoStartIntervalMinutes : undefined,
      intervalSeconds: autoStartType === 'interval' ? autoStartIntervalSeconds : undefined,
      dailyTime: autoStartType === 'daily' ? autoStartDailyTime : undefined,
    };

    onSave(pid, hostname, hospitalCode, hospitalName, programPath, restartSchedule, autoStartSchedule, companyName || undefined, installDate || undefined, warrantyExpiryDate || undefined);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Edit Process Details
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {/* Process Name and PID (Read-only) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Process Name
                </label>
                <input
                  type="text"
                  value={processName}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  PID
                </label>
                <input
                  type="text"
                  value={pid || '-'}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Window Info Display */}
            {(loadingWindowInfo || windowTitle || windowInfo) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    ข้อมูล Window Title
                  </span>
                  {loadingWindowInfo && (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                </div>
                {!loadingWindowInfo && windowTitle && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Window Title: </span>
                      <span className="text-gray-900 dark:text-white font-mono text-xs break-all">
                        {windowTitle}
                      </span>
                    </div>
                    {windowInfo?.version && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Version: </span>
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          {windowInfo.version}
                        </span>
                      </div>
                    )}
                    {windowInfo?.hospital_code && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">รหัสสถานพยาบาล (จาก Window): </span>
                        <span className="text-primary-600 dark:text-primary-400 font-semibold">
                          {windowInfo.hospital_code}
                        </span>
                      </div>
                    )}
                    {windowInfo?.hospital_name && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">ชื่อสถานพยาบาล (จาก Window): </span>
                        <span className="text-primary-600 dark:text-primary-400 font-semibold">
                          {windowInfo.hospital_name}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {!loadingWindowInfo && !windowTitle && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ไม่พบ Window Title สำหรับ Process นี้
                  </p>
                )}
              </div>
            )}

            {/* Hostname (Auto-detected) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ชื่อเครื่อง (Hostname)
              </label>
              <input
                type="text"
                value={hostname}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white cursor-not-allowed"
                placeholder="กำลังโหลด..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                ดึงจากชื่อเครื่องโดยอัตโนมัติ
              </p>
            </div>

            {/* Hospital Code (5 digits) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                รหัสสถานพยาบาล (5 หลัก) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={hospitalCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                  codeError
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="เช่น 12345"
                maxLength={5}
              />
              {codeError && (
                <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {codeError}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                รหัสสถานพยาบาล 5 หลัก จาก สปสช.
              </p>
            </div>

            {/* Hospital Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ชื่อสถานพยาบาล
              </label>
              <input
                type="text"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="เช่น โรงพยาบาลกรุงเทพ (optional)"
              />
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., Inter, AI"
              />
              {currentWindowInfo?.company && !currentCompanyName && (
                <p className="mt-1 text-xs text-blue-500 dark:text-blue-400">
                  จาก Window Info: {currentWindowInfo.company}
                </p>
              )}
            </div>

            {/* Install Date and Warranty Expiry */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  วันที่ติดตั้ง Gateway
                </label>
                <input
                  type="date"
                  value={installDate}
                  onChange={(e) => handleInstallDateChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  วันที่หมดประกัน
                </label>
                <input
                  type="date"
                  value={warrantyExpiryDate}
                  onChange={(e) => setWarrantyExpiryDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {installDate && warrantyExpiryDate && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    คำนวณจากวันติดตั้ง + 1 ปี (แก้ไขได้)
                  </p>
                )}
              </div>
            </div>

            {/* Program Path */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Program Path
              </label>
              <input
                type="text"
                value={programPath}
                onChange={(e) => setProgramPath(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., C:\Program Files\App\app.exe (optional)"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Full path to the executable file
              </p>
            </div>

            {/* Restart Schedule Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
              <div className="flex items-center gap-2 mb-4">
                <RotateCcw className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  ตั้งเวลา Restart อัตโนมัติ
                </h3>
              </div>

              {/* Enable/Disable Toggle */}
              <div className="flex items-center gap-3 mb-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restartEnabled}
                    onChange={(e) => {
                      setRestartEnabled(e.target.checked);
                      if (e.target.checked && restartType === 'none') {
                        setRestartType('interval');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {restartEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </span>
              </div>

              {restartEnabled && (
                <>
                  {/* Restart Type Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      รูปแบบการ Restart
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="restartType"
                          value="interval"
                          checked={restartType === 'interval'}
                          onChange={() => setRestartType('interval')}
                          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">ทุกๆ ช่วงเวลา</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="restartType"
                          value="daily"
                          checked={restartType === 'daily'}
                          onChange={() => setRestartType('daily')}
                          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">ตามเวลาที่กำหนด</span>
                      </label>
                    </div>
                  </div>

                  {/* Interval Settings */}
                  {restartType === 'interval' && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Restart ทุกๆ
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="1440"
                          value={intervalMinutes}
                          onChange={(e) => setIntervalMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">นาที</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={intervalSeconds}
                          onChange={(e) => setIntervalSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">วินาที</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        โปรแกรมจะถูกปิดและเปิดใหม่อัตโนมัติทุกๆ {intervalMinutes > 0 ? `${intervalMinutes} นาที` : ''} {intervalSeconds > 0 ? `${intervalSeconds} วินาที` : ''}
                      </p>
                    </div>
                  )}

                  {/* Daily Time Settings */}
                  {restartType === 'daily' && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Restart เวลา
                      </label>
                      <input
                        type="time"
                        value={dailyTime}
                        onChange={(e) => setDailyTime(e.target.value)}
                        className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        โปรแกรมจะถูกปิดและเปิดใหม่อัตโนมัติทุกวันเวลา {dailyTime} น.
                      </p>
                    </div>
                  )}

                  {/* Warning Message */}
                  <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        การ Restart อัตโนมัติจะบังคับปิดโปรแกรม (Force Kill) และเปิดใหม่ตาม Program Path ที่กำหนด
                        {!programPath && <strong className="block mt-1 text-red-600 dark:text-red-400">⚠️ กรุณาระบุ Program Path เพื่อให้สามารถเปิดโปรแกรมใหม่ได้</strong>}
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Auto-Start Schedule Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
              <div className="flex items-center gap-2 mb-4">
                <Play className="w-5 h-5 text-green-600 dark:text-green-400" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  เปิดโปรแกรมอัตโนมัติ (เมื่อโปรแกรมปิดอยู่)
                </h3>
              </div>

              {/* Enable/Disable Toggle */}
              <div className="flex items-center gap-3 mb-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoStartEnabled}
                    onChange={(e) => {
                      setAutoStartEnabled(e.target.checked);
                      if (e.target.checked && autoStartType === 'none') {
                        setAutoStartType('interval');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                </label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {autoStartEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </span>
              </div>

              {autoStartEnabled && (
                <>
                  {/* Auto-Start Type Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      รูปแบบการตรวจสอบ
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="autoStartType"
                          value="interval"
                          checked={autoStartType === 'interval'}
                          onChange={() => setAutoStartType('interval')}
                          className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">ตรวจสอบทุกๆ ช่วงเวลา</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="autoStartType"
                          value="daily"
                          checked={autoStartType === 'daily'}
                          onChange={() => setAutoStartType('daily')}
                          className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">ตรวจสอบตามเวลาที่กำหนด</span>
                      </label>
                    </div>
                  </div>

                  {/* Interval Settings */}
                  {autoStartType === 'interval' && (
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="w-4 h-4 inline mr-1" />
                        ตรวจสอบทุกๆ
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="1440"
                          value={autoStartIntervalMinutes}
                          onChange={(e) => setAutoStartIntervalMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">นาที</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={autoStartIntervalSeconds}
                          onChange={(e) => setAutoStartIntervalSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">วินาที</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        ถ้าโปรแกรมปิดอยู่ จะถูกเปิดอัตโนมัติทุกๆ {autoStartIntervalMinutes > 0 ? `${autoStartIntervalMinutes} นาที` : ''} {autoStartIntervalSeconds > 0 ? `${autoStartIntervalSeconds} วินาที` : ''}
                      </p>
                    </div>
                  )}

                  {/* Daily Time Settings */}
                  {autoStartType === 'daily' && (
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="w-4 h-4 inline mr-1" />
                        ตรวจสอบและเปิดเวลา
                      </label>
                      <input
                        type="time"
                        value={autoStartDailyTime}
                        onChange={(e) => setAutoStartDailyTime(e.target.value)}
                        className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        ถ้าโปรแกรมปิดอยู่ จะถูกเปิดอัตโนมัติทุกวันเวลา {autoStartDailyTime} น.
                      </p>
                    </div>
                  )}

                  {/* Info Message */}
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        ระบบจะตรวจสอบสถานะโปรแกรม ถ้าโปรแกรมปิดอยู่จะเปิดอัตโนมัติตาม Program Path ที่กำหนด
                        {!programPath && <strong className="block mt-1 text-red-600 dark:text-red-400">⚠️ กรุณาระบุ Program Path เพื่อให้สามารถเปิดโปรแกรมได้</strong>}
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProcessModal;
