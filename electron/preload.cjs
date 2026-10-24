const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openPath: (path) => ipcRenderer.send('open-path', path),
  createShortcuts: () => ipcRenderer.invoke('create-shortcuts'),
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {}
    return file.path || '';
  },
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showNotification: (data) => ipcRenderer.send('show-notification', data),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  restartAndInstallUpdate: () => ipcRenderer.send('restart-and-install-update'),
  onUpdaterStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater-status', handler);
    return () => ipcRenderer.removeListener('updater-status', handler);
  }
});
