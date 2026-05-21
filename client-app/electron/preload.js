const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Backend control
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),

  // App info
  isElectron: true,
  platform: process.platform,

  // Event listeners
  onBackendStatusChange: (callback) => {
    ipcRenderer.on('backend-status-change', (_event, status) => callback(status));
  }
});
