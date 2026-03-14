import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Device, DeviceState, DeviceInfo, AdbResult, AdbExecOptions } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment helpers
// ─────────────────────────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV === 'development';

// ─────────────────────────────────────────────────────────────────────────────
// 1. getAdbPath
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the absolute path to the bundled adb.exe binary.
 */
export function getAdbPath(): string {
  if (IS_DEV) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const p = path.resolve(__dirname, '../../../../Backend/Tools/scrcpy-win64-v3.3.3/adb.exe');
    console.log('[DEBUG] AdbController __dirname:', __dirname);
    console.log('[DEBUG] Resolved AdbPath:', p);
    return p;
  }
  return path.join(process.resourcesPath, 'scrcpy', 'adb.exe');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. executeAdb
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spawns the ADB binary with the provided arguments and collects stdout/stderr.
 *
 * @param args       Arguments to pass to adb (e.g. `['devices', '-l']`)
 * @param options    Optional config, e.g. custom timeout
 * @returns          An `AdbResult` containing stdout, stderr, and the exit code
 * @throws           If the process times out or cannot be spawned
 */
export function executeAdb(
  args: string[],
  options: AdbExecOptions = {}
): Promise<AdbResult> {
  const { timeoutMs = 10_000 } = options;
  const adbPath = getAdbPath();

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(adbPath, args, { windowsHide: true });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
      reject(
        new Error(
          `ADB command timed out after ${timeoutMs}ms: adb ${args.join(' ')}`
        )
      );
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) {
        reject(
          new Error(
            `Failed to spawn ADB process at "${adbPath}": ${err.message}`
          )
        );
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 1,
        });
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. getDevices
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs `adb devices -l` and parses the output into a typed `Device[]` array.
 */
