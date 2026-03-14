import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { executeAdb } from '../adb/AdbController.js';

const execAsync = promisify(exec);

export interface FileItem {
  name: string;
  type: 'file' | 'folder' | 'drive';
  size?: string;
  extension?: string;
}

export const fileManager = {
  /**
   * Lists files on the Android device using ADB.
   * Uses 'ls -F' to easily identify directories trailing with /.
   */
  async listDeviceFiles(deviceId: string, remotePath: string): Promise<FileItem[]> {
    try {
      // Use -F to mark directories with / and -l for size (though parsing -l is complex)
      // For simplicity, we'll use -F and query sizes separately if needed, or just -p
      const result = await executeAdb(['-s', deviceId, 'shell', 'ls', '-F', remotePath]);
      if (result.exitCode !== 0) throw new Error(result.stderr || 'ADB ls failed');

      const lines = result.stdout.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('total'));
      
      return lines.map(line => {
        const isDir = line.endsWith('/');
        const name = isDir ? line.slice(0, -1) : line;
        return {
          name,
          type: isDir ? 'folder' : 'file',
          extension: isDir ? undefined : path.extname(name).slice(1).toLowerCase(),
        };
      });
    } catch (error: any) {
      console.error(`LS Device Error (${remotePath}):`, error.message);
      return [];
    }
  },

  /**
   * Pushes a file from PC to Device.
   */
  async pushFile(deviceId: string, localPath: string, remotePath: string): Promise<boolean> {
    const result = await executeAdb(['-s', deviceId, 'push', localPath, remotePath]);
    return result.exitCode === 0;
  },

  /**
   * Pulls a file from Device to PC.
   */
  async pullFile(deviceId: string, remotePath: string, localPath: string): Promise<boolean> {
    const result = await executeAdb(['-s', deviceId, 'pull', remotePath, localPath]);
    return result.exitCode === 0;
  },

  /**
   * Lists Windows drive letters.
   */
  async getLocalDrives(): Promise<FileItem[]> {
    try {
      // wmic logicaldisk get name is still standard on Windows clients
      const { stdout } = await execAsync('wmic logicaldisk get name');
      const drives = stdout.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^[A-Z]:$/.test(line));

      return drives.map(drive => ({
        name: drive + '\\',
        type: 'drive',
        size: 'N/A'
      }));
    } catch (error) {
      // Fallback to common drives if wmic fails
      const common = ['C:\\', 'D:\\', 'E:\\', 'F:\\'];
      const existing = common.filter(d => fs.existsSync(d));
      return existing.map(drive => ({
        name: drive,
        type: 'drive',
        size: 'Local Disk'
      }));
    }
  },

  /**
   * Lists files on the local Windows host.
   */
  async listLocalFiles(localPath: string): Promise<FileItem[]> {
    try {
      const items = fs.readdirSync(localPath, { withFileTypes: true });
      return items.map(item => {
        const fullPath = path.join(localPath, item.name);
        let size = '0 B';
        try {
          if (item.isFile()) {
            const stats = fs.statSync(fullPath);
            size = this.formatSize(stats.size);
          }
        } catch (e) {}

        return {
          name: item.name,
          type: item.isDirectory() ? 'folder' : 'file',
          size: item.isFile() ? size : undefined,
          extension: item.isFile() ? path.extname(item.name).slice(1).toLowerCase() : undefined
        };
      });
    } catch (error) {
      console.error(`LS Local Error (${localPath}):`, error);
      return [];
    }
  },

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};
