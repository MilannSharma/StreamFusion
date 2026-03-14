import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ADB_PATH } from '../main.js';
import { executeAdb } from '../adb/AdbController.js';

export interface RecordingSettings {
  fps: number;
  bitrate: number;
  quality: 'low' | 'medium' | 'high';
  saveToDevice: boolean;
  outputDir?: string;
}

export class RecordingManager {
  private ffmpegProcess: ChildProcess | null = null;
  private isRecording: boolean = false;
  private recordingPath: string | null = null;

  private getScrcpyPath(): string {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      return path.resolve(__dirname, '../../../../Backend/Tools/scrcpy-win64-v3.3.3/scrcpy.exe');
    }
    return path.join(process.resourcesPath, 'scrcpy', 'scrcpy.exe');
  }

  public async startScreenRecord(
    deviceId: string,
    settings: RecordingSettings,
    onLog: (line: string) => void
  ): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `StremFusion_Record_${timestamp}.mp4`;
    let outputFile: string;

    if (settings.saveToDevice) {
      outputFile = `/sdcard/StremFusion/${filename}`;
    } else {
      const videoDir = path.join(os.homedir(), 'Videos', 'StremFusion');
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
      }
      outputFile = path.join(videoDir, filename);
    }

    const scrcpyPath = this.getScrcpyPath();
    const bitrates = { low: '4M', medium: '8M', high: '16M' };
    const bitrate = bitrates[settings.quality] || `${settings.bitrate}M`;

    const args = [
      '--serial', deviceId,
      '--record', outputFile,
      '--no-display',
      '--max-fps', String(settings.fps),
      '--video-bit-rate', bitrate,
    ];

    onLog(`Starting Screen Record: ${scrcpyPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      this.ffmpegProcess = spawn(scrcpyPath, args, {
        env: { ...process.env, ADB: ADB_PATH }
      });

      this.isRecording = true;
      this.recordingPath = outputFile;

      this.ffmpegProcess.on('error', (err) => {
        this.isRecording = false;
        reject(err);
      });

      // We resolve immediately because scrcpy --record runs in background
      // and we want to return the path.
      setTimeout(() => {
        if (this.isRecording) {
          resolve(outputFile);
        } else {
          reject(new Error('Failed to start recording process'));
        }
      }, 1000);
    });
  }

  public async stopScreenRecord(): Promise<string> {
    if (!this.ffmpegProcess || !this.isRecording) {
      return this.recordingPath || '';
    }

    return new Promise((resolve) => {
      this.ffmpegProcess!.once('close', () => {
        this.isRecording = false;
        this.ffmpegProcess = null;
        resolve(this.recordingPath || '');
      });
      this.ffmpegProcess!.kill('SIGTERM');
    });
  }

  public async takeScreenshot(deviceId: string): Promise<string> {
    const timestamp = Date.now();
    const pictureDir = path.join(os.homedir(), 'Pictures', 'StremFusion');
    if (!fs.existsSync(pictureDir)) {
      fs.mkdirSync(pictureDir, { recursive: true });
    }
    const outputPath = path.join(pictureDir, `StremFusion_Screenshot_${timestamp}.png`);

    // adb exec-out screencap -p > output.png
    const result = await executeAdb(['-s', deviceId, 'exec-out', 'screencap', '-p']);
    // Since executeAdb captures stdout as string, we might need to handle binary data.
    // However, for simplicity in this project, we'll try to write the buffer.
    // Re-implementing binary capture:
    return new Promise((resolve, reject) => {
      const adbBus = spawn(ADB_PATH, ['-s', deviceId, 'exec-out', 'screencap', '-p']);
      const writeStream = fs.createWriteStream(outputPath);
      adbBus.stdout.pipe(writeStream);
      adbBus.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Screenshot failed with code ${code}`));
      });
    });
  }

  public async startCameraCapture(deviceId: string): Promise<void> {
    await executeAdb(['-s', deviceId, 'shell', 'am', 'start', '-a', 'android.media.action.IMAGE_CAPTURE']);
  }

  public async startVideoCapture(deviceId: string): Promise<void> {
    await executeAdb(['-s', deviceId, 'shell', 'am', 'start', '-a', 'android.media.action.VIDEO_CAPTURE']);
  }
}

export const recordingManager = new RecordingManager();
