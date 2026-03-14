import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { executeAdb, getAdbPath } from '../adb/AdbController.js';

export interface MirrorSettings {
  resolution: number;
  bitrate: number;
  fps: number;
  turnScreenOff: boolean;
  hideNavBar?: boolean;
}

export class ScrcpyManager {
  private scrcpyProcess: ChildProcess | null = null;
  private running = false;
  private currentDeviceId: string | null = null;

  public getScrcpyPath(): string {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      // In development, reach back to the original Tools directory
      return path.resolve(__dirname, '../../../../Backend/Tools/scrcpy-win64-v3.3.3/scrcpy.exe');
    }
    // In production, electron-builder bundles extraResources into process.resourcesPath
    return path.join(process.resourcesPath, 'scrcpy', 'scrcpy.exe');
  }

  public async startMirror(
    deviceId: string,
    settings: MirrorSettings,
    onLog: (line: string) => void
  ): Promise<boolean> {
    if (this.running) {
      await this.stopMirror();
    }

    const scrcpyPath = this.getScrcpyPath();
    if (!fs.existsSync(scrcpyPath)) {
      throw new Error(`scrcpy.exe not found at path: ${scrcpyPath}. Make sure the binaries are bundled correctly.`);
    }

    this.currentDeviceId = deviceId;

    const args = [
      '--serial', deviceId,
      '--max-size', String(settings.resolution),
      '--video-bit-rate', `${settings.bitrate}M`,
      '--max-fps', String(settings.fps),
      '--window-title', `StremFusion Mirror — ${deviceId}`,
      '--stay-awake',
      '--power-off-on-close',
      '--shortcut-mod', 'lctrl',
      '--video-codec', 'h264',
      '--no-audio', // Add option later if needed, reduces initial lag
    ];

    if (settings.turnScreenOff) {
      args.push('--turn-screen-off');
    }

    if (settings.hideNavBar) {
      // --window-borderless removes the title bar. 
      // --display-cutout-mode hide helps with notch/hole punch display issues.
      args.push('--window-borderless', '--display-cutout-mode', 'hide');
    }

    onLog(`Starting scrcpy with flags: ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      try {
        this.scrcpyProcess = spawn(scrcpyPath, args, {
          env: {
            ...process.env,
            ADB: getAdbPath(), // Tell scrcpy which adb to use to avoid mismatches
          }
        });

        this.running = true;

        this.scrcpyProcess.stdout?.on('data', (data) => {
          const lines = data.toString().split('\n');
          lines.forEach((line: string) => {
            if (line.trim()) onLog(`[Scrcpy] ${line.trim()}`);
          });
        });

        this.scrcpyProcess.stderr?.on('data', (data) => {
          const lines = data.toString().split('\n');
          lines.forEach((line: string) => {
            if (line.trim()) onLog(`[Scrcpy ERR] ${line.trim()}`);
          });
        });

        this.scrcpyProcess.on('error', (err) => {
          this.running = false;
          this.currentDeviceId = null;
          onLog(`[Scrcpy ERROR] Process failed to spawn or crashed: ${err.message}`);
          reject(err);
        });

        this.scrcpyProcess.on('close', (code) => {
          this.running = false;
          this.currentDeviceId = null;
          this.scrcpyProcess = null;
          onLog(`[Scrcpy] Process exited with code ${code}`);
        });

        // Wait 1 second to ensure it doesn't immediately crash (e.g., adb disconnect)
        setTimeout(() => {
          if (this.running) {
            resolve(true);
          } else {
            resolve(false);
          }
        }, 1000);
      } catch (err) {
        this.running = false;
        this.currentDeviceId = null;
        reject(err);
      }
    });
  }

  public async stopMirror(): Promise<void> {
    if (this.scrcpyProcess && this.running) {
      return new Promise((resolve) => {
        this.scrcpyProcess!.once('close', () => {
          this.running = false;
          this.currentDeviceId = null;
          this.scrcpyProcess = null;
          resolve();
        });
        // Send SIGTERM, if Windows, standard kill
        this.scrcpyProcess!.kill();
      });
    }
  }

  public isScrcpyRunning(): boolean {
    return this.running;
  }

  public getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }

  public async pushFileDuringSession(localPath: string): Promise<boolean> {
    if (!this.running || !this.currentDeviceId) {
      throw new Error('Cannot push file: No active mirror session.');
    }

    try {
      const result = await executeAdb([
        '-s', this.currentDeviceId,
        'push', localPath, '/sdcard/StremFusion/'
      ]);
      return result.exitCode === 0;
    } catch (e: any) {
      throw new Error(`File push failed: ${e.message}`);
    }
  }
}

// Export a singleton instance
export const scrcpyManager = new ScrcpyManager();
