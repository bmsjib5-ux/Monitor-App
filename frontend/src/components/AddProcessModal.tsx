import { useState, useEffect } from 'react';
import { X, Search, Building2, FolderOpen, Monitor, Loader2 } from 'lucide-react';
import { api } from '../api';
import { AvailableProcess, AddProcessData, WindowInfo } from '../types';

// LocalStorage key for remembering hospital info
const HOSPITAL_INFO_KEY = 'monitorapp_hospital_info';

// Helper to get saved hospital info from localStorage
const getSavedHospitalInfo = (): { hospitalCode: string; hospitalName: string } | null => {
  try {
    const stored = localStorage.getItem(HOSPITAL_INFO_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading hospital info from storage:', e);
  }
  return null;
};

// Helper to save hospital info to localStorage
const saveHospitalInfo = (hospitalCode: string, hospitalName: string) => {
  try {
    localStorage.setItem(HOSPITAL_INFO_KEY, JSON.stringify({ hospitalCode, hospitalName }));
  } catch (e) {
    console.error('Error saving hospital info to storage:', e);
  }
};

interface AddProcessModalProps {
  onClose: () => void;
  onAdd: (data: AddProcessData) => void;
}

const AddProcessModal = ({ onClose, onAdd }: AddProcessModalProps) => {
  const [processName, setProcessName] = useState('');
  const [selectedPid, setSelectedPid] = useState<number | undefined>(undefined);
  const [hostname, setHostname] = useState('');
  const [hospitalCode, setHospitalCode] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [programPath, setProgramPath] = useState('');
  const [availableProcesses, setAvailableProcesses] = useState<AvailableProcess[]>([]);
  const [filteredProcesses, setFilteredProcesses] = useState<AvailableProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null);
  const [windowTitle, setWindowTitle] = useState<string | null>(null);
  const [loadingWindowInfo, setLoadingWindowInfo] = useState(false);

  useEffect(() => {
    loadAvailableProcesses();
    loadHostname();
    loadSavedHospitalInfo();
  }, []);

  // Load saved hospital info from localStorage
  const loadSavedHospitalInfo = () => {
    const saved = getSavedHospitalInfo();
    if (saved) {
      setHospitalCode(saved.hospitalCode);
      setHospitalName(saved.hospitalName);
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

  useEffect(() => {
    if (searchTerm) {
      const filtered = availableProcesses.filter((proc) =>
        proc.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProcesses(filtered.slice(0, 50)); // Limit to 50 results
    } else {
      setFilteredProcesses(availableProcesses.slice(0, 50));
    }
  }, [searchTerm, availableProcesses]);

  const loadAvailableProcesses = async () => {
    try {
      const processes = await api.getAvailableProcesses();
      setAvailableProcesses(processes);
      setFilteredProcesses(processes.slice(0, 50));
    } catch (error) {
      console.error('Error loading available processes:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!processName.trim()) {
      newErrors.processName = 'กรุณาระบุชื่อ Process';
    }

    if (!hospitalCode.trim()) {
      newErrors.hospitalCode = 'กรุณาระบุรหัสสถานพยาบาล';
    } else if (!/^\d{5}$/.test(hospitalCode.trim())) {
      newErrors.hospitalCode = 'รหัสสถานพยาบาลต้องเป็นตัวเลข 5 หลัก';
    }

    if (!hospitalName.trim()) {
      newErrors.hospitalName = 'กรุณาระบุชื่อสถานพยาบาล';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      // Save hospital info to localStorage for next time
      saveHospitalInfo(hospitalCode.trim(), hospitalName.trim());

      onAdd({
        processName: processName.trim(),
        pid: selectedPid,
        hostname: hostname.trim(),
        hospitalCode: hospitalCode.trim(),
        hospitalName: hospitalName.trim(),
        programPath: programPath.trim() || undefined
      });
    }
  };

  const handleSelectProcess = async (proc: AvailableProcess) => {
    setProcessName(proc.name);
    setSelectedPid(proc.pid);
    // Clear process name error when selecting
    if (errors.processName) {
      setErrors(prev => ({ ...prev, processName: '' }));
    }

    // Fetch window info for selected process
    setLoadingWindowInfo(true);
    setWindowInfo(null);
    setWindowTitle(null);
    try {
      const result = await api.getProcessWindowInfo(proc.name, proc.pid);
      setWindowTitle(result.window_title);
      setWindowInfo(result.window_info);

      // Auto-fill hospital code and name from window info if available and not already set
      if (result.window_info) {
        if (result.window_info.hospital_code && !hospitalCode) {
          setHospitalCode(result.window_info.hospital_code);
        }
        if (result.window_info.hospital_name && !hospitalName) {
          setHospitalName(result.window_info.hospital_name);
        }
      }
    } catch (error) {
      console.error('Error fetching window info:', error);
    } finally {
      setLoadingWindowInfo(false);
    }
  };

  const handleHospitalCodeChange = (value: string) => {
    // Only allow digits, max 5
    const cleaned = value.replace(/\D/g, '').slice(0, 5);
    setHospitalCode(cleaned);
    if (errors.hospitalCode) {
      setErrors(prev => ({ ...prev, hospitalCode: '' }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            เพิ่ม Process ที่ต้องการตรวจสอบ
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Process Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ชื่อ Process <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={processName}
                onChange={(e) => {
                  setProcessName(e.target.value);
                  if (errors.processName) {
                    setErrors(prev => ({ ...prev, processName: '' }));
                  }
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                  errors.processName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="e.g., BMSHOSxPLISServices.exe"
              />
              {errors.processName && (
                <p className="mt-1 text-sm text-red-500">{errors.processName}</p>
              )}
            </div>

            {/* Window Info Display */}
            {(loadingWindowInfo || windowTitle || windowInfo) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    ข้อมูล Window Info
                  </span>
                  {loadingWindowInfo && (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                </div>
                {!loadingWindowInfo && windowInfo && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {/* Version */}
                    <div className="col-span-2 sm:col-span-1">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Version</span>
                      <div className="font-semibold text-green-600 dark:text-green-400">
                        {windowInfo.version || '-'}
                      </div>
                    </div>
                    {/* Hospital Code */}
                    <div className="col-span-2 sm:col-span-1">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">รหัสสถานพยาบาล</span>
                      <div className="font-semibold text-purple-600 dark:text-purple-400">
                        {windowInfo.hospital_code || '-'}
                      </div>
                    </div>
                    {/* Hospital Name */}
                    <div className="col-span-2 sm:col-span-1">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">ชื่อสถานพยาบาล</span>
                      <div className="font-semibold text-primary-600 dark:text-primary-400">
                        {windowInfo.hospital_name || '-'}
                      </div>
                    </div>
                    {/* Company */}
                    {windowInfo.company && (
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-gray-500 dark:text-gray-400 text-xs">Company</span>
                        <div className="font-semibold text-orange-600 dark:text-orange-400">
                          {windowInfo.company}
                        </div>
                      </div>
                    )}
                    {/* Window Title - collapsed */}
                    <div className="col-span-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Window Title</span>
                      <div className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                        {windowInfo.window_title || windowTitle || '-'}
                      </div>
                    </div>
                  </div>
                )}
                {!loadingWindowInfo && !windowInfo && windowTitle && (
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400 text-xs">Window Title</span>
                    <div className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                      {windowTitle}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      ไม่สามารถ parse ข้อมูลจาก Window Title ได้
                    </p>
                  </div>
                )}
                {!loadingWindowInfo && !windowTitle && !windowInfo && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ไม่พบ Window Title สำหรับ Process นี้
                  </p>
                )}
              </div>
            )}

            {/* Hostname (Auto-detected) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ชื่อเครื่อง (Hostname) <span className="text-red-500">*</span>
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

            {/* Hospital Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                รหัสสถานพยาบาล (5 หลัก) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={hospitalCode}
                onChange={(e) => handleHospitalCodeChange(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                  errors.hospitalCode ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="e.g., 12345"
                maxLength={5}
              />
              {errors.hospitalCode && (
                <p className="mt-1 text-sm text-red-500">{errors.hospitalCode}</p>
              )}
            </div>

            {/* Hospital Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                ชื่อสถานพยาบาล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={hospitalName}
                onChange={(e) => {
                  setHospitalName(e.target.value);
                  if (errors.hospitalName) {
                    setErrors(prev => ({ ...prev, hospitalName: '' }));
                  }
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                  errors.hospitalName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="e.g., โรงพยาบาลตัวอย่าง"
              />
              {errors.hospitalName && (
                <p className="mt-1 text-sm text-red-500">{errors.hospitalName}</p>
              )}
            </div>

            {/* Program Path (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FolderOpen className="w-4 h-4 inline mr-1" />
                Path File (ไม่บังคับ)
              </label>
              <input
                type="text"
                value={programPath}
                onChange={(e) => setProgramPath(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., C:\Program Files\MyApp\app.exe"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                ระบุ path สำหรับ start process อัตโนมัติ
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                เพิ่ม Process
              </button>
            </div>
          </form>

          {/* Process Selection */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                หรือเลือกจาก Process ที่กำลังทำงาน
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="ค้นหา process..."
                />
              </div>
            </div>

            <div className="h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              {loading ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  กำลังโหลด processes...
                </div>
              ) : filteredProcesses.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  ไม่พบ process
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredProcesses.map((proc, index) => (
                    <button
                      key={`${proc.name}-${proc.pid}-${index}`}
                      onClick={() => handleSelectProcess(proc)}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex justify-between items-center ${
                        processName === proc.name ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                      }`}
                    >
                      <span className={`font-medium ${
                        processName === proc.name
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {proc.name}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 text-sm">
                        PID: {proc.pid}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddProcessModal;
