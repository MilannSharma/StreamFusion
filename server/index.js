import express from 'express';
import { spawn, execFile, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createSettingsRouter } from './routes/settings.js';
import { createFilesRouter } from './routes/files.js';
import { createDiagnosticsRouter } from './routes/diagnostics.js';
import { createNotificationsRouter } from './routes/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Security: reject external network / LAN connections
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
    return res.status(403).json({ error: 'Local connections only' });
  }
  next();
});

// Locate scrcpy-bin (supports dev, env vars, and packaged Electron app)
const candidateDirs = [
  process.env.SF_RESOURCES ? path.join(process.env.SF_RESOURCES, 'scrcpy-bin') : null,
  process.resourcesPath ? path.join(process.resourcesPath, 'scrcpy-bin') : null,
  path.join(rootDir, 'scrcpy-bin'),
  path.join(rootDir, 'build', 'StreamFusion-Standalone-v1.0.0', 'scrcpy-bin')
].filter(Boolean);

let scrcpyBin = rootDir;
let adbExe = 'adb.exe';
let scrcpyExe = 'scrcpy.exe';

for (const dir of candidateDirs) {
  if (fs.existsSync(path.join(dir, 'adb.exe')) && fs.existsSync(path.join(dir, 'scrcpy.exe'))) {
    scrcpyBin = dir;
    adbExe = path.join(dir, 'adb.exe');
    scrcpyExe = path.join(dir, 'scrcpy.exe');
    break;
  }
}

console.log(`[StreamFusion Server] scrcpy binaries located at: ${scrcpyBin}`);

// Instant health check (no adb spawn, instant response for Electron readiness)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.1.0',
    adb: fs.existsSync(adbExe),
    scrcpy: fs.existsSync(scrcpyExe),
    binDir: scrcpyBin
  });
});

// Recordings directory
const homeDir = os.homedir();
const defaultRecordDir = path.join(homeDir, 'Videos', 'StreamFusion');
if (!fs.existsSync(defaultRecordDir)) {
  try { fs.mkdirSync(defaultRecordDir, { recursive: true }); } catch (e) {}
}

const defaultScreenshotDir = path.join(homeDir, 'Pictures', 'StreamFusion');
if (!fs.existsSync(defaultScreenshotDir)) {
  try { fs.mkdirSync(defaultScreenshotDir, { recursive: true }); } catch (e) {}
}

// Active multi-device mirror state (serial -> mirror session object)
const activeMirrors = new Map();
let basePortCounter = 27183;

// Persistent Wi-Fi Devices Storage in userData
const dataDir = process.env.SF_DATA_DIR || (process.env.APPDATA ? path.join(process.env.APPDATA, 'StreamFusion') : rootDir);
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}
const savedDevicesFile = path.join(dataDir, 'saved_devices.json');

// Mount centralized routers
app.use('/api/settings', createSettingsRouter(dataDir));
app.use('/api/diagnostics', createDiagnosticsRouter({ runAdb, adbExe, scrcpyExe, scrcpyBin }));
app.use('/api/notifications', createNotificationsRouter({ runAdb }));

