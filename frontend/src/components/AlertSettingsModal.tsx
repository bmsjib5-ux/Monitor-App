import { useState, useEffect } from 'react';
import { X, Save, Bell, Cpu, HardDrive, Network, MemoryStick, Clock, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { AlertSettings } from '../types';
import { getAlertSettings, saveAlertSettings, defaultAlertSettings } from '../utils/localStorage';
import { api } from '../api';

interface AlertSettingsModalProps {
  onClose: () => void;
  onSave: (settings: AlertSettings) => void;
}

const AlertSettingsModal = ({ onClose, onSave }: AlertSettingsModalProps) => {
  const [settings, setSettings] = useState<AlertSettings>(defaultAlertSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load settings from localStorage first, then try API
    const loadSettings = async () => {
      // First load from localStorage (instant)
      const stored = getAlertSettings();
      setSettings(stored);

      // Then try to sync from backend API
      try {
        const apiSettings = await api.getAlertSettings();
        if (apiSettings) {
          setSettings(apiSettings);
          // Also update localStorage to match
          saveAlertSettings(apiSettings);
        }
      } catch (err) {
        console.log('Could not load from API, using localStorage');
      }
    };
    loadSettings();
  }, []);

  const handleToggle = (field: keyof AlertSettings) => {
    setSettings(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleNumberChange = (field: keyof AlertSettings, value: number) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      // Save to localStorage first
      saveAlertSettings(settings);

      // Then save to backend API
      await api.updateAlertSettings(settings);

      onSave(settings);
      onClose();
    } catch (err) {
      console.error('Error saving alert settings:', err);
      setError('ไม่สามารถบันทึกได้ กรุณาลองใหม่อีกครั้ง');
      // Still save to localStorage even if API fails
      saveAlertSettings(settings);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(defaultAlertSettings);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-orange-500" />
            ตั้งค่าการแจ้งเตือน
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {/* CPU Alert */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-gray-900 dark:text-white">CPU Usage Alert</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.cpuAlertEnabled}
                    onChange={() => handleToggle('cpuAlertEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
              {settings.cpuAlertEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">แจ้งเตือนเมื่อ CPU เกิน</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.cpuThreshold}
                    onChange={(e) => handleNumberChange('cpuThreshold', Math.max(1, Math.min(100, parseInt(e.target.value) || 80)))}
                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">%</span>
                </div>
              )}
            </div>

            {/* RAM Alert */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-gray-900 dark:text-white">RAM Usage Alert</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.ramAlertEnabled}
                    onChange={() => handleToggle('ramAlertEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                </label>
              </div>
              {settings.ramAlertEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">แจ้งเตือนเมื่อ RAM เกิน</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.ramThreshold}
                    onChange={(e) => handleNumberChange('ramThreshold', Math.max(1, Math.min(100, parseInt(e.target.value) || 80)))}
                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">%</span>
                </div>
              )}
            </div>

            {/* Disk I/O Alert */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-purple-500" />
                  <span className="font-medium text-gray-900 dark:text-white">Disk I/O Alert</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.diskIoAlertEnabled}
                    onChange={() => handleToggle('diskIoAlertEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                </label>
              </div>
              {settings.diskIoAlertEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">แจ้งเตือนเมื่อ Disk I/O เกิน</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={settings.diskIoThreshold}
                    onChange={(e) => handleNumberChange('diskIoThreshold', Math.max(1, parseInt(e.target.value) || 100))}
                    className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">MB/s</span>
                </div>
              )}
            </div>

            {/* Network Alert */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-cyan-500" />
                  <span className="font-medium text-gray-900 dark:text-white">Network Usage Alert</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.networkAlertEnabled}
                    onChange={() => handleToggle('networkAlertEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 dark:peer-focus:ring-cyan-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div>
                </label>
              </div>
              {settings.networkAlertEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">แจ้งเตือนเมื่อ Network เกิน</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={settings.networkThreshold}
                    onChange={(e) => handleNumberChange('networkThreshold', Math.max(1, parseInt(e.target.value) || 50))}
                    className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">MB/s</span>
                </div>
              )}
            </div>

            {/* Process Stopped Alert */}
            <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-gray-900 dark:text-white">Process Stopped Alert</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.processStoppedAlertEnabled}
                    onChange={() => handleToggle('processStoppedAlertEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                </label>
              </div>
              {settings.processStoppedAlertEnabled && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    แจ้งเตือนเมื่อ Process หยุดทำงานนานเกิน:
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-red-500" />
                    <input
                      type="number"
                      min="0"
                      max="1440"
                      value={settings.processStoppedMinutes}
                      onChange={(e) => handleNumberChange('processStoppedMinutes', Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">นาที</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={settings.processStoppedSeconds}
                      onChange={(e) => handleNumberChange('processStoppedSeconds', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">วินาที</span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    ระบบจะแจ้งเตือนไปยัง Master เมื่อ Process หยุดทำงานนานเกิน {settings.processStoppedMinutes > 0 ? `${settings.processStoppedMinutes} นาที` : ''} {settings.processStoppedSeconds > 0 ? `${settings.processStoppedSeconds} วินาที` : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <strong>หมายเหตุ:</strong> การตั้งค่านี้จะถูกบันทึกไว้ในเครื่องนี้ และจะถูกนำไปใช้ในการส่งแจ้งเตือนไปยัง Master Dashboard
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              รีเซ็ตค่าเริ่มต้น
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    บันทึก
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AlertSettingsModal;
