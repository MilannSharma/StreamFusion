import { executeAdb } from '../adb/AdbController.js';
import { FileEntry } from '../../types';

export const fileExplorer = {
  /**
   * Lists directory on device with detailed info.
   */
  async listDirectory(devicePath: string, deviceId: string): Promise<FileEntry[]> {
    try {
      // Use ls -la for detailed info
      const result = await executeAdb(['-s', deviceId, 'shell', 'ls', '-la', devicePath]);
      if (result.exitCode !== 0) {
        if (result.stderr.includes('Permission denied')) {
            throw new Error('Permission denied');
        }
        return [];
      }

      const lines = result.stdout.split(/\r?\n/).filter(line => line.trim());
      const entries: FileEntry[] = [];

      for (const line of lines) {
        // Example: -rw-rw---- 1 root sdcard_rw 123456 2023-01-01 12:00 my_file.zip
        // Example: drwxrwx--- 2 root sdcard_rw 4096 2023-01-01 12:00 my_folder
        const parts = line.split(/\s+/);
        if (parts.length < 8) continue;

        const permissions = parts[0];
        const size = parts[4];
        const modified = `${parts[5]} ${parts[6]}`;
        const name = parts.slice(7).join(' ');

        if (name === '.' || name === '..') continue;

        const isDir = permissions.startsWith('d');
        
        entries.push({
          name,
          type: isDir ? 'folder' : 'file',
          size: isDir ? undefined : this.formatSize(parseInt(size)),
          permissions,
          modified,
          extension: isDir ? undefined : name.split('.').pop()?.toLowerCase()
        });
      }

      return entries;
    } catch (error: any) {
      console.error(`ListDirectory error: ${error.message}`);
      return [];
    }
  },

  /**
   * Deletes a file or folder on device.
   */
  async deleteFile(devicePath: string, deviceId: string): Promise<boolean> {
    const result = await executeAdb(['-s', deviceId, 'shell', 'rm', '-rf', devicePath]);
    return result.exitCode === 0;
  },

  /**
   * Creates a folder on device.
   */
  async createFolder(devicePath: string, deviceId: string): Promise<boolean> {
    const result = await executeAdb(['-s', deviceId, 'shell', 'mkdir', '-p', devicePath]);
    return result.exitCode === 0;
  },

  formatSize(bytes: number): string {
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};