function getSavedDevices() {
  try {
    if (fs.existsSync(savedDevicesFile)) {
      return JSON.parse(fs.readFileSync(savedDevicesFile, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveDevice(device) {
  if (!device || !device.ipAddress) return;
  try {
    const list = getSavedDevices();
    const port = device.isWifi && device.serial.includes(':') ? parseInt(device.serial.split(':')[1], 10) : 5555;
    const existingIdx = list.findIndex(d => d.ip === device.ipAddress);
    const item = {
      serial: `${device.ipAddress}:${port}`,
      ip: device.ipAddress,
      port,
      model: device.model || 'Android Phone',
      displayName: device.displayName || device.model || 'Android Phone',
      lastSeen: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...item };
    } else {
      list.push(item);
    }
    fs.writeFileSync(savedDevicesFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
}

let lastAutoConnectTime = 0;
async function autoConnectSavedDevices(activeDevices) {
  const now = Date.now();
  if (now - lastAutoConnectTime < 15000) return; // At most once every 15s
  lastAutoConnectTime = now;

  const savedList = getSavedDevices();
  for (const s of savedList) {
    const isAlreadyConnected = activeDevices.some(d => d.serial === s.serial || d.ipAddress === s.ip);
    if (!isAlreadyConnected && s.ip) {
      runAdb(['connect', `${s.ip}:${s.port || 5555}`], 3000).catch(() => {});
    }
  }
}

// Helper: Run ADB command safely
function runAdb(args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(adbExe, args, { cwd: scrcpyBin, timeout: timeoutMs, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, output: (stderr || err.message || '').trim() });
      } else {
        resolve({ success: true, output: (stdout || '').trim() });
      }
    });
  });
}

// 1. GET /api/devices
app.get('/api/devices', async (req, res) => {
  const result = await runAdb(['devices', '-l'], 4000);
  if (!result.success && !result.output) {
    return res.json({ success: true, devices: [] });
  }

  const rawLines = result.output.split(/\r?\n/).map(l => l.trim());
  const devices = [];

  // Only start parsing after "List of devices attached"
  let startIndex = 0;
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].toLowerCase().includes('list of devices attached')) {
      startIndex = i + 1;
      break;
    }
  }

  const validStates = ['device', 'offline', 'unauthorized', 'recovery', 'no permissions'];

  for (let i = startIndex; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line || line.startsWith('*') || line.startsWith('adb') || line.includes('daemon') || line.includes('could not') || line.includes('cannot connect')) {
      continue;
    }

    const match = line.match(/^(\S+)\s+(\w+)(.*)$/);
    if (!match) continue;

    const serial = match[1];
    const state = match[2].toLowerCase();
    const details = match[3] || '';

    // Ignore invalid serials or error messages
    if (!validStates.includes(state) || serial.toLowerCase().startsWith('adb') || serial.toLowerCase().includes('.exe') || serial === 'could') {
      continue;
    }

    // Is it Wi-Fi? Only if matches IP:PORT pattern (e.g. 192.168.1.100:5555)
    const isWifi = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(serial);

    const modelMatch = details.match(/model:(\S+)/);
    const productMatch = details.match(/product:(\S+)/);
    const deviceMatch = details.match(/device:(\S+)/);

    let model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : (isWifi ? `Wi-Fi Phone (${serial})` : `Android Phone (${serial})`);
    const product = productMatch ? productMatch[1] : '';
    const deviceName = deviceMatch ? deviceMatch[1] : '';

    const dev = {
      serial,
      state,
      model,
      displayName: model,
      ownerName: '',
      marketName: '',
      product,
      deviceName,
      isWifi,
      battery: -1,
      androidVersion: '',
      resolution: '',
      ipAddress: isWifi ? serial.split(':')[0] : ''
    };

    if (state === 'device') {
      try {
        const [devNameRes, btNameRes, marketRes, modRes, verRes, batRes, wmRes] = await Promise.all([
          runAdb(['-s', serial, 'shell', 'settings', 'get', 'global', 'device_name'], 2000),
          runAdb(['-s', serial, 'shell', 'settings', 'get', 'secure', 'bluetooth_name'], 2000),
          runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.marketname'], 2000),
          runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.model'], 2000),
          runAdb(['-s', serial, 'shell', 'getprop', 'ro.build.version.release'], 2000),
          runAdb(['-s', serial, 'shell', 'dumpsys', 'battery'], 2000),
          runAdb(['-s', serial, 'shell', 'wm', 'size'], 2000)
        ]);

        const cleanVal = (res) => {
          if (!res || !res.success || !res.output) return '';
          const out = res.output.trim();
          if (out.toLowerCase() === 'null' || out.toLowerCase().includes('error') || out.toLowerCase().includes('unknown')) return '';
          return out;
        };

        const ownerName = cleanVal(devNameRes);
        const btName = cleanVal(btNameRes);
        const market = cleanVal(marketRes);
        const mod = cleanVal(modRes);

        dev.ownerName = ownerName || btName || '';
        dev.marketName = market || '';
        if (mod) dev.model = mod.replace(/_/g, ' ');

        // Priority: Owner Name -> Bluetooth Name -> Market Name -> Model Name
        dev.displayName = ownerName || btName || market || dev.model;

        if (verRes.success && verRes.output && !verRes.output.includes('error')) dev.androidVersion = `Android ${verRes.output}`;

        const batM = batRes.output.match(/level:\s*(\d+)/);
        if (batM) dev.battery = parseInt(batM[1], 10);

        const rM = wmRes.output.match(/Physical size:\s*(\d+x\d+)/);
        if (rM) dev.resolution = rM[1];

        if (!dev.ipAddress) {
          const routeRes = await runAdb(['-s', serial, 'shell', 'ip', 'route'], 2000);
          const ipM = routeRes.output.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
          if (ipM) {
            dev.ipAddress = ipM[1];
          } else {
            const addrRes = await runAdb(['-s', serial, 'shell', 'ip', 'addr', 'show', 'wlan0'], 2000);
            const addrM = addrRes.output.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
            if (addrM) dev.ipAddress = addrM[1];
          }
        }
      } catch (e) {}
    }

    devices.push(dev);
  }

  // Auto-save any active Wi-Fi device
  for (const d of devices) {
    if (d.isWifi || d.ipAddress) {
      saveDevice(d);
    }
  }

  // Background auto-reconnect for missing saved devices
  autoConnectSavedDevices(devices);

  // Mark saved devices as online/offline
  const savedList = getSavedDevices().map(s => ({
    ...s,
    online: devices.some(d => d.serial === s.serial || d.ipAddress === s.ip)
  }));

  res.json({ success: true, devices, savedDevices: savedList });
});

