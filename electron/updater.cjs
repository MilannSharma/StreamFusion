const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

function initAutoUpdater(mainWindow) {
  const startedAt = Date.now();
  // Configure logging
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', { status: 'checking', message: 'Checking for updates...' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'available',
        version: info.version,
        message: `Update v${info.version} is available! Downloading...`
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', { status: 'not-available', message: 'StreamFusion is up to date!' });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'downloading',
        percent: Math.round(progressObj.percent),
        message: `Downloading update: ${Math.round(progressObj.percent)}%`
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    // Fresh install or first launch with an older installer: take the newest version right away instead of running the old one.
    if (Date.now() - startedAt < 3 * 60 * 1000) {
      setTimeout(() => { try { autoUpdater.quitAndInstall(true, true); } catch (e) {} }, 1500);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'downloaded',
        version: info.version,
        message: `Update v${info.version} downloaded! Restart to install.`
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'error',
        message: `Update check failed: ${err.message}`
      });
    }
  });

  // Renderer IPC triggers
  ipcMain.on('check-for-updates', () => {
    try {
      autoUpdater.checkForUpdates();
    } catch (e) {
      console.warn('[AutoUpdater] checkForUpdates error:', e);
    }
  });

  ipcMain.on('restart-and-install-update', () => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      console.warn('[AutoUpdater] quitAndInstall error:', e);
    }
  });

  // First check right after launch (and a retry shortly after in case the network was not ready yet)
  const first = () => { try { autoUpdater.checkForUpdates(); } catch (e) {} };
  setTimeout(first, 1500);
  setTimeout(first, 45000);

  // Keep checking quietly; downloads happen in the background and install silently when the app is closed.
  setInterval(() => {
    try { autoUpdater.checkForUpdates(); } catch (e) {}
  }, 2 * 60 * 60 * 1000);
}

module.exports = { initAutoUpdater };
