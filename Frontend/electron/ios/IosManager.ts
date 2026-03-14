import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { IOS_BIN_PATH, SCRCPY_PATH } from '../main.js';

export class IosManager {
  private getCommandPath(cmdName: string): string {
    const binName = process.platform === 'win32' ? `${cmdName}.exe` : cmdName;
    const fullPath = path.join(IOS_BIN_PATH, binName);
    return fs.existsSync(fullPath) ? fullPath : cmdName;
  }

  /**
   * Detects connected iOS devices via idevice_id.
   * Returns a list of UDIDs or throws a specific error if drivers are missing.
   */
  public async detectIosDevices(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const executable = this.getCommandPath('idevice_id');
      const proc = spawn(executable, ['-l']);
      let output = '';
      
      proc.stdout.on('data', d => output += d.toString());
      
      proc.on('error', (err: any) => {
        if (err.code === 'ENOENT') {
          reject(new Error("iOS Drivers (libimobiledevice) not found on System PATH. Please install them to use iOS mirroring."));
        } else {
          reject(err);
        }
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve([]); // Likely no devices
          return;
        }
        resolve(output.split('\n').map(l => l.trim()).filter(Boolean));
      });
    });
  }

  /**
   * Retrieves basic info for an iOS device.
   */
  public async getIosDeviceInfo(udid: string): Promise<{ name: string, version: string } | null> {
    const executable = this.getCommandPath('ideviceinfo');
    const nameTask = new Promise<string>(r => {
      const p = spawn(executable, ['-u', udid, '-k', 'DeviceName']);
      p.stdout.on('data', d => r(d.toString().trim()));
      p.on('error', () => r('Unknown'));
    });
    const versionTask = new Promise<string>(r => {
      const p = spawn(executable, ['-u', udid, '-k', 'ProductVersion']);
      p.stdout.on('data', d => r(d.toString().trim()));
      p.on('error', () => r('Unknown'));
    });

    const [name, version] = await Promise.all([nameTask, versionTask]);
    return { name, version };
  }

  /**
   * Starts mirroring for iOS.
   */
  public async startIosMirror(udid: string, onLog?: (line: string) => void): Promise<boolean> {
    return new Promise((resolve) => {
      onLog?.(`Initiating iOS Mirror Link for ${udid}...`);
      
      // Attempt 1: Scrcpy v3+ Experimental iOS Support
      const args = [
        '--serial', udid,
        '--video-codec', 'h264',
        '--no-audio',
        '--window-title', `StremFusion iOS — ${udid}`
      ];

      onLog?.(`Executing Scrcpy: ${SCRCPY_PATH} ${args.join(' ')}`);
      
      const scrcpy = spawn(SCRCPY_PATH, args);
      
      scrcpy.stdout?.on('data', d => onLog?.(`[iOS] ${d.toString()}`));
      scrcpy.stderr?.on('data', d => onLog?.(`[iOS ERR] ${d.toString()}`));

      scrcpy.on('error', (err) => {
        onLog?.(`Failed to launch iOS Mirror: ${err.message}`);
        resolve(false);
      });

      // If it stays alive for 2 seconds, consider it started
      const startTimer = setTimeout(() => {
        onLog?.(`iOS Mirror Link established.`);
        resolve(true);
      }, 2000);

      scrcpy.on('close', (code) => {
        clearTimeout(startTimer);
        onLog?.(`iOS Mirror Link closed (Code: ${code})`);
        resolve(false);
      });
    });
  }
  /**
   * Lists files in an iOS directory using afc-client.
   */
  public async listIosDirectory(udid: string, dir: string): Promise<any[]> {
    return new Promise((resolve) => {
      const exec = this.getCommandPath('afc-client');
      const proc = spawn(exec, ['-u', udid, 'ls', dir]);
      let output = '';
      
      proc.stdout.on('data', d => output += d.toString());
      proc.on('close', () => {
        const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
        const entries = lines.map(name => ({
          name,
          type: name.includes('.') ? 'file' : 'folder', // Rough estimate for iOS
          size: 'N/A',
          extension: name.split('.').pop() || '',
        }));
        resolve(entries);
      });
      proc.on('error', () => resolve([]));
    });
  }

  public async pullIosFile(udid: string, remotePath: string, localPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const bin = this.getCommandPath('afc-client');
      const proc = spawn(bin, ['-u', udid, 'get', remotePath, localPath]);
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  public async pushIosFile(udid: string, localPath: string, remotePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const bin = this.getCommandPath('afc-client');
      const proc = spawn(bin, ['-u', udid, 'put', localPath, remotePath]);
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  public async deleteIosFile(udid: string, remotePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const bin = this.getCommandPath('afc-client');
      const proc = spawn(bin, ['-u', udid, 'rm', remotePath]);
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  public async createIosFolder(udid: string, remotePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const bin = this.getCommandPath('afc-client');
      const proc = spawn(bin, ['-u', udid, 'mkdir', remotePath]);
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }
}

export const iosManager = new IosManager();
