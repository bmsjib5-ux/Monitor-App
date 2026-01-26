import { useState, useEffect } from 'react';
import { Lock, User, Eye, EyeOff, AlertCircle, LayoutDashboard } from 'lucide-react';

interface MasterLoginProps {
  onLogin: () => void;
  onBack: () => void;
}

// Credentials (in production, this should be handled by backend)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'bmshosxp!@#$';

// LocalStorage keys for remember me
const REMEMBER_KEY = 'masterRemember';
const SAVED_USER_KEY = 'masterSavedUser';
const SAVED_PASS_KEY = 'masterSavedPass';

function MasterLogin({ onLogin, onBack }: MasterLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load saved credentials on mount
  useEffect(() => {
    const savedRemember = localStorage.getItem(REMEMBER_KEY) === 'true';
    if (savedRemember) {
      const savedUser = localStorage.getItem(SAVED_USER_KEY) || '';
      const savedPass = localStorage.getItem(SAVED_PASS_KEY) || '';
      setUsername(savedUser);
      setPassword(savedPass);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate login delay
    setTimeout(() => {
      if (username === ADMIN_USER && password === ADMIN_PASS) {
        // Save or clear credentials based on remember me checkbox
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, 'true');
          localStorage.setItem(SAVED_USER_KEY, username);
          localStorage.setItem(SAVED_PASS_KEY, password);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(SAVED_USER_KEY);
          localStorage.removeItem(SAVED_PASS_KEY);
        }

        // Store auth state
        sessionStorage.setItem('masterAuth', 'true');
        sessionStorage.setItem('masterAuthTime', Date.now().toString());
        onLogin();
      } else {
        setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        setLoading(false);
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <LayoutDashboard className="w-8 h-8 text-purple-300" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-purple-200">เข้าสู่ระบบเพื่อดูข้อมูลทุกสถานพยาบาล</p>
        </div>

        {/* Login Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                ชื่อผู้ใช้
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-300" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter username"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-300" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-purple-600 bg-white/10 border-white/20 rounded focus:ring-purple-500 focus:ring-2 cursor-pointer"
              />
              <label
                htmlFor="rememberMe"
                className="ml-2 text-sm text-purple-200 cursor-pointer select-none"
              >
                จำค่าการเข้าสู่ระบบ
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>กำลังเข้าสู่ระบบ...</span>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>เข้าสู่ระบบ</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-purple-300 text-sm">หรือ</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          {/* Back Button */}
          <button
            onClick={onBack}
            className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-all duration-200 border border-white/20"
          >
            กลับไปหน้าเลือก Mode
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-purple-300/60 text-sm mt-6">
          Windows Application Monitor - Admin Access
        </p>
      </div>
    </div>
  );
}

export default MasterLogin;
