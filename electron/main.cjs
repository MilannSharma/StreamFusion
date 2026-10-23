const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;

// Start backend server if not already running
function startBackendIfNeeded() {
  return new Promise((resolve) => {
    http.get('http://localhost:3001/api/devices', (res) => {
      // Already running
      resolve(true);
    }).on('error', () => {
      try {
        const serverScript = path.join(__dirname, '../server/index.js');
        // Use Electron's built-in node via fork
        serverProcess = fork(serverScript, [], {
          cwd: path.join(__dirname, '..'),
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: 'ignore'
        });
        setTimeout(resolve, 1000);
      } catch (err) {
        resolve(false);
      }
    });
  });
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

  // Load URL with intelligent fallback: Dev (5173) -> Server (3001) -> Prod file
  const tryLoad = () => {
    // 1. Try Vite dev server first
    http.get('http://localhost:5173', () => {
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.show();
    }).on('error', () => {
      // 2. Try Express server on 3001
      http.get('http://localhost:3001', () => {
        mainWindow.loadURL('http://localhost:3001');
        mainWindow.show();
      }).on('error', () => {
        // 3. Fallback to direct built file
        const prodFile = path.join(__dirname, '../dist/index.html');
        mainWindow.loadFile(prodFile);
        mainWindow.show();
      });
    });
  };

  tryLoad();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startBackendIfNeeded();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});
