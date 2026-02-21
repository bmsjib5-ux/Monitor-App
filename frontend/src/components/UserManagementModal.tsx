import { useState, useEffect } from 'react';
import { X, UserPlus, Users, Trash2, Edit2, Save, Eye, EyeOff, Building2, Loader2, CheckCircle, XCircle, Briefcase } from 'lucide-react';
import { supabaseApi, HospitalUser } from '../supabaseClient';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UserRole = 'user' | 'company' | 'admin';

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
    role: 'user' as UserRole,
    hospital_code: '',
    hospital_name: '',
    company_name: '',
  });
  const [showPassword, setShowPassword] = useState(false);

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
    if (isOpen) loadUsers();
  }, [isOpen]);

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
      display_name: '',
      role: 'user',
      hospital_code: '',
      hospital_name: '',
      company_name: '',
    });
    setEditingUser(null);
    setShowForm(false);
    setShowPassword(false);
  };

  const handleEdit = (user: HospitalUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      confirmPassword: '',
      display_name: user.display_name || '',
      role: (user.role as UserRole) || 'user',
      hospital_code: user.hospital_code || '',
      hospital_name: user.hospital_name || '',
      company_name: user.company_name || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.username.trim()) { setError('กรุณากรอก Username'); return; }
    if (formData.role === 'user' && !formData.hospital_code.trim()) {
      setError('กรุณากรอกรหัสสถานพยาบาล'); return;
    }
    if (formData.role === 'company' && !formData.company_name.trim()) {
      setError('กรุณากรอกชื่อ Company'); return;
    }
    if (!editingUser && !formData.password) { setError('กรุณากรอกรหัสผ่าน'); return; }
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน'); return;
    }
    if (formData.password && formData.password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const result = await supabaseApi.updateHospitalUser({
          user_id: editingUser.id,
          display_name: formData.display_name || undefined,
          role: formData.role,
          hospital_code: formData.role === 'user' ? formData.hospital_code : undefined,
          hospital_name: formData.role === 'user' ? (formData.hospital_name || undefined) : undefined,
          company_name: formData.role === 'company' ? formData.company_name : undefined,
          new_password: formData.password || undefined,
        });
        if (result.success) { setSuccess('อัพเดทผู้ใช้สำเร็จ'); resetForm(); loadUsers(); }
        else setError(result.message);
      } else {
        const result = await supabaseApi.createHospitalUser({
          username: formData.username,
          password: formData.password,
          display_name: formData.display_name || formData.username,
          role: formData.role,
          hospital_code: formData.role === 'user' ? formData.hospital_code : undefined,
          hospital_name: formData.role === 'user' ? (formData.hospital_name || undefined) : undefined,
          company_name: formData.role === 'company' ? formData.company_name : undefined,
        });
        if (result.success) { setSuccess('สร้างผู้ใช้สำเร็จ'); resetForm(); loadUsers(); }
        else setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: HospitalUser) => {
    if (!confirm(`ยืนยันลบผู้ใช้ "${user.username}" ?`)) return;
    setSaving(true);
    setError(null);
    try {
      const result = await supabaseApi.deleteHospitalUser(user.id);
      if (result.success) { setSuccess('ลบผู้ใช้สำเร็จ'); loadUsers(); }
      else setError(result.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: HospitalUser) => {
    setSaving(true);
    try {
      const result = await supabaseApi.updateHospitalUser({ user_id: user.id, is_active: !user.is_active });
      if (result.success) loadUsers();
      else setError(result.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (role: string) => {
    if (role === 'admin') return { label: 'Admin', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' };
    if (role === 'company') return { label: 'Company', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' };
    return { label: 'Hospital', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">จัดการผู้ใช้</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 transition-colors">
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-2">
              <XCircle className="w-5 h-5 flex-shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />{success}
            </div>
          )}

          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <UserPlus className="w-5 h-5" />เพิ่มผู้ใช้ใหม่
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อที่แสดง</label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="ชื่อผู้ใช้"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    สิทธิ์การใช้งาน <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, hospital_code: '', hospital_name: '', company_name: '' })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="user">Hospital (เห็นเฉพาะโรงพยาบาลตนเอง)</option>
                    <option value="company">Company (เห็นเฉพาะ Company ตนเอง)</option>
                    <option value="admin">Admin (เห็นทั้งหมด)</option>
                  </select>
                </div>

                {/* Conditional: Hospital fields */}
                {formData.role === 'user' && (
                  <>
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อสถานพยาบาล</label>
                      <input
                        type="text"
                        value={formData.hospital_name}
                        onChange={(e) => setFormData({ ...formData, hospital_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="ชื่อโรงพยาบาล"
                      />
                    </div>
                  </>
                )}

                {/* Conditional: Company field */}
                {formData.role === 'company' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.company_name}
                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="ชื่อ Company (ต้องตรงกับข้อมูล process)"
                      />
                    </div>
                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                      ต้องสะกดให้ตรงกับชื่อ Company ที่บันทึกไว้ใน process (เช่น Inter, Rax, Labplus)
                    </p>
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    รหัสผ่าน {!editingUser && <span className="text-red-500">*</span>}
                    {editingUser && <span className="text-gray-500 text-xs"> (เว้นว่างถ้าไม่เปลี่ยน)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="รหัสผ่าน"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ยืนยันรหัสผ่าน</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="ยืนยันรหัสผ่าน"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingUser ? 'บันทึก' : 'สร้างผู้ใช้'}
                </button>
                <button type="button" onClick={resetForm}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg">
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
                <p>ยังไม่มีผู้ใช้</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Username</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">ชื่อ</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">สิทธิ์</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">รหัส รพ. / Company</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">สถานะ</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const rl = roleLabel(user.role);
                    return (
                      <tr key={user.id} className="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{user.username}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{user.display_name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${rl.cls}`}>
                            {user.role === 'company' ? <Briefcase className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                            {rl.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                          {user.role === 'company'
                            ? <span className="text-orange-600 dark:text-orange-400 font-medium">{user.company_name || '-'}</span>
                            : user.role === 'user'
                              ? <span>{user.hospital_code || '-'} {user.hospital_name ? `· ${user.hospital_name}` : ''}</span>
                              : <span className="text-gray-400">-</span>
                          }
                        </td>
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
                            <button onClick={() => handleEdit(user)}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded" title="แก้ไข">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(user)} disabled={saving}
                              className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded" title="ลบ">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            รวม {users.length} ผู้ใช้ | Active: {users.filter(u => u.is_active).length} |
            Hospital: {users.filter(u => u.role === 'user').length} |
            Company: {users.filter(u => u.role === 'company').length} |
            Admin: {users.filter(u => u.role === 'admin').length}
          </p>
        </div>
      </div>
    </div>
  );
}

export default UserManagementModal;
