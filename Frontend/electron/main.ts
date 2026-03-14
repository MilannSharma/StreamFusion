import { app, BrowserWindow, shell, ipcMain, clipboard, Tray, Menu, nativeImage, Notification, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDevices, getDeviceInfo, disconnectDevice, startDevicePolling, executeAdb } from './adb/AdbController.js';
import { startPairingMode, manualConnect, stopAll } from './adb/WifiManager.js';
import { pairDevice } from './adb/PairingManager.js';
import { scrcpyManager } from './mirror/ScrcpyManager.js';
import { fileTransfer } from './transfer/FileTransfer.js';
import { fileExplorer } from './transfer/FileExplorer.js';
import { fileManager } from './files/FileManager.js'; 
import { clipboardBridge } from './clipboard/ClipboardBridge.js';
import ElectronStore from 'electron-store';

const appStore = new ElectronStore() as any;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let devicePollingTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development';

// Robust __dirname for ESM on Windows
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[DEBUG] __filename:', __filename);
console.log('[DEBUG] __dirname:', __dirname);

function electronPath(...segments: string[]): string {
  const p = path.join(__dirname, ...segments);
  console.log('[DEBUG] electronPath resolved:', p);
  return p;
}

function resourcePath(resourceName: string): string {
  let p: string;
  if (isDev) {
    // Both adb and scrcpy are in the same folder in Tools
    p = path.resolve(__dirname, '../../../Backend/Tools/scrcpy-win64-v3.3.3');
  } else {
    // In production, they are in process.resourcesPath/scrcpy
    p = path.join(process.resourcesPath, 'scrcpy');
  }
  console.log(`[DEBUG] resourcePath for ${resourceName}:`, p);
  return p;
}

export const SCRCPY_PATH = path.join(resourcePath('scrcpy'), 'scrcpy.exe');
export const ADB_PATH    = path.join(resourcePath('scrcpy'), 'adb.exe');
export const IOS_BIN_PATH = isDev 
  ? path.resolve(__dirname, '../../../Backend/Tools/libimobiledevice-win64')
  : path.join(process.resourcesPath, 'ios-tools');

// ─────────────────────────────────────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────────────────────────────────────

