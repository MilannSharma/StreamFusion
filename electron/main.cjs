const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;
let logFd = null;

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
    backgroundColor: '#ffffff',
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', cleanExit);

app.on('window-all-closed', () => {
  cleanExit();
  if (process.platform !== 'darwin') app.quit();
});
