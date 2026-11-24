import { createWifiPairRouter, mdnsServices, connectPortFor } from './device/wifipair.js';
import express from 'express';
import * as recorder from './automation/recorder.js';
import { createAutomationRouter } from './automation/router.js';
import { spawn, execFile, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createSettingsRouter } from './routes/settings.js';
import { createFilesRouter } from './routes/files.js';
import { createDiagnosticsRouter } from './routes/diagnostics.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { friendlyApp } from './routes/appnames.js';
import { createEmulatorRouter } from './emulator/router.js';
import { createDeviceRouter } from './device/router.js';
import { createAgentRouter } from './agent/router.js';
import { repairStaleProxies } from './testmode/collectors/index.js';
import { createWebRouter } from './web/router.js';
import { createProjectsRouter } from './projects/router.js';
import { createMcpActivity } from './mcp/activity.js';

let APP_VERSION = '0.0.0';
try { APP_VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version; } catch (e) {}

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
    version: APP_VERSION,
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
app.use('/api/diagnostics', createDiagnosticsRouter({
  runAdb, adbExe, scrcpyExe, scrcpyBin,
  getSaved: () => getSavedDevices(),
  reconnectSaved: async () => { const l = await listDevices(); lastAutoConnectTime = 0; await autoConnectSavedDevices(l.devices || []); }
}));
app.use('/api/notifications', createNotificationsRouter({ runAdb, dataDir }).startWatcher());
app.use('/api/emulator', createEmulatorRouter({ runAdb, rootDir }));
// One failed adb/scrcpy/child call must never take the whole server (and the AI session with it) down
process.on('unhandledRejection', (e) => console.error('[StreamFusion] unhandled rejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('[StreamFusion] uncaught exception:', e && e.stack ? e.stack : e));

const mcpActivity = createMcpActivity();
app.use(mcpActivity.middleware);
app.use('/api/mcp/live', mcpActivity.router);
const deviceRouter = createDeviceRouter({ runAdb, adbExe, scrcpyBin });
app.use('/api/device', deviceRouter);
app.get('/api/mcp/config', (req, res) => {
  const script = path.join(rootDir, 'server', 'mcp', 'streamfusion-mcp.mjs').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); // external node cannot read inside app.asar
  const env = PORT === 3001 ? undefined : { SF_PORT: String(PORT) };
  res.json({
    success: true, script,
    claudeCode: `claude mcp add streamfusion${env ? ` -e SF_PORT=${PORT}` : ''} -- node "${script}"`,
    json: JSON.stringify({ mcpServers: { streamfusion: { command: 'node', args: [script], ...(env ? { env } : {}) } } }, null, 2)
  });
});
const webRouter = createWebRouter({ runAdb });
app.use('/api/web', webRouter);
recorder.wrapTools({ ...deviceRouter.TOOLS, ...webRouter.TOOLS });
app.use('/api/projects', createProjectsRouter());
app.use('/api/automation', createAutomationRouter({ tools: { ...deviceRouter.TOOLS, ...webRouter.TOOLS }, runAdb }));
app.use('/api/agent', createAgentRouter({ tools: { ...deviceRouter.TOOLS, ...webRouter.TOOLS } }));

// The Android emulator lives in its own tab; it must never be saved/auto-reconnected as a Wi-Fi phone.
const isEmulatorAddress = (v) => /^(emulator-|localhost:|127\.0\.0\.1:|10\.0\.2\.)/.test(String(v || ''));

function getSavedDevices() {
  try {
    if (fs.existsSync(savedDevicesFile)) {
      const all = JSON.parse(fs.readFileSync(savedDevicesFile, 'utf8'));
      const filtered = all.filter(d => !isEmulatorAddress(d.serial) && !isEmulatorAddress(d.ip));
      const clean = dedupeSaved(filtered);
      if (JSON.stringify(clean) !== JSON.stringify(all)) fs.writeFileSync(savedDevicesFile, JSON.stringify(clean, null, 2), 'utf8'); // purge emulator entries and old per-IP duplicates
      return clean;
    }
  } catch (e) {}
  return [];
}

const nicknamesFile = path.join(dataDir, 'nicknames.json');
function readNicknames() { try { return JSON.parse(fs.readFileSync(nicknamesFile, 'utf8')) || {}; } catch (e) { return {}; } }
const writeSaved = (list) => { try { fs.writeFileSync(savedDevicesFile, JSON.stringify(list, null, 2), 'utf8'); } catch (e) {} };
const entryIps = (e) => (Array.isArray(e.ips) && e.ips.length ? e.ips : (e.ip ? [{ ip: e.ip, port: e.port || 5555, at: e.lastSeen }] : []));
const newestFirst = (a, b) => String(b.at || '').localeCompare(String(a.at || ''));

// One phone = one saved entry (found by its hardware id), with every address it has been seen on.
// Old entries made before hardware ids existed (one per IP) are folded into the phone with the same model when it next connects.
function saveDevice(device) {
  if (!device || !device.ipAddress || device.isEmulator || isEmulatorAddress(device.ipAddress) || isEmulatorAddress(device.serial)) return;
  try {
    let list = getSavedDevices();
    const port = device.isWifi && device.serial.includes(':') ? parseInt(device.serial.split(':')[1], 10) : 5555;
    const now = new Date().toISOString();
    const hwId = device.hwId || '';
    const model = device.model || 'Android Phone';
    let idx = hwId ? list.findIndex(d => d.hwId === hwId) : -1;
    if (idx < 0) idx = list.findIndex(d => entryIps(d).some(i => i.ip === device.ipAddress));
    const base = idx >= 0 ? list[idx] : { ips: [] };
    // fold in old per-IP duplicates of this same phone (no hardware id yet, same model)
    const dupes = hwId ? list.filter((d, i) => i !== idx && !d.hwId && d.model === model) : [];
    let ips = [...entryIps(base)];
    for (const d of dupes) for (const x of entryIps(d)) if (!ips.some(y => y.ip === x.ip)) ips.push(x);
    const cur = ips.find(i => i.ip === device.ipAddress);
    if (cur) { cur.port = port; cur.at = now; } else ips.push({ ip: device.ipAddress, port, at: now });
    ips = ips.sort(newestFirst).slice(0, 6);
    const item = {
      ...base,
      hwId: hwId || base.hwId || '',
      serial: `${device.ipAddress}:${port}`,
      ip: device.ipAddress,
      port,
      ips,
      model,
      displayName: device.displayName || model,
      lastSeen: now
    };
    list = list.filter((d, i) => i !== idx && !dupes.includes(d));
    list.push(item);
    writeSaved(list);
  } catch (e) {}
}

// Collapse duplicates already on disk (same hardware id, or several same-model entries made by IP changes) when the list is read.
function dedupeSaved(list) {
  const out = [];
  for (const d of list) {
    const j = out.findIndex(o => (d.hwId && o.hwId === d.hwId) || (!d.hwId && !o.hwId && o.model === d.model));
    if (j < 0) { out.push({ ...d, ips: entryIps(d) }); continue; }
    const o = out[j];
    const ips = [...o.ips];
    for (const x of entryIps(d)) if (!ips.some(y => y.ip === x.ip)) ips.push(x);
    const newer = String(d.lastSeen || '') > String(o.lastSeen || '');
    out[j] = { ...(newer ? { ...o, ...d } : { ...d, ...o }), hwId: o.hwId || d.hwId || '', ips: ips.sort(newestFirst).slice(0, 6) };
  }
  return out;
}

let lastAutoConnectTime = 0;
async function autoConnectSavedDevices(activeDevices) {
  const now = Date.now();
  if (now - lastAutoConnectTime < 15000) return; // At most once every 15s
  lastAutoConnectTime = now;

  const live = await mdnsServices(runAdb).catch(() => []);
  for (const s of getSavedDevices()) {
    const addrs = entryIps(s).map(a => ({ ...a, port: live.find(x => x.kind === 'connect' && x.ip === a.ip)?.port || a.port }));
    const isAlreadyConnected = activeDevices.some(d => (s.hwId && d.hwId === s.hwId) || addrs.some(a => d.serial === `${a.ip}:${a.port || 5555}` || d.ipAddress === a.ip));
    if (isAlreadyConnected) continue;
    for (const a of addrs.slice(0, 3)) { // most recent addresses first; stop at the first that answers
      const r = await runAdb(['connect', `${a.ip}:${a.port || 5555}`], 3000);
      if (r.success && /connected to/i.test(r.output) && !/cannot|fail/i.test(r.output)) break;
    }
  }
}

// Helper: Run ADB command safely
function runAdb(args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(adbExe, args, { cwd: scrcpyBin, timeout: timeoutMs, encoding: 'utf8', windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, output: (stderr || err.message || '').trim() });
      } else {
        resolve({ success: true, output: (stdout || '').trim() });
      }
    });
  });
}

