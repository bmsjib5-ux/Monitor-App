import { useState, useEffect } from 'react';
import { Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

interface LicenseModalProps {
  onClose: () => void;
  onLicenseVerified: (hospitalCode: string, hospitalName: string) => void;
  currentLicense?: {
    licenseKey: string;
    hospitalCode: string;
    hospitalName: string;
  } | null;
}

// LocalStorage key for license
const LICENSE_STORAGE_KEY = 'monitorapp_license';

// Supabase config
const SUPABASE_URL = 'https://ktkklfpncuhvduxxumhb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a2tsZnBuY3VodmR1eHh1bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxODg5NTQsImV4cCI6MjA4Mzc2NDk1NH0.zJDdchPJWwQoSFi2Q9pB72_TcvTfvuvz2pXECtM8NwA';

// Helper to save license to localStorage
export const saveLicenseToStorage = (license: { licenseKey: string; hospitalCode: string; hospitalName: string }) => {
  localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(license));
};

// Helper to get license from localStorage
export const getLicenseFromStorage = (): { licenseKey: string; hospitalCode: string; hospitalName: string } | null => {
  try {
    const stored = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading license from storage:', e);
  }
  return null;
};

// Helper to clear license from localStorage
export const clearLicenseFromStorage = () => {
  localStorage.removeItem(LICENSE_STORAGE_KEY);
};

// Verify license via Supabase RPC
export const verifyLicenseKey = async (licenseKey: string): Promise<{
  valid: boolean;
  hospitalCode?: string;
  hospitalName?: string;
  message: string;
}> => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_license`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_license_key: licenseKey.toUpperCase().trim(),
      }),
    });

    if (response.ok) {
      const results = await response.json();
      const result = results[0];
      if (result) {
        return {
          valid: result.valid,
          hospitalCode: result.hospital_code,
          hospitalName: result.hospital_name,
          message: result.message,
        };
      }
    }
    return { valid: false, message: 'ไม่สามารถตรวจสอบ License ได้' };
  } catch (error) {
    console.error('License verification error:', error);
    return { valid: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' };
  }
};

function LicenseModal({ onClose, onLicenseVerified, currentLicense }: LicenseModalProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [verifiedInfo, setVerifiedInfo] = useState<{ hospitalCode: string; hospitalName: string } | null>(null);

  useEffect(() => {
    if (currentLicense) {
      setLicenseKey(currentLicense.licenseKey);
      setVerifiedInfo({
        hospitalCode: currentLicense.hospitalCode,
        hospitalName: currentLicense.hospitalName,
      });
      setSuccess(true);
    }
  }, [currentLicense]);

  // Format license key as user types (XXXX-XXXX-XXXX-XXXX)
  const handleLicenseKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Add dashes every 4 characters
    if (value.length > 0) {
      const parts = [];
      for (let i = 0; i < value.length && i < 16; i += 4) {
        parts.push(value.substring(i, i + 4));
      }
      value = parts.join('-');
    }

    setLicenseKey(value);
    setError('');
    setSuccess(false);
  };

  const handleVerify = async () => {
    if (!licenseKey || licenseKey.replace(/-/g, '').length < 16) {
      setError('กรุณาใส่ License Key ให้ครบ 16 ตัวอักษร');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    const result = await verifyLicenseKey(licenseKey);

    if (result.valid && result.hospitalCode) {
      setSuccess(true);
      setVerifiedInfo({
        hospitalCode: result.hospitalCode,
        hospitalName: result.hospitalName || '',
      });

      // Save to localStorage
      saveLicenseToStorage({
        licenseKey,
        hospitalCode: result.hospitalCode,
        hospitalName: result.hospitalName || '',
      });

      // Notify parent
      onLicenseVerified(result.hospitalCode, result.hospitalName || '');
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  const handleClearLicense = () => {
    clearLicenseFromStorage();
    setLicenseKey('');
    setSuccess(false);
    setVerifiedInfo(null);
    setError('');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-500" />
            License Activation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            ใส่ License Key เพื่อเปิดใช้งานโปรแกรมสำหรับสถานพยาบาลของท่าน
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              License Key
            </label>
            <input
              type="text"
              value={licenseKey}
              onChange={handleLicenseKeyChange}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              maxLength={19}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-center text-lg font-mono tracking-wider text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}

          {success && verifiedInfo && (
            <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="font-medium text-green-600 dark:text-green-400">License ถูกต้อง</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p><span className="font-medium">รหัสสถานพยาบาล:</span> {verifiedInfo.hospitalCode}</p>
                {verifiedInfo.hospitalName && (
                  <p><span className="font-medium">ชื่อสถานพยาบาล:</span> {verifiedInfo.hospitalName}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {success ? (
              <>
                <Button variant="secondary" onClick={handleClearLicense} className="flex-1">
                  เปลี่ยน License
                </Button>
                <Button onClick={onClose} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  ปิด
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose} className="flex-1">
                  ยกเลิก
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={loading || !licenseKey}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังตรวจสอบ...</span>
                    </>
                  ) : (
                    <span>ยืนยัน License</span>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LicenseModal;
