import React from 'react';
import { BMSConnectionStatus, BMSGatewayRunStatus } from '../types';

// Accept both connection status and gateway run status
type StatusType = BMSConnectionStatus | BMSGatewayRunStatus;

interface BMSStatusIndicatorProps {
  status: StatusType;
  label?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tooltip?: string;
}

/**
 * BMS Status Indicator Component
 * Shows a colored circle indicating connection status:
 * - Green: Connected / Running
 * - Red: Disconnected / Stopped
 * - Gray: Unknown
 */
const BMSStatusIndicator: React.FC<BMSStatusIndicatorProps> = ({
  status,
  label,
  showLabel = false,
  size = 'md',
  tooltip,
}) => {
  // Size classes
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  // Normalize status: map 'running' to 'connected', 'stopped' to 'disconnected'
  const normalizeStatus = (s: StatusType): 'connected' | 'disconnected' | 'unknown' => {
    if (s === 'running' || s === 'connected') return 'connected';
    if (s === 'stopped' || s === 'disconnected') return 'disconnected';
    return 'unknown';
  };

  const normalizedStatus = normalizeStatus(status);

  // Status colors
  const statusColors = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    unknown: 'bg-gray-400',
  };

  // Status labels (Thai) - use original status for display
  const statusLabels: Record<StatusType, string> = {
    connected: 'เชื่อมต่อ',
    disconnected: 'ไม่เชื่อมต่อ',
    running: 'ทำงาน',
    stopped: 'หยุด',
    unknown: 'ไม่ทราบ',
  };

  const colorClass = statusColors[normalizedStatus];
  const statusLabel = statusLabels[status] || statusLabels.unknown;
  const displayTooltip = tooltip || `${label || 'Status'}: ${statusLabel}`;

  return (
    <div
      className="flex items-center gap-1.5"
      title={displayTooltip}
    >
      <span
        className={`${sizeClasses[size]} ${colorClass} rounded-full inline-block`}
        aria-label={statusLabel}
      />
      {showLabel && label && (
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {label}
        </span>
      )}
    </div>
  );
};

export default BMSStatusIndicator;