export async function getDevices(): Promise<Device[]> {
  try {
    const result = await executeAdb(['devices', '-l']);

    if (result.exitCode !== 0) {
      throw new Error(
        `adb devices exited with code ${result.exitCode}: ${result.stderr}`
      );
    }

    const lines = result.stdout.split('\n');
    const devices: Device[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('List of devices')) continue;

      const tokens = trimmed.split(/\s+/);
      if (tokens.length < 2) continue;

      const id = tokens[0];
      const state = normaliseState(tokens[1]);
      const qualifiers = parseQualifiers(tokens.slice(2));

      devices.push({
        id,
        state,
        model:        qualifiers.model        ?? 'Unknown',
        product:      qualifiers.product       ?? 'Unknown',
        transport_id: qualifiers.transport_id  ?? '',
      });
    }

    return devices;
  } catch (err: unknown) {
    throw new Error(
      `getDevices() failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. getDeviceInfo
// ─────────────────────────────────────────────────────────────────────────────

const deviceInfoCache = new Map<string, { info: DeviceInfo; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Gathers rich device information with caching and short timeouts.
 */
export async function getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
  if (!deviceId) throw new Error('getDeviceInfo(): deviceId must not be empty');

  const now = Date.now();
  const cached = deviceInfoCache.get(deviceId);
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.info;
  }

  try {
    // Check state first without blocking
    const devices = await getDevices();
    const dev = devices.find(d => d.id === deviceId);
    if (!dev || dev.state !== 'device') {
      throw new Error(`Device ${deviceId} is not ready (state: ${dev?.state ?? 'not found'})`);
    }

    // Use shorter timeouts for prop retrieval (3s instead of 10s default)
    const shellTimeout = 3000;
    
    // Fire all shell commands in parallel for speed
    const [modelRes, manufacturerRes, versionRes, batteryRes, storageRes] =
      await Promise.allSettled([
        executeAdb(['-s', deviceId, 'shell', 'getprop', 'ro.product.model'], { timeoutMs: shellTimeout }),
        executeAdb(['-s', deviceId, 'shell', 'getprop', 'ro.product.manufacturer'], { timeoutMs: shellTimeout }),
        executeAdb(['-s', deviceId, 'shell', 'getprop', 'ro.build.version.release'], { timeoutMs: shellTimeout }),
        executeAdb(['-s', deviceId, 'shell', 'dumpsys', 'battery'], { timeoutMs: shellTimeout }),
        executeAdb(['-s', deviceId, 'shell', 'df', '/sdcard'], { timeoutMs: shellTimeout }),
      ]);

    const model        = (modelRes.status === 'fulfilled' ? modelRes.value.stdout.trim() : '') || dev.model || 'Unknown';
    const manufacturer = (manufacturerRes.status === 'fulfilled' ? manufacturerRes.value.stdout.trim() : '') || 'Unknown';
    const version      = (versionRes.status === 'fulfilled' ? versionRes.value.stdout.trim() : '') || 'Unknown';

    // Parse battery info from dumpsys output
    const { level, isCharging } = parseBatteryDumpsys(batteryRes.status === 'fulfilled' ? batteryRes.value.stdout : '');

    // Parse storage from `df /sdcard` output
    const storage = parseDfOutput(storageRes.status === 'fulfilled' ? storageRes.value.stdout : '');

    const info: DeviceInfo = {
      id:          deviceId,
      name:        manufacturer !== 'Unknown' ? `${manufacturer} ${model}` : model,
      model,
      manufacturer,
      version,
      battery:     level,
      isCharging,
      storage,
    };

    deviceInfoCache.set(deviceId, { info, timestamp: now });
    return info;
  } catch (err: unknown) {
    throw new Error(
      `getDeviceInfo("${deviceId}") failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. isUsbDebuggingEnabled
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines whether USB debugging is authorised on the given device.
 *
 * Note: A device in the `device` state is authorised; `unauthorized` means the
 * user has not yet accepted the RSA key prompt on the device.
 *
 * @param deviceId  ADB serial
 * @returns         `true` if fully authorised, `false` if unauthorised/offline
 */
export async function isUsbDebuggingEnabled(deviceId: string): Promise<boolean> {
  try {
    const devices  = await getDevices();
    const target   = devices.find((d) => d.id === deviceId);
    if (!target) return false;
    return target.state === 'device';
  } catch (err: unknown) {
    throw new Error(
      `isUsbDebuggingEnabled("${deviceId}") failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. disconnectDevice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disconnects a TCP/IP connected device.
 *
 * For USB devices this is a no-op (ADB returns a benign message).
 *
 * @param deviceId  ADB serial, usually an IP:PORT string for Wi-Fi devices
 * @throws          On ADB execution failure
 */
export async function disconnectDevice(deviceId: string): Promise<void> {
  if (!deviceId) throw new Error('disconnectDevice(): deviceId must not be empty');

  try {
    const result = await executeAdb(['-s', deviceId, 'disconnect', deviceId]);

    if (result.exitCode !== 0) {
      throw new Error(
        `adb disconnect exited with code ${result.exitCode}: ${result.stderr}`
      );
    }
  } catch (err: unknown) {
    throw new Error(
      `disconnectDevice("${deviceId}") failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. startDevicePolling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts polling `getDevices()` at the given interval and invokes `callback`
 * with the latest device list on every tick.
 *
 * Any errors during a poll tick are silently swallowed to keep polling alive;
 * the callback receives an empty array on failure.
 *
 * @param callback  Function called with the freshest `Device[]` on each tick
 * @param interval  Poll interval in milliseconds (default: 2000)
 * @returns         A `NodeJS.Timeout` handle — pass to `stopDevicePolling` to cancel
 */
export function startDevicePolling(
  callback: (devices: Device[]) => void,
  interval = 2000
): NodeJS.Timeout {
  if (interval < 500) {
    throw new Error('startDevicePolling(): interval must be >= 500 ms to avoid ADB overload');
  }

  // Run the first poll immediately so the UI isn't blank for the first interval
  getDevices()
    .then(callback)
    .catch(() => callback([]));

  const timer = setInterval(async () => {
    try {
      const devices = await getDevices();
      callback(devices);
    } catch {
      // Swallow — device might just be transiently unavailable
      callback([]);
    }
  }, interval);

  return timer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. stopDevicePolling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stops a previously started device polling loop.
 *
 * @param timer  The handle returned by `startDevicePolling`
 */
export function stopDevicePolling(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a raw state string from `adb devices` to a typed DeviceState */
function normaliseState(raw: string): DeviceState {
  const map: Record<string, DeviceState> = {
    device:       'device',
    unauthorized: 'unauthorized',
    offline:      'offline',
    recovery:     'recovery',
    sideload:     'sideload',
  };
  return map[raw.toLowerCase()] ?? 'unknown';
}

/** Parse `key:value key:value …` qualifier tokens into a plain record */
function parseQualifiers(tokens: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) continue;
    const key   = token.slice(0, colonIdx);
    const value = token.slice(colonIdx + 1);
    result[key] = value;
  }
  return result;
}

/**
 * Parse `dumpsys battery` output.
 *
 * Relevant output excerpt:
 *   Current Battery Service state:
 *     AC powered: false
 *     USB powered: true
 *     level: 87
 */
function parseBatteryDumpsys(raw: string): { level: number; isCharging: boolean } {
  let level      = 0;
  let isCharging = false;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim().toLowerCase();

    if (trimmed.startsWith('level:')) {
      const val = parseInt(trimmed.split(':')[1]?.trim() ?? '0', 10);
      if (!isNaN(val)) level = val;
    }

    if (trimmed.startsWith('ac powered:') && trimmed.includes('true')) {
      isCharging = true;
    }

    if (trimmed.startsWith('usb powered:') && trimmed.includes('true')) {
      isCharging = true;
    }

    if (trimmed.startsWith('wireless powered:') && trimmed.includes('true')) {
      isCharging = true;
    }
  }

  return { level, isCharging };
}

/**
 * Parse `df /sdcard` output.
 *
 * Typical output format (Android):
 *   Filesystem      1K-blocks    Used Available Use% Mounted on
 *   /dev/fuse        60340224 5832704  54507520  10% /sdcard
 */
function parseDfOutput(raw: string): { used: string; total: string; percent: string } {
  const fallback = { used: 'N/A', total: 'N/A', percent: 'N/A' };

  const lines = raw.split('\n').filter((l) => l.trim() && !l.startsWith('Filesystem'));
  if (lines.length === 0) return fallback;

  // Collapse consecutive whitespace and split
  const parts = lines[0].trim().split(/\s+/);
  // Expected: [Filesystem, 1K-blocks, Used, Available, Use%, MountedOn]
  if (parts.length < 5) return fallback;

  const totalKb = parseInt(parts[1], 10);
  const usedKb  = parseInt(parts[2], 10);
  const percent = parts[4] ?? 'N/A';

  if (isNaN(totalKb) || isNaN(usedKb)) return fallback;

  return {
    used:    formatKb(usedKb),
    total:   formatKb(totalKb),
    percent,
  };
}

/** Convert kilobytes to a human-readable string (KB / MB / GB) */
function formatKb(kb: number): string {
  if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`;
  if (kb >= 1_024)     return `${(kb / 1_024).toFixed(1)} MB`;
  return `${kb} KB`;
}
