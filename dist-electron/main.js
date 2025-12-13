"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
let mainWindow = null;
// Resolve bundled tools path (works in both dev and packaged app)
function getToolsPath() {
    if (electron_1.app.isPackaged) {
        // In packaged app, tools are in resources/tools
        return path_1.default.join(process.resourcesPath, 'tools');
    }
    else {
        // In dev, tools are relative to __dirname
        return path_1.default.join(__dirname, '../tools');
    }
}
// Get path to scrcpy directory
function getScrcpyDir() {
    return path_1.default.join(getToolsPath(), 'scrcpy-win64-v3.3.3');
}
// List connected Android devices using `adb devices -l` and return id+model
async function listDevices() {
    return new Promise((resolve) => {
        // Try system adb first, fallback to bundled adb
        const adbPath = 'adb'; // will try system PATH first
        const bundledAdbPath = path_1.default.join(getScrcpyDir(), 'adb.exe');
        const tryAdb = (cmdPath, isBundled) => {
            (0, child_process_1.exec)(`"${cmdPath}" devices -l`, (err, stdout) => {
                if (err) {
                    console.warn(`adb (${isBundled ? 'bundled' : 'system'}) failed:`, err.message);
                    // If system failed, try bundled
                    if (!isBundled && fs_1.default.existsSync(bundledAdbPath)) {
                        console.log('Trying bundled adb...');
                        return tryAdb(bundledAdbPath, true);
                    }
                    return resolve([]);
                }
                console.log(`✓ Device list from ${isBundled ? 'bundled' : 'system'} adb:`, stdout);
                const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
                const devices = [];
                const parseLine = (line) => {
                    // Typical line: <id> device product:... model:<model> device:... transport_id:...
                    const parts = line.split(/\s+/);
                    const id = parts[0];
                    // try to read model from `model:NAME`
                    const modelMatch = line.match(/model:([^\s]+)/i);
                    if (modelMatch && modelMatch[1]) {
                        return { id, name: modelMatch[1] };
                    }
                    return { id, name: id };
                };
                for (const line of lines) {
                    // ignore offline entries
                    if (line.includes('offline'))
                        continue;
                    // ignore non-device lines
                    if (!line)
                        continue;
                    try {
                        devices.push(parseLine(line));
                    }
                    catch (e) {
                        console.warn('Parse error for line:', line, e);
                    }
                }
                console.log('Parsed devices:', devices);
                resolve(devices);
            });
        };
        tryAdb(adbPath, false);
    });
}
let scrcpyProcess = null;
function spawnScrcpy(deviceId) {
    if (scrcpyProcess) {
        console.log('scrcpy already running');
        return;
    }
    // Path to bundled scrcpy directory and executable
    const scrcpyDir = getScrcpyDir();
    const exePath = path_1.default.join(scrcpyDir, 'scrcpy.exe');
    const baseArgs = [];
    if (deviceId)
        baseArgs.push('-s', deviceId);
    // Preferred args: explicit audio source and buffer, set window title
    // Keep audio flags first (helps Windows route audio reliably)
    const preferredArgs = [
        ...baseArgs,
        '--audio-source=output',
        '--audio-buffer=50',
        '--window-title=Streamfusion Mirror',
        '--video-bit-rate', '8M',
        '--max-size', '1024'
    ];
    // Fallback args without audio (if device or scrcpy variant doesn't support audio flags)
    const fallbackArgs = [
        ...baseArgs,
        '--no-audio',
        '--video-bit-rate', '8M',
        '--max-size', '1024'
    ];
    const useBundledAdb = fs_1.default.existsSync(path_1.default.join(scrcpyDir, 'adb.exe'));
    if (!useBundledAdb) {
        console.warn('Bundled adb.exe not found in scrcpy folder; scrcpy will use system adb if available');
    }
    let attemptedFallback = false;
    const startProc = (args) => {
        console.log('Starting scrcpy with args:', args.join(' '));
        try {
            const proc = (0, child_process_1.spawn)(exePath, args, {
                cwd: scrcpyDir,
                windowsHide: false,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
            });
            scrcpyProcess = proc;
            proc.stdout?.on('data', (d) => console.log('[scrcpy]', d.toString()));
            proc.stderr?.on('data', (d) => {
                const text = d.toString();
                console.warn('[scrcpy-err]', text);
                // If flags are unsupported, try fallback once
                if (!attemptedFallback && /ambiguous option|has been removed|unknown option|ERROR: --/i.test(text)) {
                    attemptedFallback = true;
                    console.log('scrcpy reported unsupported args, retrying without audio...');
                    try {
                        proc.kill();
                    }
                    catch (e) { }
                    scrcpyProcess = null;
                    startProc(fallbackArgs);
                }
            });
            proc.on('error', (err) => {
                console.error('scrcpy spawn error', err);
                mainWindow?.webContents.send('streaming-status', { streaming: false, error: true, message: String(err) });
                scrcpyProcess = null;
            });
            proc.on('exit', (code, signal) => {
                console.log('scrcpy exited', code, signal);
                mainWindow?.webContents.send('streaming-status', { streaming: false, message: 'Stopped' });
                scrcpyProcess = null;
            });
            mainWindow?.webContents.send('streaming-status', { streaming: true, deviceId, message: useBundledAdb ? 'Started (using bundled adb)' : 'Started (using system adb)' });
            return proc;
        }
        catch (e) {
            console.error('Failed to start scrcpy', e);
            mainWindow?.webContents.send('streaming-status', { streaming: false, error: true, message: String(e) });
            scrcpyProcess = null;
            return null;
        }
    };
    // Start with preferred audio-enabled args
    startProc(preferredArgs);
}
function stopScrcpy() {
    if (!scrcpyProcess) {
        mainWindow?.webContents.send('streaming-status', { streaming: false, message: 'Not running' });
        return;
    }
    try {
        const pid = scrcpyProcess.pid;
        // Try graceful kill
        scrcpyProcess.kill();
        // If on Windows, ensure termination via taskkill
        if (process.platform === 'win32' && pid) {
            (0, child_process_1.exec)(`taskkill /PID ${pid} /T /F`, (err) => {
                if (err)
                    console.warn('taskkill error', err.message);
            });
        }
    }
    catch (e) {
        console.warn('Error stopping scrcpy', e);
    }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'Stremfusion',
        backgroundColor: '#09090b', // Dark background matching body
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
        frame: true,
    });
    // DEV MODE: Load from Vite dev server if VITE_DEV_SERVER_URL is set
    if (process.env.VITE_DEV_SERVER_URL) {
        console.log('Loading from dev server:', process.env.VITE_DEV_SERVER_URL);
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    }
    else {
        // PRODUCTION MODE: Load built static files
        const filePath = path_1.default.join(__dirname, '../dist/index.html');
        console.log('Loading from production build:', filePath);
        mainWindow.loadFile(filePath);
    }
    // Forward all renderer console messages to main process
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        console.log(`[renderer console] ${message}`);
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('Renderer failed to load:', errorCode, errorDescription);
    });
    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// Start app and device polling
