import axios from 'axios';
import { AppSettings } from '../types';

const API_BASE = 'http://127.0.0.1:5000';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 5000,
});

export const api = {
  startStream: async (settings: AppSettings, autoObs: boolean) => {
    return apiClient.post('/start', {
      ...settings,
      obs_auto_start: autoObs,
    });
  },

  stopStream: async () => {
    return apiClient.post('/stop');
  },

  getStatus: async () => {
    return apiClient.get('/status');
  },

  getLogs: async () => {
    return apiClient.get('/logs');
  },
  
  // Mock function for "Open OBS" since browser can't directly launch apps easily
  // In a real electron app, use ipcRenderer to call shell.openExternal or child_process
  openObs: async () => {
    console.log("Requesting to open OBS...");
    // This would likely be a specific backend endpoint or Electron IPC call
    // return apiClient.post('/open-obs');
  }
};
