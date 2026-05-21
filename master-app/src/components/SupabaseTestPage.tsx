import { useState } from 'react';
import { Database, CheckCircle, XCircle, RefreshCw, Table, Server, AlertTriangle } from 'lucide-react';

interface TableInfo {
  name: string;
  rowCount: number | null;
  status: 'ok' | 'error' | 'empty';
}

interface ConnectionStatus {
  connected: boolean;
  message: string;
  supabaseUrl: string;
  tables: TableInfo[];
  timestamp: string;
}

interface SupabaseTestPageProps {
  onClose: () => void;
}

const SupabaseTestPage = ({ onClose }: SupabaseTestPageProps) => {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{[key: string]: any}>({});

  const API_URL = 'http://localhost:3001';

  const testConnection = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/api/supabase/test`);
      const data = await response.json();

      if (response.ok) {
        setStatus(data);
      } else {
        setError(data.detail || 'Connection test failed');
      }
    } catch (err: any) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testTableQuery = async (tableName: string) => {
    try {
      const response = await fetch(`${API_URL}/api/supabase/query/${tableName}?limit=5`);
      const data = await response.json();

      setTestResults(prev => ({
        ...prev,
        [tableName]: {
          success: response.ok,
          data: data,
          timestamp: new Date().toLocaleTimeString()
        }
      }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [tableName]: {
          success: false,
          error: err.message,
          timestamp: new Date().toLocaleTimeString()
        }
      }));
    }
  };

  const runMigration = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/supabase/init-tables`, {
        method: 'POST'
      });
      const data = await response.json();

      if (response.ok) {
        alert('Migration completed successfully!');
        testConnection();
      } else {
        setError(data.detail || 'Migration failed');
      }
    } catch (err: any) {
      setError(`Migration error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const insertTestData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/supabase/test-insert`, {
        method: 'POST'
      });
      const data = await response.json();

      if (response.ok) {
        alert(`Test data inserted: ${data.message}`);
        testConnection();
      } else {
        setError(data.detail || 'Insert failed');
      }
    } catch (err: any) {
      setError(`Insert error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-green-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Supabase Connection Test
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ทดสอบการเชื่อมต่อกับ Supabase Database
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={testConnection}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Server className="w-5 h-5" />
              )}
              Test Connection
            </button>

            <button
              onClick={runMigration}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Table className="w-5 h-5" />
              Run Migration
            </button>

            <button
              onClick={insertTestData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Database className="w-5 h-5" />
              Insert Test Data
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="text-red-700 dark:text-red-300 font-medium">Error</span>
              </div>
              <p className="mt-2 text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Connection Status */}
          {status && (
            <div className="space-y-4">
              {/* Status Card */}
              <div className={`rounded-lg p-4 ${
                status.connected
                  ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-3">
                  {status.connected ? (
                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  )}
                  <div>
                    <h3 className={`text-lg font-semibold ${
                      status.connected
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {status.connected ? 'Connected Successfully!' : 'Connection Failed'}
                    </h3>
                    <p className={`text-sm ${
                      status.connected
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {status.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Connection Details */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Connection Details
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Supabase URL:</span>
                    <span className="text-gray-900 dark:text-white font-mono text-xs">
                      {status.supabaseUrl}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Test Time:</span>
                    <span className="text-gray-900 dark:text-white">{status.timestamp}</span>
                  </div>
                </div>
              </div>

              {/* Tables List */}
              {status.tables && status.tables.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                    Database Tables ({status.tables.length})
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-600">
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Table Name</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Row Count</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Status</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {status.tables.map((table) => (
                          <tr key={table.name} className="border-b border-gray-100 dark:border-gray-600">
                            <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">
                              {table.name}
                            </td>
                            <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                              {table.rowCount !== null ? table.rowCount : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {table.status === 'ok' && (
                                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                                  <CheckCircle className="w-4 h-4" /> OK
                                </span>
                              )}
                              {table.status === 'empty' && (
                                <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                                  <AlertTriangle className="w-4 h-4" /> Empty
                                </span>
                              )}
                              {table.status === 'error' && (
                                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                  <XCircle className="w-4 h-4" /> Error
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <button
                                onClick={() => testTableQuery(table.name)}
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
                              >
                                Query →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Query Results */}
              {Object.keys(testResults).length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                    Query Results
                  </h4>
                  <div className="space-y-4">
                    {Object.entries(testResults).map(([tableName, result]: [string, any]) => (
                      <div key={tableName} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-mono text-sm text-gray-900 dark:text-white">
                            {tableName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {result.timestamp}
                          </span>
                        </div>
                        {result.success ? (
                          <pre className="bg-gray-800 text-green-400 p-3 rounded text-xs overflow-x-auto max-h-40">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        ) : (
                          <div className="text-red-500 text-sm">
                            Error: {result.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          {!status && !error && !loading && (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
                📌 วิธีใช้งาน
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-600 dark:text-blue-400">
                <li>คลิก <strong>Test Connection</strong> เพื่อทดสอบการเชื่อมต่อ</li>
                <li>ถ้าเชื่อมต่อสำเร็จ จะแสดงรายการตารางทั้งหมด</li>
                <li>คลิก <strong>Run Migration</strong> เพื่อสร้าง/อัปเดตตาราง</li>
                <li>คลิก <strong>Insert Test Data</strong> เพื่อเพิ่มข้อมูลทดสอบ</li>
                <li>คลิก <strong>Query →</strong> เพื่อดูข้อมูลในแต่ละตาราง</li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupabaseTestPage;