let devicePollingInterval = null;
let lastDeviceJson = '';
async function getSystemStatus() {
    // Default status object
    const status = {
        backend: 'online',
        adb: 'not-ready',
        android: { connected: false, model: null, id: null, state: null },
        ios: { connected: false },
        usbDebugging: 'disabled'
    };
    return new Promise((resolve) => {
        // Try system adb first, fallback to bundled adb
        const adbPath = 'adb'; // will try system PATH first
        const bundledAdbPath = path_1.default.join(getScrcpyDir(), 'adb.exe');
        const tryAdb = (cmdPath, isBundled) => {
            // First check adb version to confirm adb is working
            (0, child_process_1.exec)(`"${cmdPath}" version`, (err, stdout) => {
                if (err) {
                    console.warn(`adb version check (${isBundled ? 'bundled' : 'system'}) failed:`, err.message);
                    // If system failed, try bundled
                    if (!isBundled && fs_1.default.existsSync(bundledAdbPath)) {
                        return tryAdb(bundledAdbPath, true);
                    }
                    return resolve(status); // return default offline status
                }
                // adb is ready
                status.adb = 'ready';
                console.log(`✓ adb ${isBundled ? 'bundled' : 'system'} is ready`);
                // Now query devices
                (0, child_process_1.exec)(`"${cmdPath}" devices -l`, (err, stdout) => {
                    if (err) {
                        console.warn('Failed to query devices:', err.message);
                        return resolve(status);
                    }
                    console.log(`Device list from ${isBundled ? 'bundled' : 'system'} adb:`, stdout);
                    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
                    // Parse first valid device
                    for (const line of lines) {
                        if (!line)
                            continue;
                        const parts = line.split(/\s+/);
                        const id = parts[0];
                        const state = parts[1] || '';
                        const modelMatch = line.match(/model:([^\s]+)/i);
                        const model = modelMatch ? modelMatch[1] : null;
                        console.log(`Parsed device: id=${id}, state=${state}, model=${model}`);
                        if (state === 'device') {
                            status.android.connected = true;
                            status.android.model = model;
                            status.android.id = id;
                            status.android.state = 'device';
                            status.usbDebugging = 'enabled';
                            break;
                        }
                        else if (state === 'unauthorized') {
                            status.android.id = id;
                            status.android.state = 'unauthorized';
                            status.usbDebugging = 'disabled';
                            break;
                        }
                        else if (state === 'offline') {
                            status.android.id = id;
                            status.android.state = 'offline';
                            status.usbDebugging = 'disabled';
                            break;
                        }
                    }
                    resolve(status);
                });
            });
        };
        tryAdb(adbPath, false);
    });
}
async function pollDevicesAndNotify() {
    try {
        const devices = await listDevices();
        console.log(`[Device Poll] Found ${devices.length} devices`);
        const json = JSON.stringify(devices);
        if (json !== lastDeviceJson) {
            lastDeviceJson = json;
            console.log(`[Device Poll] Sending update:`, devices);
            mainWindow?.webContents.send('devices-updated', devices);
        }
        // emit full system status for UI
        try {
            console.log('[System Status] Gathering status...');
            const sys = await getSystemStatus();
            console.log('[System Status] Status gathered:', JSON.stringify(sys, null, 2));
            mainWindow?.webContents.send('system-status', sys);
        }
        catch (e) {
            console.warn('Error gathering system status', e);
        }
    }
    catch (e) {
        console.warn('Error polling devices', e);
    }
}
electron_1.app.whenReady().then(async () => {
    createWindow();
    // initial poll
    await pollDevicesAndNotify();
    devicePollingInterval = setInterval(pollDevicesAndNotify, 2000);
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // cleanup
        if (devicePollingInterval) {
            clearInterval(devicePollingInterval);
            devicePollingInterval = null;
        }
        try {
            stopScrcpy();
        }
        catch { }
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
// IPC handlers: Phase 1 stubs
electron_1.ipcMain.handle('get-devices', async () => {
    try {
        return await listDevices();
    }
    catch (e) {
        return [];
    }
});
electron_1.ipcMain.handle('check-scrcpy-adb', async () => {
    const scrcpyDir = getScrcpyDir();
    const adbPath = path_1.default.join(scrcpyDir, 'adb.exe');
    return fs_1.default.existsSync(adbPath);
});
// Comprehensive status: 'ready' | 'missing-adb' | 'missing-scrcpy'
electron_1.ipcMain.handle('check-scrcpy-status', async () => {
    const scrcpyDir = getScrcpyDir();
    const exePath = path_1.default.join(scrcpyDir, 'scrcpy.exe');
    const adbPath = path_1.default.join(scrcpyDir, 'adb.exe');
    if (!fs_1.default.existsSync(exePath)) {
        console.warn('scrcpy.exe not found in bundled tools folder');
        return 'missing-scrcpy';
    }
    if (!fs_1.default.existsSync(adbPath)) {
        console.warn('adb.exe not found in scrcpy folder');
        return 'missing-adb';
    }
    // Quick runtime check: try running bundled adb to ensure it executes.
    return new Promise((resolve) => {
        (0, child_process_1.exec)('adb devices', { cwd: scrcpyDir, timeout: 4000 }, (err, stdout, stderr) => {
            if (err) {
                console.warn('Bundled adb failed to run', err.message || stderr);
                // Log details only on the main process console for debugging
                resolve('missing-adb');
                return;
            }
            resolve('ready');
        });
    });
});
// Allow renderer to request a current snapshot of system status
electron_1.ipcMain.handle('get-system-status', async () => {
    try {
        return await getSystemStatus();
    }
    catch (e) {
        console.warn('get-system-status failed', e);
        return {
            backend: 'offline',
            adb: 'not-ready',
            android: { connected: false },
            ios: { connected: false },
            usbDebugging: 'disabled'
        };
    }
});
electron_1.ipcMain.on('start-streaming', (_event, deviceId) => {
    console.log('Start streaming requested for device:', deviceId);
    try {
        spawnScrcpy(deviceId);
    }
    catch (e) {
        console.error('Error starting scrcpy', e);
        mainWindow?.webContents.send('streaming-status', { streaming: false, error: true, message: String(e) });
    }
});
electron_1.ipcMain.on('stop-streaming', () => {
    console.log('Stop streaming requested');
    try {
        stopScrcpy();
        mainWindow?.webContents.send('streaming-status', { streaming: false, message: 'Stopping' });
    }
    catch (e) {
        console.error('Error stopping scrcpy', e);
        mainWindow?.webContents.send('streaming-status', { streaming: false, error: true, message: String(e) });
    }
});
