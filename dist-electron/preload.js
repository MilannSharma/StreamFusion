"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    openExternal: (url) => electron_1.ipcRenderer.send('open-external', url),
    getDevices: () => electron_1.ipcRenderer.invoke('get-devices'),
    checkScrcpyAdb: () => electron_1.ipcRenderer.invoke('check-scrcpy-adb'),
    checkScrcpyStatus: () => electron_1.ipcRenderer.invoke('check-scrcpy-status'),
    startStreaming: (deviceId) => electron_1.ipcRenderer.send('start-streaming', deviceId),
    stopStreaming: () => electron_1.ipcRenderer.send('stop-streaming'),
    onStreamingStatus: (callback) => {
        const handler = (_event, status) => callback(status);
        electron_1.ipcRenderer.on('streaming-status', handler);
        return () => electron_1.ipcRenderer.removeListener('streaming-status', handler);
    },
    onDevicesUpdated: (cb) => {
        const handler = (_event, list) => cb(list);
        electron_1.ipcRenderer.on('devices-updated', handler);
        return () => electron_1.ipcRenderer.removeListener('devices-updated', handler);
    },
    // System status: emits full system status object as described in docs
    onSystemStatus: (cb) => {
        const handler = (_event, status) => cb(status);
        electron_1.ipcRenderer.on('system-status', handler);
        return () => electron_1.ipcRenderer.removeListener('system-status', handler);
    },
    getSystemStatus: () => electron_1.ipcRenderer.invoke('get-system-status')
};
electron_1.contextBridge.exposeInMainWorld('electron', api);
// Also expose under legacy/alternate name `electronAPI` so renderer code
// that expects `window.electronAPI` won't crash.
electron_1.contextBridge.exposeInMainWorld('electronAPI', api);