// 1. GET /api/devices
const devInfoCache = new Map(); // serial -> { at, dev }
// Several pages poll this list at once and adb can be slow (server start, sleeping Wi-Fi phone): share one in-flight scan,
// and when adb does not answer, return the last good list (stale) instead of an empty one that looks like "no phone".
let devicesInflight = null;
let lastGoodDevices = { devices: [], savedDevices: [] };
app.get('/api/devices', async (req, res) => {
  try {
    devicesInflight ||= listDevices().finally(() => { devicesInflight = null; });
    res.json(await devicesInflight);
  } catch (e) {
    res.json({ success: true, ...lastGoodDevices, stale: true });
  }
});
async function listDevices() {
  const result = await runAdb(['devices', '-l'], 4000);
  if (!result.success && !result.output) {
    return { success: true, ...lastGoodDevices, stale: true };
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

    // The app asks for this list every few seconds; 8 adb shell calls each time swamp a slow phone, so a phone's details are reused for 60 s
    const cachedInfo = devInfoCache.get(serial);
    const usedCache = state === 'device' && cachedInfo && Date.now() - cachedInfo.at < 60000;
    if (usedCache) Object.assign(dev, cachedInfo.dev);
    else if (state === 'device') {
      try {
        const [devNameRes, btNameRes, marketRes, modRes, verRes, batRes, wmRes, idRes] = await Promise.all([
          runAdb(['-s', serial, 'shell', 'settings', 'get', 'global', 'device_name'], 2000),
          runAdb(['-s', serial, 'shell', 'settings', 'get', 'secure', 'bluetooth_name'], 2000),
          runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.marketname'], 2000),
          runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.model'], 2000),
          runAdb(['-s', serial, 'shell', 'getprop', 'ro.build.version.release'], 2000),
          runAdb(['-s', serial, 'shell', 'dumpsys', 'battery'], 2000),
          runAdb(['-s', serial, 'shell', 'wm', 'size'], 2000),
          runAdb(['-s', serial, 'shell', 'settings', 'get', 'secure', 'android_id'], 2000)
        ]);

        const cleanVal = (res) => {
          if (!res || !res.success || !res.output) return '';
          const out = res.output.trim();
          if (out.toLowerCase() === 'null' || out.toLowerCase().includes('error') || out.toLowerCase().includes('unknown')) return '';
          return out;
        };

        dev.hwId = cleanVal(idRes);
        const ownerName = cleanVal(devNameRes);
        const btName = cleanVal(btNameRes);
        const market = cleanVal(marketRes);
        const mod = cleanVal(modRes);

        dev.ownerName = ownerName || btName || '';
        dev.marketName = market || '';
        if (mod) dev.model = mod.replace(/_/g, ' ');

        // Priority: Owner Name -> Bluetooth Name -> Market Name -> Model Name
        dev.displayName = ownerName || btName || market || dev.model;

        // Auto-detect and label StreamFusion Android Emulator
        const isEmulator = serial.startsWith('localhost:') || serial.startsWith('127.0.0.1:') || serial.startsWith('emulator-');
        if (isEmulator) {
          dev.displayName = 'StreamFusion Android Emulator';
          dev.model = 'StreamFusion Emulator';
          dev.isEmulator = true;
          if (dev.battery < 0) dev.battery = 100;
        }

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

    if (state === 'device' && !usedCache && dev.androidVersion) devInfoCache.set(serial, { at: Date.now(), dev: { ...dev } });
    devices.push(dev);
  }

  // adb may list a paired phone twice: as ip:port and as adb-XXXX._adb-tls-connect._tcp. Keep the ip:port one.
  for (let i = devices.length - 1; i >= 0; i--) {
    const d = devices[i];
    if (/_adb-tls-connect/.test(d.serial) && devices.some(o => o !== d && !/_adb-tls-connect/.test(o.serial) && ((d.hwId && o.hwId === d.hwId) || (d.ipAddress && o.ipAddress === d.ipAddress)))) devices.splice(i, 1);
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
  const nicks = readNicknames();
  for (const d of devices) if (d.hwId && nicks[d.hwId]) d.nickname = nicks[d.hwId];
  const savedList = getSavedDevices().map(s => ({
    ...s,
    nickname: (s.hwId && nicks[s.hwId]) || '',
    online: devices.some(d => (s.hwId && d.hwId === s.hwId) || entryIps(s).some(a => d.serial === `${a.ip}:${a.port}` || d.ipAddress === a.ip))
  }));

  lastGoodDevices = { devices, savedDevices: savedList };
  return { success: true, devices, savedDevices: savedList };
}

// Background keep-alive: the server itself re-connects saved Wi-Fi phones and refreshes the device list every 20 s, so a phone is
// already connected (and its notifications already flowing) when the window is closed to the tray or has not been opened yet.
const keepPhonesConnected = () => { devicesInflight ||= listDevices().finally(() => { devicesInflight = null; }); return devicesInflight.catch(() => {}); };
setTimeout(keepPhonesConnected, 3000);
setInterval(keepPhonesConnected, 20000);

// List saved Wi-Fi devices (same data as `savedDevices` in /api/devices)
app.get('/api/wifi/saved', (req, res) => res.json({ success: true, devices: getSavedDevices() }));

// Delete a saved device
app.delete('/api/wifi/saved', (req, res) => {
  const { ip, hwId } = req.body || {};
  if (!ip && !hwId) return res.json({ success: false, message: 'No IP provided' });
  const list = getSavedDevices().filter(d => !((hwId && d.hwId === hwId) || (ip && entryIps(d).some(a => a.ip === ip))));
  writeSaved(list);
  res.json({ success: true, message: 'Saved device removed' });
});

// Nickname for a phone, kept by hardware id so it survives IP / network changes and shows everywhere
app.put('/api/wifi/nickname', (req, res) => {
  const { hwId, serial, nickname } = req.body || {};
  let id = hwId;
  if (!id && serial) { const s = getSavedDevices().find(d => d.serial === serial); id = s && s.hwId; }
  if (!id) return res.json({ success: false, message: 'Phone id not known yet' });
  const all = readNicknames();
  const name = String(nickname || '').trim().slice(0, 40);
  if (name) all[id] = name; else delete all[id];
  try { fs.writeFileSync(nicknamesFile, JSON.stringify(all, null, 2), 'utf8'); } catch (e) {}
  res.json({ success: true, nickname: name });
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
        exec(`taskkill /F /T /PID ${existing.proc.pid}`, { windowsHide: true }, () => {});
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
    const displaySize = config.virtualDisplaySize || '1080x2400/300';
    args.push(
      `--new-display=${displaySize}`,
      `--window-title=StreamFusion Virtual Display - ${titleName}`,
      '--no-vd-destroy-content'
    );
    if (config.flexDisplay) {
      args.push('-x');
    }
    // Auto-scale vertical mobile screen so height fits cleanly within monitor work area (default 700px for laptops)
    const maxSize = (config.maxSize && config.maxSize > 0) ? config.maxSize : 700;
    args.push(`--max-size=${maxSize}`);

    // Safe top window positioning so title bar and bottom navigation remain fully visible
    args.push('--window-y=24');


    // Configure Android secondary display mode:
    // If phone mode: disable forced desktop mode so apps open fullscreen without freeform window headers
    const isDesktop = config.displayMode === 'desktop' || config.isDesktopMode === true;
    if (isDesktop) {
      runAdb(['-s', serial, 'shell', 'settings', 'put', 'global', 'force_desktop_mode_on_external_displays', '1']);
      runAdb(['-s', serial, 'shell', 'settings', 'put', 'global', 'enable_freeform_support', '1']);
    } else {
      runAdb(['-s', serial, 'shell', 'settings', 'put', 'global', 'force_desktop_mode_on_external_displays', '0']);
    }

    // Ensure an app is launched so virtual display never renders a blank empty canvas
    const targetApp = (config.startApp && config.startApp.trim()) ? config.startApp.trim() : 'com.android.settings';
    args.push(`--start-app=${targetApp}`);
  } else {
    args.push(`--window-title=StreamFusion - ${titleName}`);
  }

  // Video settings
  if (mode !== 'virtual-display' && config.maxSize && config.maxSize > 0) args.push(`--max-size=${config.maxSize}`);
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

  // Recording (Direct to Local PC in 12 Mbps Smooth 60 FPS)
  let isDeviceRecording = false;
  let targetRecordFile = recordFile;
  if (!targetRecordFile && (config.recordSession || config.isRecording || req.body.record)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = (titleName || 'Phone').replace(/[^a-zA-Z0-9_-]/g, '_');
    const format = config.recordFormat || 'mp4';
    targetRecordFile = path.join(defaultRecordDir, `StreamFusion_${safeName}_${timestamp}.${format}`);
  }

  if (targetRecordFile) {
    args.push(`--record=${targetRecordFile}`);
    args.push(`--record-format=${config.recordFormat || 'mp4'}`);
    if (!config.bitrateMbps) args.push('--video-bit-rate=12M');
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
      recordingFile: targetRecordFile || null,
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
      exec(`taskkill /F /T /PID ${session.proc.pid}`, { windowsHide: true }, () => {});
    } catch (e) {}
    activeMirrors.delete(serial);
    return res.json({ success: true, message: `Mirror for ${serial} stopped` });
  }

  // If no serial specified, stop all active mirrors
  for (const [s, session] of activeMirrors.entries()) {
    try {
      runAdb(['-s', s, 'shell', 'svc', 'power', 'stayon', 'false']);
      session.proc.kill('SIGTERM');
      exec(`taskkill /F /T /PID ${session.proc.pid}`, { windowsHide: true }, () => {});
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

// 4.0 POST /api/devices/:serial/install-apk (raw .apk body from the browser; installs on that phone and says which app is new)
app.post('/api/devices/:serial/install-apk', express.raw({ type: '*/*', limit: '600mb' }), async (req, res) => {
  const serial = String(req.params.serial);
  if (!/^[\w.:-]+$/.test(serial)) return res.status(400).json({ success: false, message: 'Bad serial' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) return res.status(400).json({ success: false, message: 'No APK received' });
  const tmp = path.join(os.tmpdir(), 'sf-upload-' + Date.now() + '.apk');
  const list = async () => new Set(((await runAdb(['-s', serial, 'shell', 'pm', 'list', 'packages', '-3'], 15000)).output || '').split(/\r?\n/).map(l => l.replace('package:', '').trim()).filter(Boolean));
  try {
    fs.writeFileSync(tmp, req.body);
    const before = await list();
    const r = await runAdb(['-s', serial, 'install', '-r', '-g', tmp], 180000);
    if (!/Success/i.test(r.output || '')) return res.json({ success: false, message: (r.output || 'Install failed').split(/\r?\n/).filter(Boolean).pop() });
    const after = await list();
    const added = [...after].filter(p => !before.has(p));
    res.json({ success: true, package: added[0] || '', isNew: added.length > 0 });
  } catch (e) { res.json({ success: false, message: e.message }); }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }
});

// 4.1 GET /api/devices/:serial/apps (Query launchable apps for Virtual Display)
app.get('/api/devices/:serial/apps', async (req, res) => {
  const { serial } = req.params;
  try {
    const { output } = await runAdb(['-s', serial, 'shell', 'cmd', 'package', 'query-activities', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER'], 6000);
    const lines = output.split('\n');
    const apps = [];
    const seenPackages = new Set();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.includes('/') && !line.startsWith('Activity') && !line.startsWith('priority') && !line.includes('match=')) {
        const [pkg, act] = line.split('/');
        if (pkg && !seenPackages.has(pkg)) {
          seenPackages.add(pkg);
          const label = friendlyApp(pkg);
          apps.push({
            package: pkg,
            activity: act,
            label
          });
        }
      }
    }

    apps.sort((a, b) => a.label.localeCompare(b.label));
    res.json({ success: true, apps });
  } catch (e) {
    res.json({
      success: false,
      apps: [
        { package: 'com.android.settings', label: 'Settings' },
        { package: 'com.android.chrome', label: 'Chrome' },
        { package: 'com.google.android.youtube', label: 'YouTube' }
      ],
      message: e.message
    });
  }
});

// 4.2 POST /api/devices/:serial/desktop-mode (Auto-configure secondary display settings via ADB)
app.post('/api/devices/:serial/desktop-mode', async (req, res) => {
  const { serial } = req.params;
  const { mode, enabled } = req.body || {};
  const isPhone = mode === 'phone' || enabled === false;
  const val = isPhone ? '0' : '1';
  try {
    await runAdb(['-s', serial, 'shell', 'settings', 'put', 'global', 'force_desktop_mode_on_external_displays', val], 3000);
    await runAdb(['-s', serial, 'shell', 'settings', 'put', 'global', 'enable_freeform_support', val], 3000);
    await runAdb(['-s', serial, 'shell', 'settings', 'put', 'global', 'force_resizable_activities', '1'], 3000);
    res.json({
      success: true,
      message: isPhone
        ? 'Phone Mode enabled: apps will fill virtual display fullscreen without window headers!'
        : 'Desktop Mode & Freeform settings enabled on phone!'
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 4.3 GET /api/devices/:serial/display (Query native physical display size & density)
app.get('/api/devices/:serial/display', async (req, res) => {
  const { serial } = req.params;
  try {
    const sizeRes = await runAdb(['-s', serial, 'shell', 'wm', 'size'], 3000);
    const densRes = await runAdb(['-s', serial, 'shell', 'wm', 'density'], 3000);

    const sizeMatch = sizeRes.output.match(/(\d+)x(\d+)/);
    const densMatch = densRes.output.match(/(\d+)/);

    const width = sizeMatch ? parseInt(sizeMatch[1], 10) : 1080;
    const height = sizeMatch ? parseInt(sizeMatch[2], 10) : 2400;
    const density = densMatch ? parseInt(densMatch[1], 10) : 420;

    res.json({
      success: true,
      width,
      height,
      density,
      virtualDisplaySize: `${width}x${height}/${density}`
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message,
      virtualDisplaySize: '1080x2400/420'
    });
  }
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


// Cable-free pairing (QR code / pairing code) for Android 11+ phones
app.use('/api/wifi', createWifiPairRouter({ runAdb, onConnected: () => { keepPhonesConnected(); } }));

// 6. POST /api/wifi/connect
app.post('/api/wifi/connect', async (req, res) => {
  const { ip, port = 5555 } = req.body;
  if (!ip) return res.json({ success: false, message: 'IP is required' });

  const target = ip.includes(':') ? ip : `${ip}:${port}`;
  let result = await runAdb(['connect', target], 8000);
  if (!/connected to/i.test(result.output) || /unable|cannot|fail/i.test(result.output)) { // phones paired with Wireless debugging change port every time: ask the network for the current one
    const live = await connectPortFor(runAdb, target.split(':')[0]);
    if (live) result = await runAdb(['connect', `${target.split(':')[0]}:${live}`], 8000);
  }

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

// Expand Android notification shade or quick settings
app.post('/api/control/statusbar', async (req, res) => {
  const { serial, action = 'notifications' } = req.body;
  if (!serial) return res.json({ success: false, message: 'No serial provided' });
  try {
    const cmd = action === 'settings' ? 'expand-settings' : action === 'collapse' ? 'collapse' : 'expand-notifications';
    await runAdb(['-s', serial, 'shell', 'cmd', 'statusbar', cmd], 3000);
    res.json({ success: true, message: `Status bar ${cmd} triggered` });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
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

  const proc = spawn(adbExe, ['-s', serial, 'exec-out', 'screencap', '-p'], { cwd: scrcpyBin, windowsHide: true });
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
    execFile('cmd.exe', ['/c', 'start', '""', filePath], { windowsHide: true }, () => {});
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid or missing file' });
});

app.post('/api/recordings/open-folder', (req, res) => {
  execFile('explorer.exe', [defaultRecordDir], { windowsHide: true }, () => {});
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
  await runAdb(['start-server'], 8000);
  // USB phones re-register a few seconds after the server is back: wait for them instead of answering too early
  let count = 0;
  for (let i = 0; i < 10 && !count; i++) {
    const d = await runAdb(['devices'], 4000);
    count = String(d.output || '').split(/\r?\n/).slice(1).filter(l => /\s(device|unauthorized)\s*$/.test(l)).length;
    if (!count) await new Promise(r => setTimeout(r, 1000));
  }
  res.json({ success: true, devices: count, message: count ? 'ADB server restarted, ' + count + ' device(s) found' : 'ADB server restarted, no device found yet. Check the cable and USB debugging.' });
});

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Serve static public assets (including nav-dock.html, icons)
const publicPath = path.join(rootDir, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
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
  // a test that was cut off (crash, power loss) may have left a phone pointing at a capture proxy that is gone: put it right
  setTimeout(() => repairStaleProxies().then(r => { for (const x of r) console.log(`[StreamFusion Server] capture proxy on ${x.serial}: ${x.ok ? 'removed' : 'could not be removed (phone offline?)'}`); }).catch(() => {}), 4000);
});

