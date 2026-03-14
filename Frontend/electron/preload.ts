import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Device & ADB
  getDevices: () => ipcRenderer.invoke('adb:get-devices'),
  getDeviceInfo: (id: string) => ipcRenderer.invoke('adb:device-info', id),
  disconnectDevice: (id: string) => ipcRenderer.invoke('adb:disconnect', id),
  
  // Wi-Fi
  startPairing: () => ipcRenderer.invoke('wifi:start-pairing'),
  connectWifi: (ip: string, port?: number) => ipcRenderer.invoke('wifi:connect', { ip, port }),
  stopWifi: () => ipcRenderer.invoke('wifi:stop'),
  enableTcpMode: (deviceId: string) => ipcRenderer.invoke('wifi:enable-tcp', { deviceId }),
  startWifiMirror: (ip: string, settings: any) => ipcRenderer.invoke('wifi:start-mirror', { ip, settings }),
  stopWifiMirror: () => ipcRenderer.invoke('wifi:stop-mirror'),
  
  // Recording
  startRecording: (deviceId: string, settings: any) => ipcRenderer.invoke('recording:start', { deviceId, settings }),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  takeScreenshot: (deviceId: string) => ipcRenderer.invoke('recording:screenshot', { deviceId }),
  startCameraCapture: (deviceId: string) => ipcRenderer.invoke('recording:camera', { deviceId }),
  startVideoCapture: (deviceId: string) => ipcRenderer.invoke('recording:video', { deviceId }),

  // OBS
  obsConnect: (host: string, port: number, password?: string) => ipcRenderer.invoke('obs:connect', { host, port, password }),
  obsInjectScene: (deviceName: string) => ipcRenderer.invoke('obs:inject-scene', { deviceName }),
  obsDisconnect: () => ipcRenderer.invoke('obs:disconnect'),
  obsStatus: () => ipcRenderer.invoke('obs:status'),

  // iOS
  detectIosDevices: () => ipcRenderer.invoke('ios:detect'),
  getIosInfo: (udid: string) => ipcRenderer.invoke('ios:info', { udid }),
  startIosMirror: (udid: string) => ipcRenderer.invoke('ios:mirror', { udid }),

  // Streaming
  startStream: (deviceId: string, settings: any) => ipcRenderer.invoke('stream:start', { deviceId, settings }),
  stopStream: () => ipcRenderer.invoke('stream:stop'),
  getStreamStatus: () => ipcRenderer.invoke('stream:status'),
  
  // File Transfer
  pushFile: (localPath: string, devicePath: string) => ipcRenderer.invoke('file:push', { localPath, devicePath }),
  pullFile: (devicePath: string, localPath: string) => ipcRenderer.invoke('file:pull', { devicePath, localPath }),
  deleteFile: (devicePath: string) => ipcRenderer.invoke('file:rm', { devicePath }),
  createFolder: (devicePath: string) => ipcRenderer.invoke('file:mkdir', { devicePath }),
  openFile: (devicePath: string) => ipcRenderer.invoke('file:open', { devicePath }),
  listDeviceFiles: (path: string) => ipcRenderer.invoke('file:ls', { path }),
  listLocalFiles: (path: string) => ipcRenderer.invoke('fs:ls', { path }),
  getLocalDrives: () => ipcRenderer.invoke('fs:drives'),
  
  // Clipboard
  syncClipboard: (text: string) => ipcRenderer.invoke('clipboard:set', { text }),
  
  // Events (main -> renderer)
  onDeviceUpdate: (cb: (data: any[]) => void) => {
    ipcRenderer.on('device:update', (_event, data) => cb(data));
  },
  onLogEntry: (cb: (data: any) => void) => {
    ipcRenderer.on('log:entry', (_event, data) => cb(data));
  },
  onTransferProgress: (cb: (data: any) => void) => {
    ipcRenderer.on('transfer:progress', (_event, data) => cb(data));
  },
  onPairingCode: (cb: (code: string) => void) => {
    ipcRenderer.on('wifi:pairing-code', (_event, code) => cb(code));
  },
  
  // System
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  setLaunchOnStartup: (enabled: boolean) => ipcRenderer.invoke('app:set-startup', enabled),
  saveSetting: (key: string, value: any) => ipcRenderer.invoke('settings:save', { key, value }),
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  completeOnboarding: () => ipcRenderer.invoke('settings:onboarding-done'),
  onShowOnboarding: (cb: () => void) => {
    ipcRenderer.on('show-onboarding', () => cb());
  },
});
