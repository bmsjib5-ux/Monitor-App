import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { ThresholdConfig } from '../types';

interface ThresholdModalProps {
  onClose: () => void;
  onSave: (thresholds: ThresholdConfig) => void;
}

const ThresholdModal = ({ onClose, onSave }: ThresholdModalProps) => {
  const [thresholds, setThresholds] = useState<ThresholdConfig>({
    cpu_threshold: 80,
    ram_threshold: 80,
    disk_io_threshold: 100,
    network_threshold: 50,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentThresholds();
  }, []);

  const loadCurrentThresholds = async () => {
    try {
      const currentThresholds = await api.getThresholds();
      setThresholds({
        cpu_threshold: currentThresholds.cpu_threshold || 80,
        ram_threshold: currentThresholds.ram_threshold || 80,
        disk_io_threshold: currentThresholds.disk_io_threshold || 100,
        network_threshold: currentThresholds.network_threshold || 50,
      });
    } catch (error) {
      console.error('Error loading thresholds:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(thresholds);
  };

  const handleChange = (field: keyof ThresholdConfig, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setThresholds((prev) => ({ ...prev, [field]: numValue }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Alert Thresholds
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {loading ? (
              <div className="text-center text-gray-500 dark:text-gray-400">
                Loading...
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    CPU Threshold (%)
                  </label>
                  <input
                    type="number"
                    value={thresholds.cpu_threshold}
                    onChange={(e) => handleChange('cpu_threshold', e.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Alert when CPU usage exceeds this percentage
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    RAM Threshold (%)
                  </label>
                  <input
                    type="number"
                    value={thresholds.ram_threshold}
                    onChange={(e) => handleChange('ram_threshold', e.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Alert when RAM usage exceeds this percentage
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Disk I/O Threshold (MB/s)
                  </label>
                  <input
                    type="number"
                    value={thresholds.disk_io_threshold}
                    onChange={(e) => handleChange('disk_io_threshold', e.target.value)}
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Alert when total disk I/O exceeds this rate
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Network Threshold (MB/s)
                  </label>
                  <input
                    type="number"
                    value={thresholds.network_threshold}
                    onChange={(e) => handleChange('network_threshold', e.target.value)}
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Alert when total network usage exceeds this rate
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ThresholdModal;
