import fs from "fs";
import path from "path";
import net from "net";
import { exec } from "child_process";

// TCP Port Sentinel: Tests if a local port has an active listening service
export function checkPortOpen(port, host = '127.0.0.1', timeout = 900) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeout);

    socket.once('connect', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(true);
      }
    });

    socket.once('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.once('error', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
}

// Common Android emulator ADB listening ports
export const COMMON_EMULATOR_PORTS = [
  { port: 5555, name: 'Default ADB / BlueStacks / QEMU' },
  { port: 58526, name: 'Windows Subsystem for Android (WSA)' },
  { port: 62001, name: 'LDPlayer / NoxPlayer (Port 1)' },
  { port: 62025, name: 'LDPlayer / NoxPlayer (Port 2)' },
  { port: 7555, name: 'MuMu Player' },
  { port: 5554, name: 'Android Studio AVD (Console)' },
  { port: 16384, name: 'Genymotion' }
];

export async function scanActiveEmulatorPorts() {
  const active = [];
  for (const item of COMMON_EMULATOR_PORTS) {
    try {
      const isOpen = await checkPortOpen(item.port);
      if (isOpen) {
        active.push({ ...item, open: true });
      }
    } catch (e) {}
  }
  return active;
}

// QEMU availability checker
export async function qemuStatus(emulatorBin) {
  // 1. Check local emulator-bin
  if (fs.existsSync(path.join(emulatorBin, 'qemu-system-x86_64.exe'))) {
    return { available: true, path: path.join(emulatorBin, 'qemu-system-x86_64.exe') };
  }
  // 2. Check standard Windows installation directory
  const defaultWinQemu = 'C:\\Program Files\\qemu\\qemu-system-x86_64.exe';
  if (fs.existsSync(defaultWinQemu)) {
    return { available: true, path: defaultWinQemu };
  }
  // 3. Check system PATH via where.exe
  return new Promise((resolve) => {
    exec('where.exe qemu-system-x86_64', (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        resolve({ available: true, path: stdout.split(/\r?\n/)[0].trim() });
      } else {
        resolve({ available: false, path: null });
      }
    });
  });
}

// Helper: check if emulator process is currently running
export function checkProcessRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq StreamFusionEmulator.exe" /NH', (err, stdout) => {
      if (!err && stdout && stdout.toLowerCase().includes('streamfusionemulator.exe')) {
        return resolve(true);
      }
      exec('tasklist /FI "IMAGENAME eq SoulAndroid.exe" /NH', (err2, stdout2) => {
        if (!err2 && stdout2 && stdout2.toLowerCase().includes('soulandroid.exe')) {
          return resolve(true);
        }
        resolve(false);
      });
    });
  });
}

