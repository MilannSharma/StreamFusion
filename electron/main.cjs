const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');
const { initAutoUpdater } = require('./updater.cjs');

let mainWindow = null;
let serverProcess = null;
let logFd = null;
let tray = null;
let isQuitting = false;

const PORT = 3001;
const isDev = !app.isPackaged;

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Setup logging directory and file
function getLogFd() {
  if (logFd !== null) return logFd;
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'server.log');
    logFd = fs.openSync(logPath, 'a');
  } catch (e) {
    logFd = 'ignore';
  }
  return logFd;
}

// Reliable probe using /api/health
function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.setTimeout(1200, () => req.destroy());
      req.on('error', retry);
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        console.warn(`[StreamFusion] Backend waitForServer timed out after ${timeoutMs}ms`);
        resolve(false);
      } else {
        setTimeout(probe, 200);
      }
    };

    probe();
  });
}

// Start backend server child process if needed
async function startBackendIfNeeded() {
  // 1. Check if backend is already responding
  const alreadyUp = await waitForServer(800);
  if (alreadyUp) {
    return true;
  }

  // 2. Fork local server process
  try {
    const serverScript = path.join(__dirname, '../server/index.js');
    const fd = getLogFd();

    serverProcess = fork(serverScript, [], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SF_RESOURCES: process.resourcesPath || '',
        SF_DATA_DIR: app.getPath('userData'),
        SF_PORT: String(PORT)
      },
      stdio: typeof fd === 'number' ? ['ignore', fd, fd, 'ipc'] : 'ignore'
    });

    serverProcess.on('error', (err) => {
      console.error('[StreamFusion] Server process error:', err);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[StreamFusion] Server exited with code ${code}, signal ${signal}`);
      serverProcess = null;
    });

    // 3. Wait until server reports healthy (up to 20s)
    const isReady = await waitForServer(20000);
    return isReady;
  } catch (err) {
    console.error('[StreamFusion] Failed to fork server:', err);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    icon: path.join(__dirname, '../StreamFusion.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Reveal window smoothly once painted to avoid white flashes
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  // Diagnostic logging for load issues
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[StreamFusion] did-fail-load: ${errorCode} - ${errorDescription} on ${validatedURL}`);
  });

  // Window control IPC handlers
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on('open-external', (event, url) => {
    if (url) shell.openExternal(url);
  });

  ipcMain.on('open-path', (event, targetPath) => {
    if (targetPath) shell.openPath(targetPath);
  });

  ipcMain.handle('create-shortcuts', async () => {
    // Shortcuts are natively managed by NSIS installer
    return true;
  });

  ipcMain.handle('show-open-dialog', async (event, options) => {
    return dialog.showOpenDialog(mainWindow, options || {});
  });

  ipcMain.on('show-notification', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({
        title: title || 'StreamFusion',
        body: body || '',
        icon: path.join(__dirname, '../StreamFusion.png')
      }).show();
    }
  });

  // Load URL based on environment
  if (isDev) {
    // Development mode: Probe Vite dev server first
    http.get('http://localhost:5173', () => {
      mainWindow.loadURL('http://localhost:5173');
    }).on('error', () => {
      mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
    });
  } else {
    // Packaged production mode: Load from local Express server
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`).catch(() => {
      // Emergency fallback to local index.html if local server failed to bind
      const prodFile = path.join(__dirname, '../dist/index.html');
      mainWindow.loadFile(prodFile);
    });
  }

  // Phase 1.3: Close to Tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      let closeToTray = true;
      try {
        const settingsFile = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(settingsFile)) {
          const cfg = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
          if (cfg.closeToTray === false) closeToTray = false;
        }
      } catch (e) {}

      if (closeToTray) {
        event.preventDefault();
        mainWindow.hide();
        return;
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  if (tray) return;
  try {
    const iconPath = path.join(__dirname, '../StreamFusion.png');
    tray = new Tray(iconPath);
    tray.setToolTip('StreamFusion v3.1.0');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open StreamFusion',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit StreamFusion',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });
  } catch (e) {
    console.warn('[StreamFusion] Tray creation failed:', e);
  }
}

function cleanExit() {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    } catch (e) {}
  }
}

app.whenReady().then(async () => {
  await startBackendIfNeeded();
  createWindow();
  createTray();

  if (!isDev) {
    try {
      initAutoUpdater(mainWindow);
    } catch (e) {
      console.warn('[StreamFusion] Auto-updater failed to initialize:', e);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  cleanExit();
});

app.on('window-all-closed', () => {
  cleanExit();
  if (process.platform !== 'darwin') app.quit();
});
