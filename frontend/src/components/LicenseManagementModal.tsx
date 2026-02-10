import { useState, useEffect, useMemo } from 'react';
import { X, Key, Plus, Trash2, Copy, CheckCircle, AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';

interface License {
  id: number;
  license_key: string;
  hospital_code: string;
  hospital_name: string | null;
  is_active: boolean;
  activated_at: string;
  created_at: string;
  created_by: string | null;
}

interface LicenseManagementModalProps {
  onClose: () => void;
}

// Supabase config
const SUPABASE_URL = 'https://ktkklfpncuhvduxxumhb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a2tsZnBuY3VodmR1eHh1bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxODg5NTQsImV4cCI6MjA4Mzc2NDk1NH0.zJDdchPJWwQoSFi2Q9pB72_TcvTfvuvz2pXECtM8NwA';

function LicenseManagementModal({ onClose }: LicenseManagementModalProps) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form state for creating new license
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newHospitalCode, setNewHospitalCode] = useState('');
  const [newHospitalName, setNewHospitalName] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Generated license key
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Filter licenses based on search term
  const filteredLicenses = useMemo(() => {
    if (!searchTerm.trim()) return licenses;
    const search = searchTerm.toLowerCase();
    return licenses.filter(license =>
      license.license_key.toLowerCase().includes(search) ||
      license.hospital_code.toLowerCase().includes(search) ||
      (license.hospital_name && license.hospital_name.toLowerCase().includes(search))
    );
  }, [licenses, searchTerm]);

  useEffect(() => {
    loadLicenses();
  }, []);

  const loadLicenses = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/licenses?select=*&order=created_at.desc`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setLicenses(data);
      } else {
        setError('ไม่สามารถโหลดข้อมูล License ได้');
      }
    } catch (err) {
      console.error('Error loading licenses:', err);
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  };

  const createLicense = async () => {
    if (!newHospitalCode.trim()) {
      setError('กรุณาระบุรหัสสถานพยาบาล');
      return;
    }

    setCreating(true);
    setError('');
    setSuccess('');
    setGeneratedKey(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_license`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_hospital_code: newHospitalCode.trim(),
          p_hospital_name: newHospitalName.trim() || null,
          p_created_by: 'admin',
          p_notes: newNotes.trim() || null,
        }),
      });

      if (response.ok) {
        const results = await response.json();
        const result = results[0];

        if (result && result.success) {
          setGeneratedKey(result.license_key);
          setSuccess('สร้าง License สำเร็จ!');
          // Reset form
          setNewHospitalCode('');
          setNewHospitalName('');
          setNewNotes('');
          // Reload licenses
          await loadLicenses();
        } else {
          setError(result?.message || 'ไม่สามารถสร้าง License ได้');
        }
      } else {
        setError('ไม่สามารถสร้าง License ได้');
      }
    } catch (err) {
      console.error('Error creating license:', err);
      setError('เกิดข้อผิดพลาดในการสร้าง License');
    } finally {
      setCreating(false);
    }
  };

  const revokeLicense = async (licenseKey: string) => {
    if (!confirm('ต้องการยกเลิก License นี้หรือไม่?')) {
      return;
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/revoke_license`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_license_key: licenseKey,
        }),
      });

      if (response.ok) {
        setSuccess('ยกเลิก License สำเร็จ');
        await loadLicenses();
      } else {
        setError('ไม่สามารถยกเลิก License ได้');
      }
    } catch (err) {
      console.error('Error revoking license:', err);
      setError('เกิดข้อผิดพลาดในการยกเลิก License');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">License Management</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Messages */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span className="text-sm text-green-600 dark:text-green-400">{success}</span>
            </div>
          )}

          {/* Generated Key Display */}
          {generatedKey && (
            <div className="p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">License Key ที่สร้างใหม่:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 border border-purple-300 dark:border-purple-600 rounded-lg text-lg font-mono text-center text-purple-600 dark:text-purple-400">
                  {generatedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(generatedKey)}
                  className="p-2 bg-purple-100 dark:bg-purple-800 hover:bg-purple-200 dark:hover:bg-purple-700 rounded-lg transition-colors"
                  title="Copy to clipboard"
                >
                  {copiedKey === generatedKey ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Copy className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Create License Form */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-500" />
                <span className="font-medium text-gray-900 dark:text-white">สร้าง License ใหม่</span>
              </div>
              <span className="text-gray-400">{showCreateForm ? '▲' : '▼'}</span>
            </button>

            {showCreateForm && (
              <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      รหัสสถานพยาบาล <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newHospitalCode}
                      onChange={(e) => setNewHospitalCode(e.target.value)}
                      placeholder="เช่น 10001"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ชื่อสถานพยาบาล
                    </label>
                    <input
                      type="text"
                      value={newHospitalName}
                      onChange={(e) => setNewHospitalName(e.target.value)}
                      placeholder="เช่น โรงพยาบาลทดสอบ"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    หมายเหตุ
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  onClick={createLicense}
                  disabled={creating || !newHospitalCode.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังสร้าง...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      <span>สร้าง License</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* License List */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-700/50">
              <h3 className="font-medium text-gray-900 dark:text-white">
                รายการ License ({filteredLicenses.length}{searchTerm ? `/${licenses.length}` : ''})
              </h3>
              <div className="flex items-center gap-2">
                {/* Search Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ค้นหา License, รหัส, ชื่อ..."
                    className="pl-9 pr-3 py-1.5 w-48 md:w-64 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                </div>
                <button
                  onClick={loadLicenses}
                  disabled={loading}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
              </div>
            ) : licenses.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                ยังไม่มี License
              </div>
            ) : filteredLicenses.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                ไม่พบ License ที่ตรงกับ "{searchTerm}"
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredLicenses.map((license) => (
                  <div
                    key={license.id}
                    className={`p-4 ${!license.is_active ? 'bg-gray-100 dark:bg-gray-800/50 opacity-60' : ''}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-sm text-gray-900 dark:text-white">
                            {license.license_key}
                          </code>
                          <button
                            onClick={() => copyToClipboard(license.license_key)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                            title="Copy"
                          >
                            {copiedKey === license.license_key ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          {!license.is_active && (
                            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-xs rounded-full">
                              ยกเลิกแล้ว
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium">{license.hospital_code}</span>
                          {license.hospital_name && ` - ${license.hospital_name}`}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          สร้างเมื่อ: {formatDate(license.created_at)}
                        </div>
                      </div>
                      {license.is_active && (
                        <button
                          onClick={() => revokeLicense(license.license_key)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-sm rounded-lg hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>ยกเลิก</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

export default LicenseManagementModal;
