declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const content: any;
  export default content;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

interface ElectronStreamingStatus {
  streaming: boolean;
  deviceId?: string;
  error?: boolean;
  message?: string;
}

interface ElectronAPI {
  openExternal: (url: string) => void;
  getDevices: () => Promise<Array<{ id: string; name: string }>>;
  checkScrcpyAdb?: () => Promise<boolean>;
  checkScrcpyStatus?: () => Promise<'ready' | 'missing-adb' | 'missing-scrcpy'>;
  startStreaming: (deviceId?: string) => void;
  stopStreaming: () => void;
  onStreamingStatus: (cb: (status: ElectronStreamingStatus) => void) => () => void;
  onDevicesUpdated?: (cb: (list: Array<{ id: string; name: string }>) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    electronAPI?: ElectronAPI;
  }
}

export {};
