import { useState, useEffect } from 'react';
import { api } from '../api';
import { ThresholdConfig } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';

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

  const inputClass = "w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alert Thresholds</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {loading ? (
              <div className="text-center text-gray-500 dark:text-gray-400">Loading...</div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CPU Threshold (%)</label>
                  <input type="number" value={thresholds.cpu_threshold} onChange={(e) => handleChange('cpu_threshold', e.target.value)} min="0" max="100" step="0.1" className={inputClass} />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Alert when CPU usage exceeds this percentage</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">RAM Threshold (%)</label>
                  <input type="number" value={thresholds.ram_threshold} onChange={(e) => handleChange('ram_threshold', e.target.value)} min="0" max="100" step="0.1" className={inputClass} />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Alert when RAM usage exceeds this percentage</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Disk I/O Threshold (MB/s)</label>
                  <input type="number" value={thresholds.disk_io_threshold} onChange={(e) => handleChange('disk_io_threshold', e.target.value)} min="0" step="0.1" className={inputClass} />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Alert when total disk I/O exceeds this rate</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Network Threshold (MB/s)</label>
                  <input type="number" value={thresholds.network_threshold} onChange={(e) => handleChange('network_threshold', e.target.value)} min="0" step="0.1" className={inputClass} />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Alert when total network usage exceeds this rate</p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ThresholdModal;