// Delete a saved device
app.delete('/api/wifi/saved', (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.json({ success: false, message: 'No IP provided' });
  const list = getSavedDevices().filter(d => d.ip !== ip);
  try {
    fs.writeFileSync(savedDevicesFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
  res.json({ success: true, message: 'Saved device removed' });
});

// 2. POST /api/mirror/start
app.post('/api/mirror/start', (req, res) => {
  const { serial, model, deviceName, config = {}, recordFile, mode = 'mirror' } = req.body;
  if (!serial) return res.json({ success: false, message: 'No serial provided' });

  // If this device is already mirroring, terminate its existing session first
  if (activeMirrors.has(serial)) {
    const existing = activeMirrors.get(serial);
    if (existing && existing.proc && !existing.proc.killed) {
      try {
        existing.proc.kill('SIGTERM');
        exec(`taskkill /F /T /PID ${existing.proc.pid}`, () => {});
      } catch (e) {}
    }
    activeMirrors.delete(serial);
  }

  // Force screen stay awake during mirror session (works on both USB & Wi-Fi)
  if (config.stayAwake !== false) {
    runAdb(['-s', serial, 'shell', 'svc', 'power', 'stayon', 'true']);
    runAdb(['-s', serial, 'shell', 'input', 'keyevent', '224']); // KEYCODE_WAKEUP
  }

  const titleName = deviceName || model || serial;
  const currentPort = basePortCounter++;
  if (basePortCounter > 27195) basePortCounter = 27183;

  const args = [
    '-s', serial,
    `--port=${currentPort}:${currentPort + 5}`
  ];

  // Mode: Webcam Studio, Virtual Display, or Standard Mirror
  if (mode === 'webcam' || config.isWebcam) {
    args.push(
      '--video-source=camera',
      `--camera-facing=${config.cameraFacing || 'back'}`,
      `--camera-size=${config.cameraSize || '1920x1080'}`,
      `--camera-fps=${config.cameraFps || 60}`,
      `--window-title=StreamFusion HD Webcam - ${titleName}`
    );
  } else if (mode === 'virtual-display' || config.isVirtualDisplay) {
    args.push(
      `--new-display=${config.virtualDisplaySize || '1920x1080/420'}`,
      `--window-title=StreamFusion Virtual Display - ${titleName}`
    );
    if (config.startApp) {
      args.push(`--start-app=${config.startApp}`);
    }
  } else {
    args.push(`--window-title=StreamFusion - ${titleName}`);
  }

  // Video settings
  if (config.maxSize && config.maxSize > 0) args.push(`--max-size=${config.maxSize}`);
  if (config.bitrateMbps && config.bitrateMbps > 0) args.push(`--video-bit-rate=${config.bitrateMbps}M`);
  if (config.maxFps && config.maxFps > 0) args.push(`--max-fps=${config.maxFps}`);
  if (config.videoCodec) args.push(`--video-codec=${config.videoCodec}`);
  if (config.lockOrientation >= 0 && config.lockOrientation <= 3) args.push(`--lock-video-orientation=${config.lockOrientation}`);

  // Window flags & Power optimizations (Phase 1.1)
  if (config.alwaysOnTop) args.push('--always-on-top');
  if (config.borderless) args.push('--window-borderless');
  if (config.fullscreen) args.push('--fullscreen');
  if (config.turnScreenOff) args.push('--turn-screen-off');
  if (config.stayAwake !== false) args.push('--stay-awake');
  if (config.powerOffOnClose) args.push('--power-off-on-close');
  if (config.showTouches) args.push('--show-touches');
  if (config.clipboardAutoSync === false) args.push('--no-clipboard-autosync');

  // Audio flags
  if (config.audioEnabled === false || mode === 'webcam') {
    args.push('--no-audio');
  } else {
    if (config.audioCodec) args.push(`--audio-codec=${config.audioCodec}`);
    if (config.audioBitrateKbps) args.push(`--audio-bit-rate=${config.audioBitrateKbps}K`);
    if (config.audioSource) args.push(`--audio-source=${config.audioSource}`);
    if (config.audioBufferMs) args.push(`--audio-buffer=${config.audioBufferMs}`);
    if (config.audioOnly) args.push('--no-video');
  }

  // Recording
  let isDeviceRecording = false;
  if (recordFile) {
    args.push(`--record=${recordFile}`);
    if (config.recordFormat) args.push(`--record-format=${config.recordFormat}`);
    isDeviceRecording = true;
  }

  try {
    const proc = spawn(scrcpyExe, args, { cwd: scrcpyBin });
    const mirrorInfo = {
      proc,
      serial,
      model,
      deviceName,
      isRecording: isDeviceRecording,
      recordingFile: recordFile || null,
      port: currentPort,
      mode,
      startedAt: new Date().toISOString()
    };
    activeMirrors.set(serial, mirrorInfo);

    proc.stdout.on('data', (data) => console.log(`[scrcpy ${serial}] ${data}`));
    proc.stderr.on('data', (data) => console.error(`[scrcpy err ${serial}] ${data}`));

    proc.on('close', (code) => {
      console.log(`[scrcpy exited ${serial}] code ${code}`);
      runAdb(['-s', serial, 'shell', 'svc', 'power', 'stayon', 'false']);
      activeMirrors.delete(serial);
    });

    res.json({ success: true, message: 'Mirroring launched!', pid: proc.pid, port: currentPort });
  } catch (err) {
    res.json({ success: false, message: `Failed to launch scrcpy: ${err.message}` });
  }
});

// 3. POST /api/mirror/stop
app.post('/api/mirror/stop', (req, res) => {
  const { serial } = req.body;
  if (serial && activeMirrors.has(serial)) {
    const session = activeMirrors.get(serial);
    try {
      runAdb(['-s', serial, 'shell', 'svc', 'power', 'stayon', 'false']);
      session.proc.kill('SIGTERM');
      exec(`taskkill /F /T /PID ${session.proc.pid}`, () => {});
    } catch (e) {}
    activeMirrors.delete(serial);
    return res.json({ success: true, message: `Mirror for ${serial} stopped` });
  }

  // If no serial specified, stop all active mirrors
  for (const [s, session] of activeMirrors.entries()) {
    try {
      runAdb(['-s', s, 'shell', 'svc', 'power', 'stayon', 'false']);
      session.proc.kill('SIGTERM');
      exec(`taskkill /F /T /PID ${session.proc.pid}`, () => {});
    } catch (e) {}
  }
  activeMirrors.clear();
  res.json({ success: true, message: 'All mirrors stopped' });
});

// 4. GET /api/mirror/status
app.get('/api/mirror/status', (req, res) => {
  const { serial } = req.query;
  const mirrorsObj = {};
  for (const [s, m] of activeMirrors.entries()) {
    mirrorsObj[s] = {
      active: !m.proc.killed,
      serial: m.serial,
      model: m.model,
      mode: m.mode,
      isRecording: m.isRecording,
      recordingFile: m.recordingFile,
      startedAt: m.startedAt
    };
  }

  const isSpecificMirroring = serial ? !!(activeMirrors.has(serial) && !activeMirrors.get(serial).proc.killed) : activeMirrors.size > 0;
  const firstSession = activeMirrors.size > 0 ? Array.from(activeMirrors.values())[0] : null;

  res.json({
    isMirroring: isSpecificMirroring,
    mirrors: mirrorsObj,
    device: firstSession ? { serial: firstSession.serial, model: firstSession.model } : null,
    isRecording: Array.from(activeMirrors.values()).some(m => m.isRecording),
    recordingFile: firstSession ? firstSession.recordingFile : null
  });
});

// 5. POST /api/wifi/switch & /api/wifi/enable
const handleWifiSwitch = async (req, res) => {
  const { serial } = req.body;
  if (!serial) return res.json({ success: false, message: 'No serial provided' });

  // Get IP (try ip route then ip addr show wlan0)
  let ip = null;
  const routeRes = await runAdb(['-s', serial, 'shell', 'ip', 'route'], 3000);
  const ipM = routeRes.output.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
  if (ipM) {
    ip = ipM[1];
  } else {
    const addrRes = await runAdb(['-s', serial, 'shell', 'ip', 'addr', 'show', 'wlan0'], 3000);
    const addrM = addrRes.output.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
    if (addrM) ip = addrM[1];
  }

  if (!ip) {
    return res.json({ success: false, message: 'Could not auto-detect mobile Wi-Fi IP address. Ensure phone is connected to Wi-Fi.' });
  }

  // tcpip 5555
  const tcpRes = await runAdb(['-s', serial, 'tcpip', '5555'], 5000);
  if (!tcpRes.success) {
    return res.json({ success: false, message: `Failed to enable TCP/IP mode: ${tcpRes.output}` });
  }

  await new Promise(r => setTimeout(r, 1000));

  // connect
  const connRes = await runAdb(['connect', `${ip}:5555`], 8000);
  if (connRes.output.toLowerCase().includes('connected to') && !connRes.output.toLowerCase().includes('unable')) {
    return res.json({
      success: true,
      ip,
      port: 5555,
      message: `Successfully connected to ${ip}:5555 over Wi-Fi! You can now safely remove the USB cable.`
    });
  }

  res.json({ success: false, message: connRes.output });
};

app.post('/api/wifi/switch', handleWifiSwitch);
app.post('/api/wifi/enable', handleWifiSwitch);


// 6. POST /api/wifi/connect
app.post('/api/wifi/connect', async (req, res) => {
  const { ip, port = 5555 } = req.body;
  if (!ip) return res.json({ success: false, message: 'IP is required' });

  const target = ip.includes(':') ? ip : `${ip}:${port}`;
  const result = await runAdb(['connect', target], 8000);

  if (result.output.toLowerCase().includes('connected to') && !result.output.toLowerCase().includes('unable')) {
    res.json({ success: true, message: `Connected to ${target} via Wi-Fi` });
  } else {
    res.json({ success: false, message: result.output });
  }
});

// 7. Full-Featured Files Router (/api/files)
const defaultDownloadDir = path.join(homeDir, 'Downloads', 'StreamFusion');
if (!fs.existsSync(defaultDownloadDir)) {
  try { fs.mkdirSync(defaultDownloadDir, { recursive: true }); } catch (e) {}
}
app.use('/api/files', createFilesRouter({ runAdb, defaultDownloadDir }));

// 9. Controls: Key, Text, URL, Screenshot, Wake Screen
app.post('/api/control/wake', async (req, res) => {
  const { serial } = req.body;
  if (!serial) return res.json({ success: false, message: 'No serial provided' });
  await runAdb(['-s', serial, 'shell', 'svc', 'power', 'stayon', 'true'], 3000);
  await runAdb(['-s', serial, 'shell', 'input', 'keyevent', '224'], 3000); // KEYCODE_WAKEUP
  await runAdb(['-s', serial, 'shell', 'input', 'keyevent', '82'], 3000);  // KEYCODE_MENU (unlock)
  res.json({ success: true, message: 'Screen woken up' });
});

app.post('/api/control/key', async (req, res) => {
  const { serial, keycode } = req.body;
  const result = await runAdb(['-s', serial, 'shell', 'input', 'keyevent', String(keycode)], 3000);
  res.json(result);
});

app.post('/api/control/text', async (req, res) => {
  const { serial, text } = req.body;
  const escaped = (text || '').replace(/ /g, '%s').replace(/&/g, '\\&').replace(/</g, '\\<').replace(/>/g, '\\>');
  const result = await runAdb(['-s', serial, 'shell', 'input', 'text', escaped], 3000);
  res.json(result);
});

// Phase 1.2: Bi-Directional Clipboard & Unicode text injection
app.post('/api/control/clipboard', async (req, res) => {
  const { serial, text, action = 'send' } = req.body;
  if (!serial) return res.json({ success: false, message: 'No serial provided' });

  if (action === 'paste') {
    const r = await runAdb(['-s', serial, 'shell', 'input', 'keyevent', '279'], 3000); // KEYCODE_PASTE
    return res.json({ success: r.success, message: 'Paste key injected' });
  }

  if (!text) return res.json({ success: false, message: 'No text provided' });

  try {
    // Write UTF-8 text file and push to device cache
    const tempFile = path.join(os.tmpdir(), `sf_clip_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, text, 'utf8');
    await runAdb(['-s', serial, 'push', tempFile, '/data/local/tmp/sf_clipboard.txt'], 5000);
    try { fs.unlinkSync(tempFile); } catch (e) {}

    // Broadcast clipper intent if helper installed
    await runAdb(['-s', serial, 'shell', 'am', 'broadcast', '-a', 'clipper.set', '-e', 'text', text], 2000);

    // If pure ASCII, also inject via adb input text directly
    const isAscii = /^[\x20-\x7E]+$/.test(text);
    if (isAscii && text.length < 120) {
      const escaped = text.replace(/ /g, '%s').replace(/&/g, '\\&').replace(/</g, '\\<').replace(/>/g, '\\>');
      await runAdb(['-s', serial, 'shell', 'input', 'text', escaped], 3000);
    }

    res.json({ success: true, message: 'Text transferred to device' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/control/url', async (req, res) => {
  let { serial, url } = req.body;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  const result = await runAdb(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url], 3000);
  res.json(result);
});

app.post('/api/control/screenshot', (req, res) => {
  const { serial } = req.body;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `Screenshot_${timestamp}.png`;
  const fullPath = path.join(defaultScreenshotDir, filename);

  const proc = spawn(adbExe, ['-s', serial, 'exec-out', 'screencap', '-p'], { cwd: scrcpyBin });
  const writeStream = fs.createWriteStream(fullPath);

  proc.stdout.pipe(writeStream);

  proc.on('close', (code) => {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 1000) {
      // Read as base64 for instant preview
      const base64 = fs.readFileSync(fullPath).toString('base64');
      res.json({ success: true, filePath: fullPath, fileName: filename, preview: `data:image/png;base64,${base64}` });
    } else {
      res.json({ success: false, message: 'Screenshot failed or file empty.' });
    }
  });
});

// 10. POST /api/terminal
app.post('/api/terminal', async (req, res) => {
  const { serial, command } = req.body;
  const result = await runAdb(['-s', serial, 'shell', command], 10000);
  res.json(result);
});

// 11. Recordings
const handleGetRecordings = (req, res) => {
  if (!fs.existsSync(defaultRecordDir)) return res.json({ success: true, recordings: [] });
  const files = fs.readdirSync(defaultRecordDir)
    .filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'))
    .map(f => {
      const full = path.join(defaultRecordDir, f);
      const stat = fs.statSync(full);
      return {
        filename: f,
        fileName: f,
        fullPath: full,
        url: `/recordings-media/${encodeURIComponent(f)}`,
        size: formatBytes(stat.size),
        createdAt: stat.birthtime,
        date: stat.birthtime ? new Date(stat.birthtime).toLocaleDateString() : ''
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, recordings: files });
};

app.get('/api/recordings', handleGetRecordings);
app.get('/api/recordings/list', handleGetRecordings);

// Serve recordings and screenshots statically
app.use('/recordings-media', express.static(defaultRecordDir));
app.use('/screenshot-media', express.static(defaultScreenshotDir));

function isSafeMediaPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const resolved = path.resolve(targetPath);
  const safeRecord = path.resolve(defaultRecordDir);
  const safeScreen = path.resolve(defaultScreenshotDir);
  return resolved.startsWith(safeRecord) || resolved.startsWith(safeScreen);
}

app.post('/api/recordings/play', (req, res) => {
  const { filePath } = req.body;
  if (isSafeMediaPath(filePath) && fs.existsSync(filePath)) {
    execFile('cmd.exe', ['/c', 'start', '""', filePath], () => {});
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid or missing file' });
});

app.post('/api/recordings/open-folder', (req, res) => {
  execFile('explorer.exe', [defaultRecordDir], () => {});
  res.json({ success: true });
});

app.delete('/api/recordings', (req, res) => {
  const { filePath } = req.body;
  if (isSafeMediaPath(filePath) && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return res.json({ success: true });
    } catch (e) {
      return res.json({ success: false, message: e.message });
    }
  }
  res.json({ success: false, message: 'Invalid or missing file' });
});

// 12. ADB restart
app.post('/api/adb/restart', async (req, res) => {
  await runAdb(['kill-server'], 4000);
  await runAdb(['start-server'], 5000);
  res.json({ success: true, message: 'ADB server restarted' });
});

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Serve compiled frontend if present
const distPath = path.join(rootDir, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/recordings-media') || req.path.startsWith('/screenshot-media')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = parseInt(process.env.SF_PORT || '3001', 10);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[StreamFusion Server] Backend API and UI running at http://127.0.0.1:${PORT}`);
});

