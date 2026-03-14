import mdns from 'mdns-js';

// ─────────────────────────────────────────────────────────────────────────────
// StremFusion v2.0 — mDNS Device Scanner
//
// Listens for Android Wireless Debugging mDNS advertisements:
//   _adb-tls-pairing._tcp  → device is in "Pair with code" mode
//   _adb-tls-connect._tcp  → device has ADB wireless debugging enabled
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceType = 'pairing' | 'connect';

export interface DiscoveredService {
  ip: string;
  port: number;
  type: ServiceType;
  host?: string;
}

type ScanCallback = (ip: string, port: number, type: ServiceType) => void;

// Active browser handles — one per service type
let pairingBrowser: ReturnType<typeof mdns.createBrowser> | null = null;
let connectBrowser: ReturnType<typeof mdns.createBrowser> | null = null;
let mdnsAvailable = true;

// ─────────────────────────────────────────────────────────────────────────────
// 1. startMdnsScan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts scanning the local network for Android Wireless Debugging mDNS services.
 *
 * Two service types are monitored concurrently:
 * - `_adb-tls-pairing._tcp` — device is waiting for a pairing code
 * - `_adb-tls-connect._tcp` — device is ready to accept ADB connections
 *
 * If mDNS is unavailable (no Bonjour/Avahi on the host), an error is logged and
 * the function returns without throwing, allowing callers to fall back gracefully.
 *
 * @param onFound  Called whenever a matching service is discovered
 */
export function startMdnsScan(onFound: ScanCallback): void {
  // If a previous scan is still running, stop it first
  stopMdnsScan();
  mdnsAvailable = true;

  try {
    // ── Pairing browser ──────────────────────────────────────────────────────
    pairingBrowser = mdns.createBrowser(mdns.tcp('adb-tls-pairing'));

    pairingBrowser.on('ready', () => {
      pairingBrowser?.discover();
    });

    pairingBrowser.on('update', (data: mdns.ServiceData) => {
      const { ip, port } = extractServiceData(data);
      if (ip && port) {
        console.log(`[Scanner] Pairing service found: ${ip}:${port}`);
        onFound(ip, port, 'pairing');
      }
    });

    pairingBrowser.on('error', (err: Error) => {
      console.warn('[Scanner] Pairing browser error:', err.message);
      handleMdnsError(err);
    });

    pairingBrowser.start();

    // ── Connect browser ──────────────────────────────────────────────────────
    connectBrowser = mdns.createBrowser(mdns.tcp('adb-tls-connect'));

    connectBrowser.on('ready', () => {
      connectBrowser?.discover();
    });

    connectBrowser.on('update', (data: mdns.ServiceData) => {
      const { ip, port } = extractServiceData(data);
      if (ip && port) {
        console.log(`[Scanner] Connect service found: ${ip}:${port}`);
        onFound(ip, port, 'connect');
      }
    });

    connectBrowser.on('error', (err: Error) => {
      console.warn('[Scanner] Connect browser error:', err.message);
      handleMdnsError(err);
    });

    connectBrowser.start();

    console.log('[Scanner] mDNS scan started — listening for ADB wireless services');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Scanner] Failed to initialise mDNS scanner:', msg);
    mdnsAvailable = false;
    // Intentionally do NOT rethrow — callers must handle unavailability gracefully
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. stopMdnsScan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stops all active mDNS browser instances and releases their resources.
 * Safe to call even if no scan is currently running.
 */
export function stopMdnsScan(): void {
  try {
    pairingBrowser?.stop();
    connectBrowser?.stop();
  } catch (err: unknown) {
    console.warn('[Scanner] Error while stopping mDNS browsers:', err);
  } finally {
    pairingBrowser = null;
    connectBrowser = null;
  }
}

/**
 * Returns whether mDNS is available on this host.
 * Call after `startMdnsScan()` — if false, switch to manual IP entry mode.
 */
export function isMdnsAvailable(): boolean {
  return mdnsAvailable;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the first usable IPv4 address and port from an mDNS service record */
function extractServiceData(data: mdns.ServiceData): { ip: string | null; port: number | null } {
  // `addresses` may contain IPv4 and IPv6 — prefer IPv4
  const ip =
    data.addresses?.find((a: string) => isIPv4(a)) ??
    data.addresses?.[0] ??
    null;

  const port = typeof data.port === 'number' ? data.port : null;

  return { ip, port };
}

function isIPv4(address: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(address);
}

function handleMdnsError(err: Error): void {
  // Treat certain fatal errors as "mDNS not available"
  const fatalPhrases = ['ENOENT', 'not found', 'ETIMEDOUT', 'initializ'];
  if (fatalPhrases.some((phrase) => err.message.toLowerCase().includes(phrase.toLowerCase()))) {
    mdnsAvailable = false;
    console.warn('[Scanner] mDNS appears unavailable on this host — manual IP mode required');
  }
}
