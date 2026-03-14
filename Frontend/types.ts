// Global types for StremFusion v2.0

export type ViewType = 'connection' | 'mirror' | 'files' | 'network' | 'info' | 'settings';

export interface FileEntry {
  name: string;
  type: 'file' | 'folder' | 'drive';
  size?: string;
  extension?: string;
  permissions?: string;
  modified?: string;
}

export interface FileItem extends FileEntry {}

export interface TransferProgress {
  percent: number;
  speed: string;
  totalSize: number;
  transferred: number;
  fileName: string;
  type: 'push' | 'pull';
}

export interface AppSettings {
  scrcpyResolution: number;
  scrcpyBitrate: number;
  scrcpyFps: number;
  obsHost: string;
  obsPort: number;
  obsPassword?: string;
  theme: 'dark' | 'light';
}

export interface DeviceInfoData {
  name: string;
  model: string;
  version: string;
  battery: number;
  isCharging: boolean;
  storage: { used: string; total: string; percent: string }; // Matches AdbController output
  manufacturer: string;
}

export type CameraMode = 'none' | 'fullscreen' | 'corner-left' | 'corner-right';
export type CameraFrame = 'box' | 'circle';

export interface CameraSettings {
  mode: CameraMode;
  frame: CameraFrame;
}

export interface DeviceStatus {
  androidConnected: boolean;
  iosConnected: boolean;
  usbDebugging: boolean;
  currentDevice?: DeviceInfoData;
}

export interface ObsStatus {
  connected: boolean;
  sources: {
    screen: boolean;
    audio: boolean;
  };
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'error' | 'success' | 'warning';
  message: string;
}

export interface BackendStatus {
  isOnline: boolean;
  streaming: boolean;
  device: DeviceStatus;
  obs: ObsStatus;
}

// IPC Device shape (from electron/adb/types.ts)
export interface IpcDevice {
  id: string;
  state: 'device' | 'unauthorized' | 'offline' | 'recovery' | 'sideload' | 'unknown';
  model: string;
  product: string;
  transport_id: string;
}

// ============================================================================
// Global Window Electron API Definition
// ============================================================================

export interface MirrorSettings {
  resolution: number;
  bitrate: number;
  fps: number;
  turnScreenOff: boolean;
}

export interface ElectronAPI {
  // Device & ADB
  getDevices: () => Promise<IpcDevice[]>;
  getDeviceInfo: (id: string) => Promise<DeviceInfoData>;
  disconnectDevice: (id: string) => Promise<void>;
    // Wi-Fi
  startPairing: () => Promise<void>;
  connectWifi: (ip: string, port?: number) => Promise<string | boolean>;
  stopWifi: () => Promise<void>;
  enableTcpMode: (deviceId: string) => Promise<boolean>;
  startWifiMirror: (ip: string, settings: any) => Promise<void>;
  stopWifiMirror: () => Promise<void>;
  
  // Recording
  startRecording: (deviceId: string, settings: any) => Promise<void>;
  stopRecording: () => Promise<void>;
  takeScreenshot: (deviceId: string) => Promise<string>;
  startCameraCapture: (deviceId: string) => Promise<void>;
  startVideoCapture: (deviceId: string) => Promise<void>;

  // OBS
  obsConnect: (host: string, port: number, password?: string) => Promise<boolean>;
  obsInjectScene: (deviceName: string) => Promise<void>;
  obsDisconnect: () => Promise<void>;
  obsStatus: () => Promise<boolean>;

  // iOS
  detectIosDevices: () => Promise<string[]>;
  getIosInfo: (udid: string) => Promise<any>;
  startIosMirror: (udid: string) => Promise<void>;
  
  // Streaming
  startStream: (deviceId: string, settings: any) => Promise<void>;
  stopStream: () => Promise<void>;
  getStreamStatus: () => Promise<{ streaming: boolean; deviceId: string | null }>;
  
  // File Transfer
  pushFile: (localPath: string, devicePath: string) => Promise<boolean>;
  pullFile: (devicePath: string, localPath: string) => Promise<boolean>;
  deleteFile: (devicePath: string) => Promise<boolean>;
  createFolder: (devicePath: string) => Promise<boolean>;
  openFile: (devicePath: string) => Promise<boolean>;
  listDeviceFiles: (path: string) => Promise<FileEntry[]>;
  listLocalFiles: (path: string) => Promise<FileItem[]>;
  getLocalDrives: () => Promise<FileItem[]>;
  
  // Clipboard
  syncClipboard: (text: string) => Promise<void>;

  // Events
  onDeviceUpdate: (callback: (devices: IpcDevice[]) => void) => void;
  onLogEntry: (callback: (entry: LogEntry) => void) => void;
  onTransferProgress: (callback: (data: TransferProgress) => void) => void;
  onPairingCode: (callback: (code: string) => void) => void;
  
  // System
  openExternal: (url: string) => void;
  setLaunchOnStartup: (enabled: boolean) => Promise<boolean>;
  saveSetting: (key: string, value: any) => Promise<boolean>;
  getSetting: (key: string) => Promise<any>;
  completeOnboarding: () => Promise<boolean>;
  onShowOnboarding: (callback: () => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
