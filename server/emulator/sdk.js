// Real Android emulator manager (M1): downloads Google's cmdline-tools, emulator and a
// system image on demand, creates a lightweight AVD, and controls its lifecycle.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execFile } from 'child_process';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
export const SDK_ROOT = path.join(BASE, 'android-sdk');
export const AVD_HOME = path.join(BASE, 'avd');
const JRE_DIR = path.join(BASE, 'jre17');

export const AVD_NAME = 'StreamFusion';
export const EMULATOR_PORT = 5554;
export const SERIAL = `emulator-${EMULATOR_PORT}`;
export const SYSTEM_IMAGE = 'system-images;android-34;google_apis;x86_64';

const CMDLINE_URL = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';
const JRE_URL = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse';

const sdkmanager = path.join(SDK_ROOT, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
const avdmanager = path.join(SDK_ROOT, 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat');
export const emulatorExe = path.join(SDK_ROOT, 'emulator', 'emulator.exe');
const imageDir = path.join(SDK_ROOT, ...SYSTEM_IMAGE.split(';'));
const avdConfig = path.join(AVD_HOME, `${AVD_NAME}.avd`, 'config.ini');

export const state = {
  isInstalling: false, progress: 0, stage: '', error: null,
  booting: false, booted: false, headless: false, bootMode: 'cold'
};
let proc = null;
let stopping = false;   // user asked to stop: never auto-repair
let repairs = 0;        // automatic repairs used for the current Power on
let startOpts = null;   // options of the current Power on, reused after a repair
let pendingRun = null;  // runAdb to launch with once an install/repair finishes
let log = () => {};
export function setLogger(fn) { log = fn; }

export function isInstalled() {
  return fs.existsSync(emulatorExe) && fs.existsSync(path.join(imageDir, 'system.img')) && fs.existsSync(avdConfig);
}
// Quick-boot snapshot: when present, the next start resumes the saved Android state (seconds instead of minutes).
const snapshotFile = path.join(AVD_HOME, `${AVD_NAME}.avd`, 'snapshots', 'default_boot', 'snapshot.pb');
export function hasSnapshot() { return fs.existsSync(snapshotFile); }
export function isProcessAlive() { return !!proc && proc.exitCode === null; }

function env() {
  return { ...process.env, JAVA_HOME: JRE_DIR, ANDROID_SDK_ROOT: SDK_ROOT, ANDROID_HOME: SDK_ROOT, ANDROID_AVD_HOME: AVD_HOME };
}
const set = (progress, stage) => { state.progress = Math.round(progress); state.stage = stage; log('info', stage); };

async function download(url, dest, from, to, label) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${label}`);
  const total = Number(res.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(dest);
  let got = 0;
  for await (const chunk of res.body) {
    out.write(chunk);
    got += chunk.length;
    if (total) state.progress = Math.round(from + (to - from) * (got / total));
  }
  await new Promise((r, j) => out.end(e => (e ? j(e) : r())));
}

// Windows 10+ ships bsdtar, which extracts zip files.
function extract(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve, reject) =>
    execFile(path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dir], { windowsHide: true }, (e) => (e ? reject(e) : resolve())));
}

// Runs a .bat/.exe, feeds optional stdin, reports % lines from sdkmanager.
function run(file, args, { input, onPercent } = {}) {
  return new Promise((resolve, reject) => {
    const q = (s) => `"${s}"`;
    const p = spawn(`${q(file)} ${args.map(q).join(' ')}`, { shell: true, env: env(), windowsHide: true });
    let tail = '';
    const onData = (d) => {
      const t = d.toString();
      tail = (tail + t).slice(-600);
      const m = t.match(/(\d+)%/g);
      if (m && onPercent) onPercent(parseInt(m[m.length - 1], 10));
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(tail) : reject(new Error(`${path.basename(file)} exited ${code}: ${tail.trim().slice(-300)}`))));
    if (input) { p.stdin.on('error', () => {}); p.stdin.write(input); }
    p.stdin.end();
  });
}

// User-tunable resources (Settings -> Engine Specs). Applied to the AVD each time it starts.
const CONFIG_FILE = path.join(BASE, 'emulator-config.json');
export const DEFAULT_CONFIG = { ramMB: 6144, cores: 4, heapMB: 384 };
const LIMITS = { ramMB: [1024, 8192], cores: [1, 16], heapMB: [128, 1024] };
export function getConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {}
  const out = { ...DEFAULT_CONFIG };
  for (const k of Object.keys(DEFAULT_CONFIG)) {
    const n = Math.round(Number(c[k]));
    if (Number.isFinite(n)) out[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], n));
  }
  return out;
}
export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  fs.mkdirSync(BASE, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  return getConfig();
}

function tuneAvd() {
  const cfg = getConfig();
  const wanted = {
    'hw.ramSize': String(cfg.ramMB), 'hw.cpu.ncore': String(cfg.cores), 'vm.heapSize': String(cfg.heapMB),
    'disk.dataPartition.size': '6G', 'hw.keyboard': 'yes', 'hw.gpu.mode': 'auto', 'fastboot.forceColdBoot': 'no', 'showDeviceFrame': 'no'
  };
  let lines = fs.readFileSync(avdConfig, 'utf8').split(/\r?\n/).filter(l => l.trim());
  for (const [k, v] of Object.entries(wanted)) {
    const i = lines.findIndex(l => l.startsWith(k + '='));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(avdConfig, lines.join('\n') + '\n');
}

export async function install() {
  if (state.isInstalling) return;
  Object.assign(state, { isInstalling: true, progress: 1, stage: 'Starting...', error: null });
  const tmp = path.join(BASE, 'tmp');
  try {
    fs.mkdirSync(tmp, { recursive: true });
    fs.mkdirSync(AVD_HOME, { recursive: true });

    if (!fs.existsSync(path.join(JRE_DIR, 'bin', 'java.exe'))) {
      set(1, 'Downloading Java 17 runtime (needed by Android tools)...');
      const zip = path.join(tmp, 'jre17.zip');
      await download(JRE_URL, zip, 1, 10, 'JRE');
      set(10, 'Extracting Java runtime...');
      const x = path.join(tmp, 'jre-x');
      fs.rmSync(x, { recursive: true, force: true });
      await extract(zip, x);
      const inner = fs.readdirSync(x).find(n => fs.statSync(path.join(x, n)).isDirectory());
      fs.rmSync(JRE_DIR, { recursive: true, force: true });
      fs.renameSync(path.join(x, inner), JRE_DIR);
    }

    if (!fs.existsSync(sdkmanager)) {
      set(11, 'Downloading Android command-line tools...');
      const zip = path.join(tmp, 'cmdline.zip');
      await download(CMDLINE_URL, zip, 11, 15, 'cmdline-tools');
      const x = path.join(tmp, 'cmd-x');
      fs.rmSync(x, { recursive: true, force: true });
      await extract(zip, x);
      const dest = path.join(SDK_ROOT, 'cmdline-tools', 'latest');
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(x, 'cmdline-tools'), dest);
    }

    set(16, 'Accepting Android SDK licenses...');
    await run(sdkmanager, [`--sdk_root=${SDK_ROOT}`, '--licenses'], { input: 'y\n'.repeat(40) });

    set(18, 'Downloading Android Emulator + Android 14 system image (~1.5 GB)...');
    await run(sdkmanager, [`--sdk_root=${SDK_ROOT}`, 'platform-tools', 'emulator', SYSTEM_IMAGE], {
      input: 'y\n'.repeat(10),
      onPercent: (p) => { state.progress = Math.max(state.progress, 18 + Math.round(p * 0.72)); }
    });

    set(91, 'Creating lightweight virtual device...');
    await run(avdmanager, ['create', 'avd', '-n', AVD_NAME, '-k', SYSTEM_IMAGE, '-d', 'pixel_6', '--force'], { input: 'no\n' });
    tuneAvd();

    fs.rmSync(tmp, { recursive: true, force: true });
    set(100, 'Installation Complete!');
    log('success', 'Android emulator installed');
    if (pendingRun) { const r = pendingRun; pendingRun = null; setTimeout(() => { try { launch(r); } catch (e) { log('error', e.message); } }, 900); }
  } catch (e) {
    pendingRun = null;
    state.error = e.message;
    state.stage = 'Install failed: ' + e.message;
    log('error', state.stage);
  } finally {
    setTimeout(() => { state.isInstalling = false; }, 800);
  }
}

export async function start(runAdb, { headless = false, wipe = false, gpu = 'auto' } = {}) {
  if (isProcessAlive() || state.isInstalling) return;
  stopping = false; repairs = 0;
  startOpts = { headless, wipe, gpu };
  state.error = null;
  // Missing or damaged install: set it up again in the background, then power on by itself.
  if (!isInstalled()) {
    log('warn', 'Emulator files are missing or damaged. Reinstalling in the background, it will start when ready.');
    pendingRun = runAdb;
    install();
    return;
  }
  launch(runAdb);
}

function launch(runAdb) {
  if (isProcessAlive()) return;
  const { headless, wipe, gpu } = startOpts || {};
  tuneAvd();
  const args = ['-avd', AVD_NAME, '-port', String(EMULATOR_PORT), '-no-audio', '-no-boot-anim',
    '-netdelay', 'none', '-netspeed', 'full', '-gpu', gpu || 'auto'];
  if (headless) args.push('-no-window');
  if (wipe) args.push('-wipe-data', '-no-snapshot-load');
  state.bootMode = !wipe && hasSnapshot() ? 'quick' : 'cold';
  let lastErr = '';
  const p = spawn(emulatorExe, args, { env: env(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  proc = p;
  Object.assign(state, { booting: true, booted: false, headless: !!headless });
  p.stdout.on('data', d => { const t = d.toString().trim(); if (t) log('debug', '[emu] ' + t.slice(0, 300)); });
  p.stderr.on('data', d => { const t = d.toString().trim(); if (t) { lastErr = t.slice(-200); log('warn', '[emu] ' + t.slice(0, 300)); } });
  p.on('error', e => { log('error', 'Emulator failed to launch: ' + e.message); state.booting = false; if (proc === p) proc = null; if (!stopping) onBootFailure(runAdb, e.message); });
  p.on('exit', (code) => {
    log('warn', `Emulator exited (code ${code})`);
    const early = state.booting && !stopping;
    Object.assign(state, { booting: false, booted: false });
    if (proc === p) proc = null;
    if (early) onBootFailure(runAdb, `it closed right after starting (code ${code}) ${lastErr}`);
  });
  log('info', `Launching AVD "${AVD_NAME}" ${headless ? '(headless)' : ''}${wipe ? ' with data wipe' : ''}`);
  waitForBoot(runAdb, p);
}

// The emulator crashed or never finished booting: repair by itself and try again (max 2 times).
function onBootFailure(runAdb, why) {
  if (repairs >= 2) {
    state.error = 'The emulator could not start even after repairing it. Try Reset, or check the log.';
    log('error', state.error);
    return;
  }
  repairs++;
  const full = repairs === 2;
  log('warn', `Emulator did not start (${why}). ${full ? 'Reinstalling the emulator' : 'Resetting the virtual phone'} automatically...`);
  try {
    fs.rmSync(path.join(AVD_HOME, `${AVD_NAME}.avd`), { recursive: true, force: true });
    if (full) {
      fs.rmSync(path.join(SDK_ROOT, 'emulator'), { recursive: true, force: true });
      fs.rmSync(imageDir, { recursive: true, force: true });
    }
  } catch (e) { log('error', 'Repair cleanup failed: ' + e.message); }
  if (startOpts) startOpts.wipe = false;
  pendingRun = runAdb;
  install();
}

async function waitForBoot(runAdb, p) {
  const t0 = Date.now();
  while (proc === p && isProcessAlive() && Date.now() - t0 < 420000) {
    const r = await runAdb(['-s', SERIAL, 'shell', 'getprop', 'sys.boot_completed'], 4000);
    if (r.success && (r.output || '').trim() === '1') {
      // boot_completed fires before shared storage is mounted; wait so push/pull/install work right away
      for (let i = 0; i < 20; i++) { const d = await runAdb(['-s', SERIAL, 'shell', 'test -d /sdcard/Download && echo ok'], 4000); if ((d.output || '').includes('ok')) break; await new Promise(r => setTimeout(r, 1500)); }
      Object.assign(state, { booting: false, booted: true });
      // Test emulators: never block automation behind crash/ANR dialogs
      await runAdb(['-s', SERIAL, 'shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1'], 4000);
      await runAdb(['-s', SERIAL, 'shell', 'settings', 'put', 'secure', 'anr_show_background', '0'], 4000);
      // Standard for automation: no animations => UI is idle sooner, fewer flaky taps/dumps
      for (const k of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) await runAdb(['-s', SERIAL, 'shell', 'settings', 'put', 'global', k, '0'], 4000);
      // After a quick (snapshot) start the virtual display can stay black until it goes to sleep and wakes once
      await runAdb(['-s', SERIAL, 'shell', 'input keyevent 223; sleep 1; input keyevent 224'], 8000);
      log('success', `Emulator booted in ${Math.round((Date.now() - t0) / 1000)}s (${SERIAL})`);
      return;
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  // Never finished booting: kill it, the exit handler repairs and retries
  if (proc === p && isProcessAlive() && !state.booted) { log('warn', 'Emulator boot timed out'); try { p.kill(); } catch (e) {} }
}

export async function stop(runAdb) {
  stopping = true; pendingRun = null;
  const wasBooted = state.booted;
  if (isProcessAlive() && wasBooted) {
    log('info', 'Saving emulator state so the next start is fast...');
    await runAdb(['-s', SERIAL, 'emu', 'avd', 'snapshot', 'save', 'default_boot'], 90000);
  }
  await runAdb(['-s', SERIAL, 'emu', 'kill'], 8000);
  const t0 = Date.now();
  while (isProcessAlive() && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 500));
  if (isProcessAlive()) { try { proc.kill(); } catch (e) {} }
  Object.assign(state, { booting: false, booted: false });
}

export const snapshot = (runAdb, action, name) =>
  runAdb(['-s', SERIAL, 'emu', 'avd', 'snapshot', action, name], 60000);

// Hardware acceleration check (virtualization firmware flag + emulator -accel-check).
export function hardwareCheck() {
  const ps = (cmd) => new Promise(r => execFile('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true, timeout: 8000 }, (e, o) => r(e ? '' : o.trim())));
  return Promise.all([
    ps('(Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled; (Get-CimInstance Win32_ComputerSystem).HypervisorPresent'),
    fs.existsSync(emulatorExe)
      ? new Promise(r => execFile(emulatorExe, ['-accel-check'], { env: env(), windowsHide: true, timeout: 10000 }, (e, o, se) => r(((o || '') + (se || '')).trim() || (e ? e.message : ''))))
      : Promise.resolve('')
  ]).then(([virt, accel]) => ({
    // firmware flag reads False when a hypervisor (Hyper-V/WHPX) already owns VT-x
    virtualizationEnabled: /true/i.test(virt),
    accelCheck: accel,
    accelOk: /is installed and usable|WHPX.*usable|HAXM.*usable/i.test(accel) && !/not (installed|usable)/i.test(accel),
    cpus: os.cpus().length,
    ramGB: Math.round(os.totalmem() / 1073741824)
  }));
}
