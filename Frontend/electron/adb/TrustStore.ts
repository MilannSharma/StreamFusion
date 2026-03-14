import Store from 'electron-store';

// ─────────────────────────────────────────────────────────────────────────────
// StremFusion v2.0 — Trusted Device Store
//
// Persists paired device information using electron-store (backed by a JSON
// file in the user's app data directory, e.g. %APPDATA%/StremFusion/).
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrustedDevice {
  /** ADB device fingerprint — typically the serial or ip:port string */
  fingerprint: string;
  /** Last known IPv4 address */
  ip: string;
  /** Last known ADB connect port */
  lastPort: number;
  /** Device model name, e.g. "Pixel 6" */
  model: string;
  /** ISO 8601 timestamp when the device was first trusted */
  addedAt: string;
  /** ISO 8601 timestamp of the most recent successful connection */
  lastSeenAt?: string;
}

/** Shape of each record stored in the device map (fingerprint is the key) */
type DeviceRecord = Omit<TrustedDevice, 'fingerprint'>;

/** Top-level store schema — single "devices" key holding the full map */
interface StoreSchema {
  devices: Record<string, DeviceRecord>;
}

// ── Store initialisation ─────────────────────────────────────────────────────

const store = new Store<StoreSchema>({
  name: 'trusted-devices',
  defaults: {
    devices: {},
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — read / write the entire devices map atomically
// ─────────────────────────────────────────────────────────────────────────────

function readMap(): Record<string, DeviceRecord> {
  // Use `as any` to bypass TypeScript's inability to resolve the base Conf<T>
  // class methods due to `conf` being an ESM-only package and our tsconfig
  // using 'moduleResolution: node' for CommonJS compatibility.
  return ((store as any).get('devices') as Record<string, DeviceRecord>) || {};
}

function writeMap(map: Record<string, DeviceRecord>): void {
  (store as any).set('devices', map);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. saveDevice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves or updates a trusted device in the persistent store.
 *
 * If a device with this fingerprint already exists, `ip`, `lastPort`, `model`,
 * and `lastSeenAt` are updated while `addedAt` is preserved.
 *
 * @param fingerprint  Unique identifier for the device (serial / ip:port)
 * @param ip           Current IPv4 address
 * @param port         ADB connect port
 * @param model        Human-readable model name
 */
export function saveDevice(
  fingerprint: string,
  ip: string,
  port: number,
  model: string,
): void {
  if (!fingerprint) throw new Error('saveDevice(): fingerprint must not be empty');

  const map     = readMap();
  const now     = new Date().toISOString();
  const existing = map[fingerprint];

  map[fingerprint] = {
    ip,
    lastPort:  port,
    model,
    addedAt:   existing?.addedAt ?? now,
    lastSeenAt: now,
  };

  writeMap(map);
  console.log(`[TrustStore] Saved: ${fingerprint} (${model} @ ${ip}:${port})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getAllTrusted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all trusted devices as a flat array sorted by most recently seen.
 */
export function getAllTrusted(): TrustedDevice[] {
  const map = readMap();

  return Object.entries(map)
    .map(([fingerprint, data]): TrustedDevice => ({ fingerprint, ...data }))
    .sort((a, b) => {
      const timeA = a.lastSeenAt ?? a.addedAt;
      const timeB = b.lastSeenAt ?? b.addedAt;
      return timeB.localeCompare(timeA);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. removeDevice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permanently removes a device from the trusted store.
 * Safe to call even if the fingerprint does not exist.
 */
export function removeDevice(fingerprint: string): void {
  if (!fingerprint) throw new Error('removeDevice(): fingerprint must not be empty');

  const map = readMap();
  if (!(fingerprint in map)) {
    console.warn(`[TrustStore] removeDevice(): "${fingerprint}" not found — no-op`);
    return;
  }

  delete map[fingerprint];
  writeMap(map);
  console.log(`[TrustStore] Removed: ${fingerprint}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. isTrusted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns `true` if the device exists in the trusted store
 */
export function isTrusted(fingerprint: string): boolean {
  return fingerprint in readMap();
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility — update lastSeenAt on successful reconnect
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates the `lastSeenAt` timestamp for a trusted device without changing
 * any other fields. Useful when a device auto-connects on app launch.
 */
export function touchDevice(fingerprint: string): void {
  const map   = readMap();
  const entry = map[fingerprint];
  if (!entry) return;

  map[fingerprint] = { ...entry, lastSeenAt: new Date().toISOString() };
  writeMap(map);
}
