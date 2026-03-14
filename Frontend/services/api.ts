import { AppSettings } from '../types';

/**
 * The api.ts bridging file acts as a wrapper around window.electron.
 * This completely replaces the previous axios http://127.0.0.1:5000 setup with
 * native Electron IPC calls.
 */

// We assume window.electron exists. If testing in a normal browser without Electron, 
// these calls will throw, which is expected for this desktop mode.

export const api = {
  startStream: async (settings: AppSettings, autoObs: boolean, deviceId?: string) => {
    // Resolve target device automatically if not explicitly provided
    let targetDeviceId = deviceId;
    if (!targetDeviceId) {
      const devices = await window.electron.getDevices();
      const active = devices.find(d => d.state === 'device');
      targetDeviceId = active?.id || '';
    }
    
    // Pass settings down via IPC
    await window.electron.startStream(targetDeviceId, {
      resolution: settings.scrcpyResolution,
      bitrate: settings.scrcpyBitrate,
      fps: settings.scrcpyFps,
      turnScreenOff: true // Default for now
    });
    // Note: The autoObs flag would be handled by OBS integration logic 
    // implemented inside main.ts or related managers.
  },

  stopStream: async () => {
    await window.electron.stopStream();
  },

  /**
   * Retrieves an aggregated status replacing the old API endpoint.
   * Maps native IPC results back into the frontend BackendStatus shape.
   */
  getStatus: async () => {
    try {
      // 1. Check stream status
      const streamRes = await window.electron.getStreamStatus();
      
      // 2. Check devices
      const devices = await window.electron.getDevices();
      
      const isConnected = devices.some(d => d.state === 'device');
      const activeDevice = devices.find(d => d.state === 'device');
      
      let deviceInfo = undefined;
      let usbDebuggingMode = false;
      
      if (activeDevice) {
        usbDebuggingMode = true;
        // Fetch rich info for the connected device
        deviceInfo = await window.electron.getDeviceInfo(activeDevice.id);
      }

      // Return wrapped Response format compatible with the AppContext handler
      return {
        data: {
          isOnline: true,
          streaming: streamRes?.streaming || false,
          device: {
            androidConnected: isConnected,
            iosConnected: false,
            usbDebugging: usbDebuggingMode,
            currentDevice: deviceInfo
          },
          obs: {
            connected: false,
            sources: { screen: false, audio: false }
          }
        }
      };
    } catch (e) {
      throw new Error("Electron backend offline or IPC failed");
    }
  },

  /**
   * getLogs now returns an empty array to seed the context, 
   * but real logs are pushed natively via window.electron.onLogEntry.
   */
  getLogs: async () => {
    return { data: [] };
  },
  
  openObs: async () => {
    console.log("Requesting to open OBS...");
    // Future: implement IPC call to open OBS
    // window.electron.openExternal('obs://??') 
  }
};
