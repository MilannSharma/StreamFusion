// ─────────────────────────────────────────────────────────────────────────────
// StremFusion v2.0 — ADB Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Possible states reported by `adb devices -l`
 */
export type DeviceState =
  | 'device'        // Connected and authorised
  | 'unauthorized'  // USB debugging not authorised on device
  | 'offline'       // ADB sees device but it is offline
  | 'recovery'      // Device in recovery mode
  | 'sideload'      // Performing adb sideload
  | 'unknown';      // Any unrecognised state string

/**
 * A single entry from `adb devices -l`
 */
export interface Device {
  /** ADB serial / transport identifier, e.g. "emulator-5554" or "192.168.1.5:5555" */
  id: string;

  /** Device state as reported by ADB */
  state: DeviceState;

  /** Short model name, e.g. "Pixel_6" (from the `model:` qualifier) */
  model: string;

  /** Product name, e.g. "oriole" (from the `product:` qualifier) */
  product: string;

  /** Numeric transport ID assigned by the ADB server (from `transport_id:` qualifier) */
  transport_id: string;
}

/**
 * Storage information for the device's /sdcard partition
 */
export interface StorageInfo {
  /** Used storage in human-readable form, e.g. "12.3 GB" */
  used: string;

  /** Total storage in human-readable form, e.g. "64.0 GB" */
  total: string;

  /** Usage as a percentage string, e.g. "19%" */
  percent: string;
}

/**
 * Rich device information gathered from multiple `adb shell getprop` calls
 */
export interface DeviceInfo {
  /** ADB serial / transport identifier, e.g. "R3CR205AABC" */
  id: string;

  /** Friendly display name (manufacturer + model), e.g. "Google Pixel 6" */
  name: string;

  /** Android model name, e.g. "Pixel 6" */
  model: string;

  /** Device manufacturer, e.g. "Google" */
  manufacturer: string;

  /** Android version string, e.g. "13" */
  version: string;

  /** Battery level as a percentage integer (0–100) */
  battery: number;

  /** Whether the device is currently charging */
  isCharging: boolean;

  /** Internal storage usage for /sdcard */
  storage: StorageInfo;
}

/**
 * Raw result from spawning an ADB subprocess
 */
export interface AdbResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Options for customising executeAdb behaviour
 */
export interface AdbExecOptions {
  /** Timeout in milliseconds. Defaults to 10 000 ms. */
  timeoutMs?: number;
}

/**
 * Context object passed to the polling callback
 */
export interface PollingContext {
  /** The active Node timer handle (use with stopDevicePolling) */
  timer: NodeJS.Timeout;

  /** Whether polling is currently active */
  active: boolean;
}
