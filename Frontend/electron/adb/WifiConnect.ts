import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { ADB_PATH, SCRCPY_PATH } from '../main.js';

let wifiScrcpyProcess: ChildProcess | null = null;
let lastIp: string | null = null;

export async function enableTcpMode(deviceId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ADB_PATH, ['-s', deviceId, 'tcpip', '5555']);
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    
    const timeout = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);

    proc.on('close', () => {
      clearTimeout(timeout);
      resolve(output.includes('restarting in TCP mode') || output.trim() === '');
    });
  });
}

export async function connectWifi(ip: string): Promise<'connected' | 'already' | 'failed'> {
  return new Promise((resolve) => {
    // Ensure we include the port
    const target = ip.includes(':') ? ip : `${ip}:5555`;
    const proc = spawn(ADB_PATH, ['connect', target]);
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    
    const timeout = setTimeout(() => {
      proc.kill();
      console.error(`[WiFi] Connection to ${target} timed out.`);
      resolve('failed');
    }, 12000); // Increased timeout for slow networks

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const res = output.toLowerCase();
      if (res.includes('connected to')) return resolve('connected');
      if (res.includes('already connected')) return resolve('already');
      
      console.error(`[WiFi] Connection failed to ${target}. Output: ${output}`);
      resolve('failed');
    });
  });
}

export async function startWifiMirror(
  ip: string,
  settings: { resolution: number; bitrate: number; fps: number },
  onLog: (line: string) => void
): Promise<boolean> {
  const conn = await connectWifi(ip);
  if (conn === 'failed') return false;

  lastIp = ip;
  const scrcpyPath = SCRCPY_PATH;

  const args = [
    '--serial', `${ip}:5555`,
    '--max-size', String(settings.resolution),
    '--video-bit-rate', `${settings.bitrate}M`,
    '--max-fps', String(settings.fps),
    '--video-codec', 'h264',
    '--no-audio',
    '--stay-awake',
    '--power-off-on-close',
    '--shortcut-mod', 'lctrl',
    '--window-title', `StremFusion WiFi — ${ip}`
  ];

  onLog(`Starting WiFi Mirror: ${ip}`);

  return new Promise((resolve) => {
    wifiScrcpyProcess = spawn(scrcpyPath, args, {
      env: { ...process.env, ADB: ADB_PATH }
    });

    wifiScrcpyProcess.stdout?.on('data', d => onLog(`[WiFi] ${d.toString()}`));
    wifiScrcpyProcess.stderr?.on('data', d => onLog(`[WiFi ERR] ${d.toString()}`));

    setTimeout(() => {
      if (wifiScrcpyProcess && !wifiScrcpyProcess.killed) resolve(true);
      else resolve(false);
    }, 1000);
  });
}

export async function stopWifiMirror(): Promise<void> {
  if (wifiScrcpyProcess) {
    wifiScrcpyProcess.kill();
    wifiScrcpyProcess = null;
  }
  if (lastIp) {
    spawn(ADB_PATH, ['disconnect', `${lastIp}:5555`]);
  }
}