function createWindow(): void {
  const iconPath = isDev
    ? electronPath('../assets/icon.png')
    : path.join(process.resourcesPath, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    title: 'StremFusion',
    backgroundColor: '#0f172a',
    icon: iconPath,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: electronPath('preload.js'),
    },
    frame: true,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
    return true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (devicePollingTimer) {
      clearInterval(devicePollingTimer);
      devicePollingTimer = null;
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAACXBIWXMAAAsTAAALEwEAmpwYAAABWWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPiA8cmRmOlJERiB4bWxuczp4PTJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMyMDE3ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpFQzZDMEY1NkJFMTYxMUU3QTBBREI2MEU0ODg3RDU3MCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpFQzZDMEY1NUJFMTYxMUU3QTBBREI2MEU0ODg3RDU3MCIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ0MgKGlvcykiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpFQzZDMEY1M0JFMTYxMUU3QTBBREI2MEU0ODg3RDU3MCIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpFQzZDMEY1NEJFMTYxMUU3QTBBREI2MEU0ODg3RDU3MCIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PuHe67MAAAAsSURBVDhPY/xy6f5/BiIBYwEVMSMDI3SAsZAYC7CBIYBYQCwglkAsIJaYIAIA8X0fNUKiV20AAAAASUVORK5CYII=');
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open StremFusion', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Start Mirror', enabled: false, click: () => { } },
    { label: 'Stop Mirror', click: () => scrcpyManager.stopMirror() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
        isQuitting = true;
        app.quit();
    } }
  ]);

  tray.setToolTip('StremFusion v2.0');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow?.show(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────────────────

import { recordingManager } from './recording/RecordingManager.js';
import * as WifiConnect from './adb/WifiConnect.js';
import { obsManager } from './obs/ObsManager.js';
import { iosManager } from './ios/IosManager.js';

function registerIpcHandlers() {
  ipcMain.on('open-external', (_event: any, url: string) => { shell.openExternal(url); });

  ipcMain.handle('app:get-paths', () => ({
    scrcpy: SCRCPY_PATH,
    adb: ADB_PATH,
    userData: app.getPath('userData'),
  }));

  ipcMain.handle('adb:get-devices', async () => { return await getDevices(); });
  ipcMain.handle('adb:device-info', async (_event: IpcMainInvokeEvent, id: string) => { return await getDeviceInfo(id); });
  ipcMain.handle('adb:disconnect', async (_event: IpcMainInvokeEvent, id: string) => { await disconnectDevice(id); });

  // WiFi
  ipcMain.handle('wifi:start-pairing', async () => {
    startPairingMode(
      (code) => { mainWindow?.webContents.send('wifi:pairing-code', code); },
      (success) => {
        if (success) {
          mainWindow?.webContents.send('log:entry', {
            id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'success', message: 'Successfully paired with device over Wi-Fi.',
          });
        }
      },
      (error) => {
        mainWindow?.webContents.send('log:entry', {
          id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'error', message: `Wi-Fi pairing failed: ${error}`,
        });
      }
    );
  });

  ipcMain.handle('wifi:connect', async (_event: IpcMainInvokeEvent, { ip, port }: { ip: string; port?: number }) => { 
    if (port) return await manualConnect(ip, port);
    return await WifiConnect.connectWifi(ip);
  });
  ipcMain.handle('wifi:stop', async () => { stopAll(); });
  ipcMain.handle('wifi:submit-pin', async (_event: IpcMainInvokeEvent, { ip, port, code }: { ip: string; port: number; code: string }) => { return await pairDevice(ip, port, code); });
  ipcMain.handle('wifi:enable-tcp', async (_, { deviceId }) => WifiConnect.enableTcpMode(deviceId));
  ipcMain.handle('wifi:start-mirror', async (_, { ip, settings }) => {
    return await WifiConnect.startWifiMirror(ip, settings, (line) => {
      mainWindow?.webContents.send('log:entry', {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        level: 'info',
        message: line,
      });
    });
  });
  ipcMain.handle('wifi:stop-mirror', async () => await WifiConnect.stopWifiMirror());

  // Screen/Camera Recording
  ipcMain.handle('recording:start', async (_, { deviceId, settings }) => {
    return await recordingManager.startScreenRecord(deviceId, settings, (line) => {
      mainWindow?.webContents.send('log:entry', {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        level: 'info',
        message: line,
      });
    });
  });
  ipcMain.handle('recording:stop', async () => await recordingManager.stopScreenRecord());
  ipcMain.handle('recording:screenshot', async (_, { deviceId }) => await recordingManager.takeScreenshot(deviceId));
  ipcMain.handle('recording:camera', async (_, { deviceId }) => await recordingManager.startCameraCapture(deviceId));
  ipcMain.handle('recording:video', async (_, { deviceId }) => await recordingManager.startVideoCapture(deviceId));

  // OBS
  ipcMain.handle('obs:connect', async (_, { host, port, password }) => await obsManager.connectObs(host, port, password));
  ipcMain.handle('obs:inject-scene', async (_, { deviceName }) => await obsManager.injectScrcpyScene(deviceName));
  ipcMain.handle('obs:disconnect', async () => await obsManager.disconnectObs());
  ipcMain.handle('obs:status', () => obsManager.getObsConnected());

  // iOS
  ipcMain.handle('ios:detect', async () => await iosManager.detectIosDevices());
  ipcMain.handle('ios:info', async (_, { udid }) => await iosManager.getIosDeviceInfo(udid));
  ipcMain.handle('ios:mirror', async (_, { udid }) => {
    return await iosManager.startIosMirror(udid, (line) => {
      mainWindow?.webContents.send('log:entry', {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        level: 'info',
        message: line,
      });
    });
  });

  ipcMain.handle('stream:start', async (_event: IpcMainInvokeEvent, { deviceId, settings }: { deviceId: string; settings: any }) => {
    try {
      mainWindow?.webContents.send('log:entry', {
        id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'info', message: `Initializing mirroring for device ${deviceId}...`,
      });
      const started = await scrcpyManager.startMirror(deviceId, settings, (logLine) => {
        mainWindow?.webContents.send('log:entry', {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5), timestamp: new Date().toISOString(), level: logLine.includes('ERR') || logLine.includes('ERROR') ? 'error' : 'info', message: logLine,
        });
      });
      if (started) {
        mainWindow?.webContents.send('log:entry', {
          id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'success', message: `Mirroring active for ${deviceId}.`,
        });
      }
    } catch (error: any) {
      mainWindow?.webContents.send('log:entry', {
        id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'error', message: `Failed to start mirror: ${error.message}`,
      });
      throw error;
    }
  });

  ipcMain.handle('stream:stop', async () => {
    await scrcpyManager.stopMirror();
    mainWindow?.webContents.send('log:entry', {
      id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'warning', message: 'Mirroring stopped.',
    });
  });

  ipcMain.handle('stream:status', async () => {
    return { streaming: scrcpyManager.isScrcpyRunning(), deviceId: scrcpyManager.getCurrentDeviceId() };
  });

  ipcMain.handle('file:ls', async (_event: IpcMainInvokeEvent, { path: dirPath }: { path: string }) => {
    const devices = await getDevices();
    const android = devices.find(d => d.state === 'device');
    if (android) return await fileExplorer.listDirectory(dirPath, android.id);
    
    // Fallback to iOS
    const iosDevs = await iosManager.detectIosDevices();
    if (iosDevs.length > 0) return await iosManager.listIosDirectory(iosDevs[0], dirPath);
    
    return [];
  });

  ipcMain.handle('file:push', async (_event: IpcMainInvokeEvent, { localPath, devicePath = '/sdcard/StremFusion/' }: { localPath: string; devicePath?: string }) => {
    const devices = await getDevices();
    const active = devices.find(d => d.state === 'device');
    if (active) {
      return await fileTransfer.pushFile(localPath, devicePath, active.id, (progress) => {
        mainWindow?.webContents.send('transfer:progress', progress);
      });
    }
    
    const iosDevs = await iosManager.detectIosDevices();
    if (iosDevs.length > 0) {
      return await iosManager.pushIosFile(iosDevs[0], localPath, devicePath);
    }

    throw new Error('No device connected');
  });

  ipcMain.handle('file:pull', async (_event: IpcMainInvokeEvent, { devicePath, localPath }: { devicePath: string; localPath: string }) => {
    const devices = await getDevices();
    const active = devices.find(d => d.state === 'device');
    if (active) {
      return await fileTransfer.pullFile(devicePath, localPath, active.id, (progress) => {
        mainWindow?.webContents.send('transfer:progress', progress);
      });
    }

    const iosDevs = await iosManager.detectIosDevices();
    if (iosDevs.length > 0) {
      return await iosManager.pullIosFile(iosDevs[0], devicePath, localPath);
    }

    throw new Error('No device connected');
  });

  ipcMain.handle('file:open', async (_event: IpcMainInvokeEvent, { devicePath }: { devicePath: string }) => {
    // Download to temp folder and open
    const tempDir = path.join(app.getPath('temp'), 'StremFusion_Preview');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const fileName = path.basename(devicePath);
    const localPath = path.join(tempDir, fileName);

    const devices = await getDevices();
    const active = devices.find(d => d.state === 'device');
    
    let success = false;
    if (active) {
      success = await fileTransfer.pullFile(devicePath, localPath, active.id, () => {});
    } else {
      const iosDevs = await iosManager.detectIosDevices();
      if (iosDevs.length > 0) {
        success = await iosManager.pullIosFile(iosDevs[0], devicePath, localPath);
      }
    }

    if (success) {
      shell.openPath(localPath);
      return true;
    }
    return false;
  });

  ipcMain.handle('file:rm', async (_event: IpcMainInvokeEvent, { devicePath }: { devicePath: string }) => {
    const devices = await getDevices();
    const active = devices.find(d => d.state === 'device');
    if (active) return await fileExplorer.deleteFile(devicePath, active.id);
    
    const iosDevs = await iosManager.detectIosDevices();
    if (iosDevs.length > 0) return await iosManager.deleteIosFile(iosDevs[0], devicePath);

    return false;
  });

  ipcMain.handle('file:mkdir', async (_event: IpcMainInvokeEvent, { devicePath }: { devicePath: string }) => {
    const devices = await getDevices();
    const active = devices.find(d => d.state === 'device');
    if (active) return await fileExplorer.createFolder(devicePath, active.id);

    const iosDevs = await iosManager.detectIosDevices();
    if (iosDevs.length > 0) return await iosManager.createIosFolder(iosDevs[0], devicePath);

    return false;
  });

  ipcMain.handle('fs:ls', async (_event: IpcMainInvokeEvent, { path: localPath }: { path: string }) => { return await fileManager.listLocalFiles(localPath); });
  ipcMain.handle('fs:drives', async () => { return await fileManager.getLocalDrives(); });

  ipcMain.handle('clipboard:set', async (_event: IpcMainInvokeEvent, { text }: { text: string }) => {
    if (!text) return;
    const devices = await getDevices();
    const active = devices.find(d => d.state === 'device');
    if (!active) return;
    const escapedText = text.replace(/[\\"'`$()<>|&;! ]/g, '\\$&');
    mainWindow?.webContents.send('log:entry', {
      id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'info', message: `Syncing desktop clipboard to device...`,
    });
    try {
      await executeAdb(['-s', active.id, 'shell', 'input', 'text', escapedText]);
      mainWindow?.webContents.send('log:entry', {
        id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'success', message: `Clipboard synced to ${active.id}.`,
      });
    } catch (e) { console.error("Clipboard sync failed", e); }
  });

  ipcMain.handle('app:set-startup', (_event: IpcMainInvokeEvent, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, path: app.getPath('exe') });
    return true;
  });

  ipcMain.handle('settings:save', (_event: IpcMainInvokeEvent, { key, value }: { key: string; value: any }) => { 
    appStore.set(key, value); 
    return true; 
  });

  ipcMain.handle('settings:get', (_event: IpcMainInvokeEvent, key: string) => { 
    return appStore.get(key); 
  });

  ipcMain.handle('settings:onboarding-done', () => { 
    appStore.set('onboardingDone', true); 
    return true; 
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────

app.setName('StremFusion');

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerIpcHandlers();
  
  const onboardingDone = appStore.get('onboardingDone') as boolean | undefined;
  if (onboardingDone === undefined || !onboardingDone) {
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
          mainWindow?.webContents.send('show-onboarding');
      });
    }
  }

  devicePollingTimer = startDevicePolling((devices) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device:update', devices);
      const active = devices.find(d => d.state === 'device');
      if (active) {
        clipboardBridge.startSync(active.id, (text) => {
            mainWindow?.webContents.send('log:entry', {
                id: Date.now().toString(), timestamp: new Date().toISOString(), level: 'info', message: `Device Clipboard Sync: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
            });
        });
      }
    }
  }, 2000);

  app.on('activate', () => { if (mainWindow === null) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { app.quit(); }
});