import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const api = {
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  getDevices: () => ipcRenderer.invoke('get-devices'),
  checkScrcpyAdb: () => ipcRenderer.invoke('check-scrcpy-adb'),
  checkScrcpyStatus: () => ipcRenderer.invoke('check-scrcpy-status'),
  startStreaming: (deviceId?: string) => ipcRenderer.send('start-streaming', deviceId),
  stopStreaming: () => ipcRenderer.send('stop-streaming'),
  onStreamingStatus: (callback: (status: { streaming: boolean; deviceId?: string; error?: boolean; message?: string }) => void) => {
    const handler = (_event: IpcRendererEvent, status: { streaming: boolean; deviceId?: string; error?: boolean; message?: string }) => callback(status);
    ipcRenderer.on('streaming-status', handler);
    return () => ipcRenderer.removeListener('streaming-status', handler);
  },
  onDevicesUpdated: (cb: (list: Array<{ id: string; name: string }>) => void) => {
    const handler = (_event: IpcRendererEvent, list: Array<{ id: string; name: string }>) => cb(list);
    ipcRenderer.on('devices-updated', handler);
    return () => ipcRenderer.removeListener('devices-updated', handler);
  },
  // System status: emits full system status object as described in docs
  onSystemStatus: (cb: (status: any) => void) => {
    const handler = (_event: IpcRendererEvent, status: any) => cb(status);
    ipcRenderer.on('system-status', handler);
    return () => ipcRenderer.removeListener('system-status', handler);
  },
  getSystemStatus: () => ipcRenderer.invoke('get-system-status')
};

contextBridge.exposeInMainWorld('electron', api);
// Also expose under legacy/alternate name `electronAPI` so renderer code
// that expects `window.electronAPI` won't crash.
contextBridge.exposeInMainWorld('electronAPI', api);
