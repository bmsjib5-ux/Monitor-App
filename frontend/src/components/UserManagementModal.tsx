import { useState, useEffect } from 'react';
import { X, UserPlus, Users, Trash2, Edit2, Save, Eye, EyeOff, Building2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabaseApi, HospitalUser } from '../supabaseClient';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function UserManagementModal({ isOpen, onClose }: UserManagementModalProps) {
  const [users, setUsers] = useState<HospitalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<HospitalUser | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    display_name: '',
    hospital_code: '',
    hospital_name: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  // Load users
  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supabaseApi.getHospitalUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  // Reset form
  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
      display_name: '',
      hospital_code: '',
      hospital_name: '',
    });
    setEditingUser(null);
    setShowForm(false);
    setShowPassword(false);
  };

  // Handle edit
  const handleEdit = (user: HospitalUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      confirmPassword: '',
      display_name: user.display_name || '',
      hospital_code: user.hospital_code,
      hospital_name: user.hospital_name || '',
    });
    setShowForm(true);
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate
    if (!formData.username.trim()) {
      setError('กรุณากรอก Username');
      return;
    }
    if (!formData.hospital_code.trim()) {
      setError('กรุณากรอกรหัสสถานพยาบาล');
      return;
    }
    if (!editingUser && !formData.password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }
    if (formData.password && formData.password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Update
        const result = await supabaseApi.updateHospitalUser({
          user_id: editingUser.id,
          display_name: formData.display_name || undefined,
          hospital_code: formData.hospital_code,
          hospital_name: formData.hospital_name || undefined,
          new_password: formData.password || undefined,
        });
        if (result.success) {
          setSuccess('อัพเดทผู้ใช้สำเร็จ');
          resetForm();
          loadUsers();
        } else {
          setError(result.message);
        }
      } else {
        // Create
        const result = await supabaseApi.createHospitalUser({
          username: formData.username,
          password: formData.password,
          display_name: formData.display_name || formData.username,
          hospital_code: formData.hospital_code,
          hospital_name: formData.hospital_name || undefined,
        });
        if (result.success) {
          setSuccess('สร้างผู้ใช้สำเร็จ');
          resetForm();
          loadUsers();
        } else {
          setError(result.message);
        }
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (user: HospitalUser) => {
    if (!confirm(`ยืนยันลบผู้ใช้ "${user.username}" ?`)) return;

    setSaving(true);
    setError(null);
    try {
      const result = await supabaseApi.deleteHospitalUser(user.id);
      if (result.success) {
        setSuccess('ลบผู้ใช้สำเร็จ');
        loadUsers();
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Handle toggle active
  const handleToggleActive = async (user: HospitalUser) => {
    setSaving(true);
    try {
      const result = await supabaseApi.updateHospitalUser({
        user_id: user.id,
        is_active: !user.is_active,
      });
      if (result.success) {
        loadUsers();
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">จัดการผู้ใช้โรงพยาบาล</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              {success}
            </div>
          )}

          {/* Add User Button */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <UserPlus className="w-5 h-5" />
              เพิ่มผู้ใช้ใหม่
            </button>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
                {editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    disabled={!!editingUser}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                    placeholder="username"
                  />
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ชื่อที่แสดง
                  </label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="ชื่อผู้ใช้"
                  />
                </div>

                {/* Hospital Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    รหัสสถานพยาบาล <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.hospital_code}
                    onChange={(e) => setFormData({ ...formData, hospital_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="รหัส 5 หลัก"
                  />
                </div>

                {/* Hospital Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ชื่อสถานพยาบาล
                  </label>
                  <input
                    type="text"
                    value={formData.hospital_name}
                    onChange={(e) => setFormData({ ...formData, hospital_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="ชื่อโรงพยาบาล"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    รหัสผ่าน {!editingUser && <span className="text-red-500">*</span>}
                    {editingUser && <span className="text-gray-500 text-xs">(เว้นว่างถ้าไม่เปลี่ยน)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="รหัสผ่าน"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ยืนยันรหัสผ่าน
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="ยืนยันรหัสผ่าน"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex gap-2 mt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingUser ? 'บันทึก' : 'สร้างผู้ใช้'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>ยังไม่มีผู้ใช้โรงพยาบาล</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Username</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">ชื่อ</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">รหัส รพ.</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">ชื่อ รพ.</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">สถานะ</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{user.username}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{user.display_name || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-sm">
                          <Building2 className="w-3 h-3" />
                          {user.hospital_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{user.hospital_name || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(user)}
                          disabled={saving}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            user.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          }`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                            title="แก้ไข"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            disabled={saving}
                            className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            title="ลบ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            รวม {users.length} ผู้ใช้ | ผู้ใช้ที่ Active: {users.filter(u => u.is_active).length}
          </p>
        </div>
      </div>
    </div>
  );
}

export default UserManagementModal;
