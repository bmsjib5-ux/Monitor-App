import { useState, useEffect } from 'react';
import { X, Send, CheckCircle, XCircle, ExternalLink, Plus, Trash2, Users, RefreshCw, Copy, Link, UsersRound } from 'lucide-react';

interface LineSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LineStatus {
  configured: boolean;
  enabled: boolean;
  hasToken: boolean;
  hasChannelSecret?: boolean;
  maskedToken?: string;
  maskedSecret?: string;
  userCount: number;
  groupCount: number;
  channelName?: string;
  webhookUrl?: string;
}

export default function LineSettingsModal({ isOpen, onClose }: LineSettingsModalProps) {
  const [token, setToken] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<LineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [newGroupId, setNewGroupId] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; channelName: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      loadUserIds();
      loadGroupIds();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    // Load from localStorage as fallback
    const savedWebhookUrl = localStorage.getItem('line_webhook_url');
    if (savedWebhookUrl) {
      setWebhookUrl(savedWebhookUrl);
    }

    try {
      const response = await fetch('http://localhost:3001/api/line-oa/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setEnabled(data.enabled);
        if (data.webhookUrl) {
          setWebhookUrl(data.webhookUrl);
          // Save to localStorage as backup
          localStorage.setItem('line_webhook_url', data.webhookUrl);
        }
      }
    } catch (error) {
      console.error('Error loading LINE OA status:', error);
    }
  };

  const loadUserIds = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/line-oa/users');
      if (response.ok) {
        const data = await response.json();
        // Extract user IDs from users array
        const ids = (data.users || []).map((u: { id: string }) => u.id);
        setUserIds(ids);
      }
    } catch (error) {
      console.error('Error loading user IDs:', error);
    }
  };

  const loadGroupIds = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/line-oa/groups');
      if (response.ok) {
        const data = await response.json();
        // Extract group IDs from groups array
        const ids = (data.groups || []).map((g: { id: string }) => g.id);
        setGroupIds(ids);
      }
    } catch (error) {
      console.error('Error loading group IDs:', error);
    }
  };

  const handleTestConnection = async () => {
    if (!token.trim()) {
      setTestResult({ success: false, message: 'กรุณากรอก Channel Access Token' });
      return;
    }

    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      const response = await fetch(`http://localhost:3001/api/line-oa/test-token?token=${encodeURIComponent(token)}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        setConnectionStatus({ success: true, channelName: result.channelName || 'LINE OA' });
      } else {
        setConnectionStatus({ success: false, channelName: '' });
        setTestResult({ success: false, message: result.message || 'ไม่สามารถเชื่อมต่อกับ LINE ได้' });
      }
    } catch (error) {
      setConnectionStatus({ success: false, channelName: '' });
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    // Only require token if no token is saved yet
    if (!token.trim() && !status?.hasToken) {
      setTestResult({ success: false, message: 'กรุณากรอก Channel Access Token' });
      return;
    }

    // If no new token and no new secret, nothing to update
    if (!token.trim() && !channelSecret.trim()) {
      setTestResult({ success: false, message: 'กรุณากรอก Token หรือ Secret ใหม่เพื่อบันทึก' });
      return;
    }

    setSaving(true);
    setTestResult(null);

    try {
      const params = new URLSearchParams();
      if (token.trim()) {
        params.append('token', token);
      }
      params.append('enabled', String(enabled));
      if (channelSecret.trim()) {
        params.append('channel_secret', channelSecret);
      }

      const response = await fetch(`http://localhost:3001/api/line-oa/configure?${params.toString()}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        // Also save webhook URL if present
        if (webhookUrl.trim()) {
          await handleSaveWebhookUrl();
        }
        setTestResult({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
        loadStatus();
        setToken(''); // Clear token from UI for security
        setChannelSecret('');
      } else {
        setTestResult({ success: false, message: result.message || 'เกิดข้อผิดพลาด' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWebhookUrl = async () => {
    if (!webhookUrl.trim()) {
      return;
    }

    // Save to localStorage
    localStorage.setItem('line_webhook_url', webhookUrl.trim());

    try {
      const response = await fetch(`http://localhost:3001/api/line-oa/webhook-url?webhook_url=${encodeURIComponent(webhookUrl.trim())}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        setTestResult({ success: true, message: 'บันทึก Webhook URL สำเร็จ' });
      }
    } catch (error) {
      console.error('Error saving webhook URL:', error);
      // Still show success since we saved to localStorage
      setTestResult({ success: true, message: 'บันทึก Webhook URL ไว้ที่เครื่องแล้ว' });
    }
  };

  const handleAddUser = async () => {
    if (!newUserId.trim()) {
      setTestResult({ success: false, message: 'กรุณากรอก User ID' });
      return;
    }

    setAddingUser(true);
    setTestResult(null);

    try {
      const response = await fetch(`http://localhost:3001/api/line-oa/add-user?user_id=${encodeURIComponent(newUserId.trim())}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        setTestResult({ success: true, message: 'เพิ่ม User ID สำเร็จ' });
        setNewUserId('');
        loadUserIds();
        loadStatus();
      } else {
        setTestResult({ success: false, message: result.message || 'เกิดข้อผิดพลาด' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/line-oa/remove-user?user_id=${encodeURIComponent(userId)}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        setTestResult({ success: true, message: 'ลบ User ID สำเร็จ' });
        loadUserIds();
        loadStatus();
      } else {
        setTestResult({ success: false, message: result.message || 'เกิดข้อผิดพลาด' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
    }
  };

  const handleAddGroup = async () => {
    if (!newGroupId.trim()) {
      setTestResult({ success: false, message: 'กรุณากรอก Group ID' });
      return;
    }

    setAddingGroup(true);
    setTestResult(null);

    try {
      const response = await fetch(`http://localhost:3001/api/line-oa/add-group?group_id=${encodeURIComponent(newGroupId.trim())}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        setTestResult({ success: true, message: 'เพิ่ม Group ID สำเร็จ' });
        setNewGroupId('');
        loadGroupIds();
        loadStatus();
      } else {
        setTestResult({ success: false, message: result.message || 'เกิดข้อผิดพลาด' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
    } finally {
      setAddingGroup(false);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/line-oa/remove-group?group_id=${encodeURIComponent(groupId)}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        setTestResult({ success: true, message: 'ลบ Group ID สำเร็จ' });
        loadGroupIds();
        loadStatus();
      } else {
        setTestResult({ success: false, message: result.message || 'เกิดข้อผิดพลาด' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
    }
  };

  const handleTest = async () => {
    setLoading(true);
    setTestResult(null);

    try {
      const response = await fetch('http://localhost:3001/api/line-oa/test', {
        method: 'POST'
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);

    try {
      await fetch(`http://localhost:3001/api/line-oa/toggle?enabled=${newEnabled}`, {
        method: 'POST'
      });
      loadStatus();
    } catch (error) {
      console.error('Error toggling LINE OA:', error);
      setEnabled(!newEnabled); // Revert on error
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.349 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              ตั้งค่า LINE Official Account
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Connection Status Section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              สถานะการเชื่อมต่อ
            </label>
            <div className="flex items-center gap-2">
              {connectionStatus?.success || (status?.configured && status?.enabled) ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-green-700 dark:text-green-400 text-sm font-medium">
                    เชื่อมต่อสำเร็จ {connectionStatus?.channelName ? `(${connectionStatus.channelName})` : status?.channelName ? `(${status.channelName})` : ''}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                  <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">
                    ยังไม่ได้เชื่อมต่อ
                  </span>
                </div>
              )}
              <button
                onClick={handleTestConnection}
                disabled={testingConnection || !token.trim()}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors disabled:opacity-50"
                title="ทดสอบการเชื่อมต่อ"
              >
                <RefreshCw className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Channel Access Token input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Channel Access Token
              </label>
              {status?.hasToken && status?.maskedToken && !token && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  บันทึกแล้ว: {status.maskedToken}
                </span>
              )}
            </div>
            <input
              type="text"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setConnectionStatus(null);
              }}
              placeholder={status?.hasToken ? 'กรอก Token ใหม่เพื่อเปลี่ยน (หรือปล่อยว่างเพื่อใช้ค่าเดิม)' : 'กรอก Channel Access Token'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          {/* Channel Secret input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Channel Secret
              </label>
              {status?.hasChannelSecret && status?.maskedSecret && !channelSecret && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  บันทึกแล้ว: {status.maskedSecret}
                </span>
              )}
            </div>
            <input
              type="text"
              value={channelSecret}
              onChange={(e) => setChannelSecret(e.target.value)}
              placeholder={status?.hasChannelSecret ? 'กรอกค่าใหม่เพื่อเปลี่ยน (หรือปล่อยว่างเพื่อใช้ค่าเดิม)' : 'กรอก Channel Secret (ถ้ามี)'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          {/* Webhook URL Section */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <Link className="w-4 h-4" />
                  <span>Webhook URL</span>
                </div>
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="http://your-server:3001/api/line-oa/webhook"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                disabled={!webhookUrl}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                title="คัดลอก"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={handleSaveWebhookUrl}
                disabled={!webhookUrl.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                title="บันทึก"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              นำ URL นี้ไปตั้งค่าใน LINE Developers Console → Messaging API → Webhook URL
            </p>
          </div>

          {/* Enable/Disable toggle */}
          {status?.hasToken && (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300">เปิดการแจ้งเตือนผ่าน LINE</span>
              <button
                onClick={handleToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* User ID Management */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>User IDs ({userIds.length} คน)</span>
              </div>
            </label>

            {/* Add new user */}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="กรอก User ID (เช่น Uxxxxxxxxxx)"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <button
                onClick={handleAddUser}
                disabled={addingUser || !newUserId.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                {addingUser ? '...' : 'เพิ่ม'}
              </button>
            </div>

            {/* User list */}
            {userIds.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                {userIds.map((userId, index) => (
                  <div key={index} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate">
                      {userId.length > 20 ? `${userId.slice(0, 10)}...${userId.slice(-6)}` : userId}
                    </span>
                    <button
                      onClick={() => handleRemoveUser(userId)}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="ลบ User ID"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {userIds.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                ยังไม่มี User ID - เพิ่ม User ID เพื่อรับการแจ้งเตือน
              </p>
            )}
          </div>

          {/* Group ID Management */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <div className="flex items-center gap-2">
                <UsersRound className="w-4 h-4" />
                <span>Group IDs ({groupIds.length} กลุ่ม)</span>
              </div>
            </label>

            {/* Add new group */}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                placeholder="กรอก Group ID (เช่น Cxxxxxxxxxx)"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <button
                onClick={handleAddGroup}
                disabled={addingGroup || !newGroupId.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                {addingGroup ? '...' : 'เพิ่ม'}
              </button>
            </div>

            {/* Group list */}
            {groupIds.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                {groupIds.map((groupId, index) => (
                  <div key={index} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate">
                      {groupId.length > 20 ? `${groupId.slice(0, 10)}...${groupId.slice(-6)}` : groupId}
                    </span>
                    <button
                      onClick={() => handleRemoveGroup(groupId)}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="ลบ Group ID"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {groupIds.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                ยังไม่มี Group ID - เชิญ Bot เข้ากลุ่มเพื่อรับการแจ้งเตือน
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              * เชิญ Bot เข้ากลุ่ม LINE แล้วส่งข้อความในกลุ่ม Group ID จะถูกเพิ่มอัตโนมัติผ่าน Webhook
            </p>
          </div>

          {/* How to get token */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">วิธีตั้งค่า LINE Official Account:</h4>
            <ol className="text-xs text-blue-600 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>ไปที่ <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">LINE Developers Console <ExternalLink className="w-3 h-3" /></a></li>
              <li>สร้าง Provider และ Channel (Messaging API)</li>
              <li>คัดลอก Channel Access Token มาวางที่นี่</li>
              <li>เปิด Webhook URL ใน Channel settings</li>
              <li>เพิ่มเพื่อน Bot แล้วคัดลอก User ID มาเพิ่ม</li>
            </ol>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">
              * User ID ดูได้จาก Webhook event เมื่อผู้ใช้ส่งข้อความหา Bot
            </p>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                <span>{testResult.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          {/* Test message button */}
          <button
            onClick={handleTest}
            disabled={loading || !status?.hasToken || (userIds.length === 0 && groupIds.length === 0)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-green-600 dark:text-green-400 border border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {loading ? 'กำลังทดสอบ...' : 'ทดสอบส่งข้อความ'}
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || (!token.trim() && !channelSecret.trim())}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
        </div>
      </div>
    </div>
  );
}
