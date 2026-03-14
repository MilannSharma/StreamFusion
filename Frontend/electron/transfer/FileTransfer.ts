import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADB_PATH } from '../main.js';

export interface TransferProgress {
  percent: number;
  speed: string;
  totalSize: number;
  transferred: number;
  fileName: string;
  type: 'push' | 'pull';
}

export const fileTransfer = {
  /**
   * Pushes a file from local to device with progress feedback.
   */
  async pushFile(
    localPath: string, 
    devicePath: string = '/sdcard/StremFusion/',
    deviceId: string,
    onProgress: (progress: TransferProgress) => void
  ): Promise<boolean> {
    const totalSize = this.getFileSize(localPath);
    const fileName = path.basename(localPath);
    
    // Ensure device directory exists (silent)
    // We do this via a quick adb shell mkdir
    const adbExe = ADB_PATH;
    
    return new Promise((resolve) => {
      const args = ['-s', deviceId, 'push', localPath, devicePath];
      const proc = spawn(adbExe, args);

      proc.stdout.on('data', (data) => {
        const line = data.toString();
        this.parseProgress(line, totalSize, fileName, 'push', onProgress);
      });

      proc.stderr.on('data', (data) => {
        console.error(`Push error: ${data}`);
      });

      proc.on('close', (code) => {
        resolve(code === 0);
      });
    });
  },

  /**
   * Pulls a file from device to local with progress feedback.
   */
  async pullFile(
    devicePath: string,
    localPath: string = path.join(os.homedir(), 'Downloads', 'StremFusion'),
    deviceId: string,
    onProgress: (progress: TransferProgress) => void
  ): Promise<boolean> {
    const fileName = path.basename(devicePath);
    
    // Ensure local directory exists
    if (!fs.existsSync(path.dirname(localPath))) {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
    }

    const adbExe = ADB_PATH;

    return new Promise((resolve) => {
      const args = ['-s', deviceId, 'pull', devicePath, localPath];
      const proc = spawn(adbExe, args);

      proc.stdout.on('data', (data) => {
        const line = data.toString();
        // For pull, we don't easily know total size without a separate stat call
        // But we can parse speed and bytes from ADB output
        this.parseProgress(line, 0, fileName, 'pull', onProgress);
      });

      proc.on('close', (code) => {
        resolve(code === 0);
      });
    });
  },

  getFileSize(localPath: string): number {
    try {
      return fs.statSync(localPath).size;
    } catch {
      return 0;
    }
  },

  parseProgress(
    line: string, 
    totalSize: number, 
    fileName: string, 
    type: 'push' | 'pull',
    onProgress: (p: TransferProgress) => void
  ) {
    // ADB progress line example: [ 50%] /sdcard/file.zip
    // or finally: /sdcard/file.zip: 1 file pushed. 5.1 MB/s (1000000 bytes in 0.186s)
    
    const percentMatch = line.match(/\[\s*(\d+)%\]/);
    const speedMatch = line.match(/(\d+\.?\d*\s*[KMG]B\/s)/);
    const bytesMatch = line.match(/\((\d+)\s*bytes/);

    if (percentMatch || speedMatch || bytesMatch) {
      const percent = percentMatch ? parseInt(percentMatch[1]) : 0;
      const speed = speedMatch ? speedMatch[1] : '...';
      const transferred = bytesMatch ? parseInt(bytesMatch[1]) : 0;

      onProgress({
        percent,
        speed,
        transferred,
        totalSize: totalSize || transferred, // fallback if pulling
        fileName,
        type
      });
    }
  }
};

function isWindows() {
  return process.platform === 'win32';
}
