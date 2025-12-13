export interface AppSettings {
  scrcpyResolution: number;
  scrcpyBitrate: number; // in Mbps
  scrcpyFps: number;
  obsHost: string;
  obsPort: number;
  obsPassword?: string;
}

export interface DeviceStatus {
  androidConnected: boolean;
  iosConnected: boolean;
  usbDebugging: boolean;
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
