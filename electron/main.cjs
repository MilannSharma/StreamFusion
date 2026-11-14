const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, screen, safeStorage, nativeImage } = require('electron');
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
// StreamFusion.exe --cli <args>: run saved automated tests headless (same as sf-run.mjs), no window
if (process.argv.includes('--cli')) {
  const { spawn } = require('child_process');
  const script = path.join(__dirname, '../server/cli/sf-run.mjs').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  const args = process.argv.slice(process.argv.indexOf('--cli') + 1);
  const p = spawn(process.execPath, [script, ...args], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  p.on('exit', c => process.exit(c == null ? 1 : c));
  return;
}
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
  // Launching the app again (desktop icon, Start menu) while it sits in the tray must bring the window back
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (app.isReady()) {
      try { createWindow(); } catch (e) {}
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

// The backend we started must stay up: if it dies (crash, killed by an installer or cleaner) start it again.
let ownsServer = false, restartTimes = [];
function scheduleServerRestart(why) {
  if (isQuitting || !ownsServer) return;
  const now = Date.now();
  restartTimes = restartTimes.filter(t => now - t < 60000);
  if (restartTimes.length >= 5) { console.error('[StreamFusion] Server keeps stopping, giving up:', why); return; }
  restartTimes.push(now);
  console.log('[StreamFusion] Restarting server after', why);
  setTimeout(() => { if (!isQuitting && !serverProcess) startBackendIfNeeded().catch(() => {}); }, 800);
}
// Safety net: if nothing answers on our port for ~10 s while we own the server, bring it back.
setInterval(async () => {
  if (isQuitting || !ownsServer || serverProcess) return;
  if (!(await waitForServer(1500))) scheduleServerRestart('no answer on the port');
}, 5000);

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

    ownsServer = true;
    serverProcess = fork(serverScript, [], {
      // a working directory inside app.asar does not exist on disk: spawning there fails silently, so use a real folder
      cwd: app.isPackaged ? (process.resourcesPath || app.getPath('userData')) : path.join(__dirname, '..'),
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
      serverProcess = null;
      scheduleServerRestart('spawn error ' + (err && err.code));
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[StreamFusion] Server exited with code ${code}, signal ${signal}`);
      serverProcess = null;
      scheduleServerRestart(`exit ${code}/${signal}`);
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

  try { mainWindow.setIcon(nativeImage.createFromPath(path.join(__dirname, '../StreamFusion.png'))); } catch (e) {}
  // The UI is built for 100%: Ctrl + / - / 0 / mouse wheel must not zoom it, and any zoom saved earlier is reset.
  const wc = mainWindow.webContents;
  const lockZoom = () => { try { wc.setZoomFactor(1); wc.setVisualZoomLevelLimits(1, 1); } catch (e) {} };
  wc.on('did-finish-load', lockZoom);
  wc.on('zoom-changed', lockZoom);
  wc.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.type === 'keyDown' && ['+', '-', '=', '_', '0', 'Add', 'Subtract'].includes(input.key)) event.preventDefault();
  });

  // A window with no page behind it is just black. If the page process dies (crash, memory, GPU reset), write why
  // to logs/main.log and bring the page back; also check again every time the window is shown from the tray.
  const mainLog = (msg) => { try { fs.mkdirSync(path.join(app.getPath('userData'), 'logs'), { recursive: true }); fs.appendFileSync(path.join(app.getPath('userData'), 'logs', 'main.log'), new Date().toISOString() + ' ' + msg + String.fromCharCode(10)); } catch (e) {} };
  let reloads = [];
  const revive = (why) => {
    mainLog('page needs reload: ' + why);
    const now = Date.now(); reloads = reloads.filter(t => now - t < 60000);
    if (reloads.length >= 4 || !mainWindow || mainWindow.isDestroyed()) return;
    reloads.push(now);
    setTimeout(() => { try { if (mainWindow && !mainWindow.isDestroyed()) wc.loadURL(`http://127.0.0.1:${PORT}`); } catch (e) {} }, 700);
  };
  wc.on('render-process-gone', (event, details) => revive('render-process-gone ' + details.reason + ' code ' + details.exitCode));
  wc.on('unresponsive', () => mainLog('page unresponsive'));
  wc.on('did-fail-load', (event, code, desc, url, isMainFrame) => { if (isMainFrame && code !== -3) revive('did-fail-load ' + code + ' ' + desc); });
  mainWindow.on('show', () => { try { if (wc.isCrashed()) revive('shown with a crashed page'); } catch (e) {} });
  app.on('child-process-gone', (event, details) => mainLog('child process gone: ' + details.type + ' ' + details.reason + ' code ' + details.exitCode));

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
