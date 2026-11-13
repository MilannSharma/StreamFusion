const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, screen, safeStorage } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');
const { initAutoUpdater } = require('./updater.cjs');

let mainWindow = null;
let mirrorToolbarWindow = null;
let serverProcess = null;
let logFd = null;
let tray = null;
let isQuitting = false;
const startHidden = process.argv.includes('--hidden'); // started by Windows at login: tray only, no window

const PORT = 3001;
const isDev = !app.isPackaged;

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[StreamFusion] Another StreamFusion instance is already running (installed app?). Close it, or run: npm run dev:force');
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

  // The UI is built for 100%: Ctrl + / - / 0 / mouse wheel must not zoom it, and any zoom saved earlier is reset.
  const wc = mainWindow.webContents;
  const lockZoom = () => { try { wc.setZoomFactor(1); wc.setVisualZoomLevelLimits(1, 1); } catch (e) {} };
  wc.on('did-finish-load', lockZoom);
  wc.on('zoom-changed', lockZoom);
  wc.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.type === 'keyDown' && ['+', '-', '=', '_', '0', 'Add', 'Subtract'].includes(input.key)) event.preventDefault();
  });

  // Reveal window smoothly once painted to avoid white flashes
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !startHidden) mainWindow.show();
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

  // Encrypted secrets (API keys) via the OS keychain-backed safeStorage
  const secretsFile = () => path.join(app.getPath('userData'), 'secrets.json');
  const readSecrets = () => { try { return JSON.parse(fs.readFileSync(secretsFile(), 'utf8')); } catch (e) { return {}; } };
  ipcMain.handle('secrets:set', (event, key, value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage unavailable');
    const all = readSecrets();
    if (value) all[key] = safeStorage.encryptString(String(value)).toString('base64'); else delete all[key];
    fs.writeFileSync(secretsFile(), JSON.stringify(all));
    return true;
  });
  ipcMain.handle('secrets:get', (event, key) => {
    const v = readSecrets()[key];
    if (!v || !safeStorage.isEncryptionAvailable()) return '';
    try { return safeStorage.decryptString(Buffer.from(v, 'base64')); } catch (e) { return ''; }
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

  // Start with Windows (hidden in the tray), so phone notifications keep arriving without opening the app
  ipcMain.handle('autostart:get', () => { try { return app.getLoginItemSettings().openAtLogin; } catch (e) { return false; } });
  ipcMain.handle('autostart:set', (event, on) => { try { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); return true; } catch (e) { return false; } });

  // Attached Floating Navigation Toolbar IPC
  ipcMain.on('open-mirror-toolbar', (event, data) => {
    openMirrorToolbar(data || {});
  });

  ipcMain.on('close-mirror-toolbar', () => {
    closeMirrorToolbar();
  });

  ipcMain.on('resize-toolbar', (event, { width, height }) => {
    if (mirrorToolbarWindow) {
      mirrorToolbarWindow.setSize(width, height);
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
    tray.setToolTip('StreamFusion v' + app.getVersion());

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

function openMirrorToolbar({ serial = '', title = '', orientation = 'horizontal' }) {
  if (mirrorToolbarWindow) {
    mirrorToolbarWindow.show();
    mirrorToolbarWindow.focus();
    return;
  }

  const width = orientation === 'vertical' ? 68 : 460;
  const height = orientation === 'vertical' ? 460 : 68;

  let x = 100;
  let y = 100;
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    x = Math.round((screenWidth - width) / 2);
    y = screenHeight - height - 20;
  } catch (e) {}

  mirrorToolbarWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const dockUrl = `http://127.0.0.1:${PORT}/nav-dock.html?serial=${encodeURIComponent(serial)}&orientation=${orientation}`;
  mirrorToolbarWindow.loadURL(dockUrl).catch(() => {});

  mirrorToolbarWindow.on('closed', () => {
    mirrorToolbarWindow = null;
  });
}

function closeMirrorToolbar() {
  if (mirrorToolbarWindow) {
    try {
      mirrorToolbarWindow.close();
    } catch (e) {}
    mirrorToolbarWindow = null;
  }
}

function cleanExit() {
  closeMirrorToolbar();
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    } catch (e) {}
  }
}

// Phone notifications -> native Windows notifications. This runs in the main process, which keeps running while the window
// is hidden in the tray (the page's own timers are throttled or paused then). The server does the watching (adb) and keeps a queue.
function startNotificationBridge() {
  let last = null;
  const poll = () => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/notifications/queue?after=' + (last || 0), timeout: 2500 }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (last === null || j.lastSeq < last) { last = j.lastSeq; return; } // first call, or the server restarted: only new ones from now on
          for (const n of j.items || []) {
            last = Math.max(last, n.seq);
            if (!Notification.isSupported()) continue;
            const note = new Notification({ title: n.title || n.app, subtitle: n.app, body: n.text || '', icon: path.join(__dirname, '../StreamFusion.png') });
            note.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
            note.show();
          }
        } catch (e) {}
      });
    });
    req.on('error', () => {}); req.on('timeout', () => req.destroy());
  };
  setInterval(poll, 3000);
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.milannsharma.streamfusion'); // lets Windows show our toasts under the app's name
  await startBackendIfNeeded();
  createWindow();
  createTray();
  startNotificationBridge();

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

// Powering the emulator off cleanly writes its quick-boot snapshot; killing the app mid-run would lose it.
function stopEmulatorGracefully() {
  const http = require('http');
  const call = (method, p, timeout) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, timeout }, (res) => {
      let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => resolve(body));
    });
    req.on('error', () => resolve('')); req.on('timeout', () => { req.destroy(); resolve(''); });
    req.end();
  });
  return call('GET', '/api/emulator/status', 1500).then((b) => {
    if (!/"isRunning":true/.test(b)) return;
    return call('POST', '/api/emulator/stop', 60000);
  });
}

let quitReady = false;
app.on('before-quit', (e) => {
  isQuitting = true;
  if (quitReady || !serverProcess) { cleanExit(); return; }
  e.preventDefault();
  quitReady = true;
  stopEmulatorGracefully().catch(() => {}).finally(() => { cleanExit(); app.quit(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
