/**
 * Local Storage Utility for Process Metadata
 * Stores process metadata locally on each PC for persistence
 */

const STORAGE_KEY = 'monitorapp_process_metadata';

export interface ProcessMetadataLocal {
  processName: string;
  hospitalCode?: string;
  hospitalName?: string;
  programPath?: string;
  updatedAt: string;
}

/**
 * Get all stored process metadata from local storage
 */
export const getStoredMetadata = (): Record<string, ProcessMetadataLocal> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return {};
  }
};

/**
 * Get metadata for a specific process
 */
export const getProcessMetadata = (processName: string): ProcessMetadataLocal | null => {
  const allMetadata = getStoredMetadata();
  return allMetadata[processName] || null;
};

/**
 * Save process metadata to local storage
 */
export const saveProcessMetadata = (
  processName: string,
  hospitalCode?: string,
  hospitalName?: string,
  programPath?: string
): void => {
  try {
    const allMetadata = getStoredMetadata();

    allMetadata[processName] = {
      processName,
      hospitalCode,
      hospitalName,
      programPath,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(allMetadata));
    console.log(`Saved metadata for ${processName} to localStorage`);
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

/**
 * Remove process metadata from local storage
 */
export const removeProcessMetadata = (processName: string): void => {
  try {
    const allMetadata = getStoredMetadata();
    delete allMetadata[processName];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allMetadata));
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
};

/**
 * Clear all stored metadata
 */
export const clearAllMetadata = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
};

// ==================== Alert Settings Storage ====================

import { AlertSettings } from '../types';

const ALERT_SETTINGS_KEY = 'monitorapp_alert_settings';

/**
 * Default alert settings
 */
export const defaultAlertSettings: AlertSettings = {
  cpuAlertEnabled: true,
  ramAlertEnabled: true,
  diskIoAlertEnabled: true,
  networkAlertEnabled: true,
  processStoppedAlertEnabled: true,
  cpuThreshold: 80,
  ramThreshold: 80,
  diskIoThreshold: 100,
  networkThreshold: 50,
  processStoppedMinutes: 5,
  processStoppedSeconds: 0,
};

/**
 * Get alert settings from local storage
 */
export const getAlertSettings = (): AlertSettings => {
  try {
    const stored = localStorage.getItem(ALERT_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to ensure all fields exist
      return { ...defaultAlertSettings, ...parsed };
    }
    return defaultAlertSettings;
  } catch (error) {
    console.error('Error reading alert settings from localStorage:', error);
    return defaultAlertSettings;
  }
};

/**
 * Save alert settings to local storage
 */
export const saveAlertSettings = (settings: AlertSettings): void => {
  try {
    localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(settings));
    console.log('Saved alert settings to localStorage');
  } catch (error) {
    console.error('Error saving alert settings to localStorage:', error);
  }
};

/**
 * Reset alert settings to default
 */
export const resetAlertSettings = (): void => {
  try {
    localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(defaultAlertSettings));
    console.log('Reset alert settings to default');
  } catch (error) {
    console.error('Error resetting alert settings:', error);
  }
};
