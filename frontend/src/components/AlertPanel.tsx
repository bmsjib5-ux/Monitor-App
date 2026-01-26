import { X, AlertTriangle, XCircle, CheckCircle, Building2, Server, CheckCheck, Eye } from 'lucide-react';
import { Alert } from '../types';
import { format } from 'date-fns';

interface AlertPanelProps {
  alerts: Alert[];
  onClose: () => void;
  onMarkAsRead?: (alert: Alert) => void;
  onMarkAllAsRead?: () => void;
  isAlertRead?: (alert: Alert) => boolean;
}

const AlertPanel = ({ alerts, onClose, onMarkAsRead, onMarkAllAsRead, isAlertRead }: AlertPanelProps) => {
  const getAlertColor = (type: string, isRead: boolean) => {
    // Dim the color if already read
    const opacity = isRead ? 'opacity-60' : '';

    switch (type.toLowerCase()) {
      case 'cpu':
        return `bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 ${opacity}`;
      case 'ram':
        return `bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 ${opacity}`;
      case 'disk i/o':
        return `bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 ${opacity}`;
      case 'network':
        return `bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ${opacity}`;
      case 'process_stopped':
        return `bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 ${opacity}`;
      case 'process_started':
        return `bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 ${opacity}`;
      default:
        return `bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${opacity}`;
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'process_stopped':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'process_started':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getAlertTitle = (type: string) => {
    switch (type.toLowerCase()) {
      case 'process_stopped':
        return 'โปรแกรมหยุดทำงาน';
      case 'process_started':
        return 'โปรแกรมเริ่มทำงาน';
      default:
        return `${type} Alert`;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'MMM dd, HH:mm:ss');
    } catch {
      return timestamp;
    }
  };

  // Count unread alerts
  const unreadCount = isAlertRead
    ? alerts.filter(alert => !isAlertRead(alert)).length
    : alerts.length;

  const handleAlertClick = (alert: Alert) => {
    if (onMarkAsRead) {
      onMarkAsRead(alert);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              System Alerts
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {unreadCount > 0 ? (
                <>
                  <span className="text-red-500 font-medium">{unreadCount} ยังไม่อ่าน</span>
                  {' '}/ {alerts.length} ทั้งหมด
                </>
              ) : (
                <>{alerts.length} alert{alerts.length !== 1 ? 's' : ''} (อ่านหมดแล้ว)</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onMarkAllAsRead && unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg transition-colors"
                title="ทำเครื่องหมายว่าอ่านทั้งหมด"
              >
                <CheckCheck className="w-4 h-4" />
                อ่านทั้งหมด
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {alerts.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No alerts to display</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...alerts].reverse().map((alert, index) => {
                const isRead = isAlertRead ? isAlertRead(alert) : false;
                return (
                  <div
                    key={`${alert.timestamp}-${index}`}
                    className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${getAlertColor(alert.alert_type, isRead)}`}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getAlertIcon(alert.alert_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <h4 className={`text-sm font-semibold ${isRead ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                              {getAlertTitle(alert.alert_type)} - {alert.process_name}
                            </h4>
                            {!isRead && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-500 text-white">
                                NEW
                              </span>
                            )}
                            {isRead && (
                              <span title="อ่านแล้ว">
                                <Eye className="w-4 h-4 text-gray-400" />
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTimestamp(alert.timestamp)}
                          </span>
                        </div>

                        {/* Hospital Info */}
                        {(alert.hospital_code || alert.hospital_name) && (
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-4 h-4 text-purple-500" />
                            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                              {alert.hospital_code && `[${alert.hospital_code}]`} {alert.hospital_name || ''}
                            </span>
                            {alert.hostname && (
                              <>
                                <Server className="w-3 h-3 text-gray-400 ml-2" />
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {alert.hostname}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        <p className={`text-sm ${isRead ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {alert.message}
                        </p>

                        {/* Show value and threshold for metric alerts */}
                        {!['process_stopped', 'process_started'].includes(alert.alert_type.toLowerCase()) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                              ค่าปัจจุบัน: {alert.value?.toFixed(2) || '0'}
                            </span>
                            {alert.threshold !== undefined && alert.threshold > 0 && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200">
                                เกณฑ์: {alert.threshold.toFixed(2)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-400">
            คลิกที่การแจ้งเตือนเพื่อทำเครื่องหมายว่าอ่านแล้ว
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertPanel;
