import { executeAdb } from './AdbController.js';

// ─────────────────────────────────────────────────────────────────────────────
// StremFusion v2.0 — ADB Pairing Manager
//
// Handles the one-time pairing flow for Android 11+ Wireless Debugging and
// subsequent TCP/IP connection management.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. generatePairingCode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random 6-digit pairing code.
 *
 * Uses `crypto.getRandomValues` (available in Node 15+) to avoid the
 * predictability of `Math.random()`.
 *
 * @returns  A zero-padded 6-digit string, e.g. `"047821"`
 */
export function generatePairingCode(): string {
  // Generate a value in [100000, 999999] for guaranteed 6 digits
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = 100_000 + (array[0] % 900_000);
  return code.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. pairDevice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempts to pair with an Android device using Wireless Debugging.
 *
 * Runs: `adb pair [ip]:[port] [code]`
 *
 * ADB stdout on success contains the phrase "Successfully paired".
 * ADB stdout/stderr on failure contains phrases like "Failed to pair",
 * "error: failed", or a non-zero exit code.
 *
 * @param ip    IPv4 address of the device
 * @param port  Pairing port (shown in Android's Wireless Debugging screen)
 * @param code  6-digit code displayed in the StremFusion UI
 * @returns     `true` if pairing succeeded, `false` otherwise
 * @throws      On ADB execution failure (binary not found, timeout, etc.)
 */
export async function pairDevice(
  ip: string,
  port: number,
  code: string
): Promise<boolean> {
  validateIpPort(ip, port);

  if (!code || !/^\d{6}$/.test(code)) {
    throw new Error(`pairDevice(): code must be a 6-digit string, got "${code}"`);
  }

  try {
    const result = await executeAdb(['pair', `${ip}:${port}`, code], {
      timeoutMs: 30_000, // Pairing can take longer than normal commands
    });

    const combined = (result.stdout + result.stderr).toLowerCase();

    if (combined.includes('successfully paired')) {
      console.log(`[Pairing] Successfully paired with ${ip}:${port}`);
      return true;
    }

    // Log the failure reason for diagnostics
    console.warn(
      `[Pairing] Pairing failed for ${ip}:${port} — exitCode=${result.exitCode}`,
      `\nstdout: ${result.stdout}`,
      `\nstderr: ${result.stderr}`
    );
    return false;
  } catch (err: unknown) {
    throw new Error(
      `pairDevice(${ip}:${port}) failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. connectToDevice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connects to a previously-paired Android device over TCP/IP.
 *
 * Runs: `adb connect [ip]:[port]`
 *
 * ADB stdout on success: `"connected to 192.168.1.5:5555"`
 * ADB stdout when already connected: `"already connected to 192.168.1.5:5555"`
 * ADB stdout on failure: `"failed to connect to …"` or `"error: …"`
 *
 * @param ip    IPv4 address of the device
 * @param port  Port to connect on (default ADB port is 5555)
 * @returns     ADB device ID string (e.g. `"192.168.1.5:5555"`) on success, `null` on failure
 * @throws      On ADB execution failure
 */
export async function connectToDevice(
  ip: string,
  port: number
): Promise<string | null> {
  validateIpPort(ip, port);

  const target = `${ip}:${port}`;

  try {
    const result = await executeAdb(['connect', target], {
      timeoutMs: 15_000,
    });

    const combined = (result.stdout + result.stderr).toLowerCase();

    if (
      combined.includes('connected to') ||
      combined.includes('already connected to')
    ) {
      console.log(`[Pairing] Connected to device: ${target}`);
      return target; // The ADB device ID for Wi-Fi connections is ip:port
    }

    console.warn(
      `[Pairing] Connection failed for ${target}`,
      `\nstdout: ${result.stdout}`,
      `\nstderr: ${result.stderr}`
    );
    return null;
  } catch (err: unknown) {
    throw new Error(
      `connectToDevice(${target}) failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateIpPort(ip: string, port: number): void {
  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    throw new Error(`Invalid IP address: "${ip}"`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
}
