import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppSettings, BackendStatus, LogEntry } from '../types';
import { api } from '../services/api';

interface AppContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  status: BackendStatus;
  systemStatus?: any;
  logs: LogEntry[];
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isTutorialOpen: boolean;
  setIsTutorialOpen: (open: boolean) => void;
  refreshStatus: () => Promise<void>;
  isBackendOffline: boolean;
  obsAutoConfig: boolean;
  setObsAutoConfig: (val: boolean) => void;
}

const defaultSettings: AppSettings = {
  scrcpyResolution: 1080,
  scrcpyBitrate: 8,
  scrcpyFps: 60,
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
};

const defaultStatus: BackendStatus = {
  isOnline: false,
  streaming: false,
  device: {
    androidConnected: false,
    iosConnected: false,
    usbDebugging: false,
  },
  obs: {
    connected: false,
    sources: { screen: false, audio: false },
  },
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('stremfusion_settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  const [status, setStatus] = useState<BackendStatus>(defaultStatus);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [obsAutoConfig, setObsAutoConfig] = useState(true);
  const [isBackendOffline, setIsBackendOffline] = useState(true);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('stremfusion_settings', JSON.stringify(updated));
  };

  const refreshStatus = async () => {
    // Trigger a backend status refresh via IPC if available
    try {
      if ((window as any).electron?.getSystemStatus) {
        const s = await (window as any).electron.getSystemStatus();
        if (s) {
          setSystemStatus(s);
          setIsBackendOffline(s.backend !== 'online');
          setStatus((prev) => ({
            ...prev,
            isOnline: s.backend === 'online',
            device: {
              ...prev.device,
              androidConnected: !!s.android?.connected,
              iosConnected: !!s.ios?.connected,
              usbDebugging: s.usbDebugging === 'enabled'
            }
          }));
        }
      }
    } catch (e) {
      setIsBackendOffline(true);
      setStatus((prev) => ({ ...prev, isOnline: false }));
    }
  };

  const fetchLogs = async () => {
    // Logs disabled for scrcpy-focused testing
  };

  useEffect(() => {
    console.log('[AppContext] Mounting, setting up system-status subscription...');
    // Subscribe to system-status events from Electron main process
    let off: (() => void) | undefined;
    try {
      const api = (window as any).electron;
      console.log('[AppContext] window.electron available:', !!api);
      
      if (api?.onSystemStatus) {
        console.log('[AppContext] Setting up onSystemStatus listener...');
        off = api.onSystemStatus((s: any) => {
          console.log('[AppContext] Received system-status event:', s);
          setSystemStatus(s);
          setIsBackendOffline(s?.backend !== 'online');
          setStatus((prev) => ({
            ...prev,
            isOnline: s?.backend === 'online',
            device: {
              ...prev.device,
              androidConnected: !!s?.android?.connected,
              iosConnected: !!s?.ios?.connected,
              usbDebugging: s?.usbDebugging === 'enabled'
            }
          }));
        });
        console.log('[AppContext] onSystemStatus listener registered');
      }

      // request initial snapshot
      if (api?.getSystemStatus) {
        console.log('[AppContext] Requesting initial system status snapshot...');
        api.getSystemStatus().then((s: any) => {
          console.log('[AppContext] Got initial system status snapshot:', s);
          if (s) {
            setSystemStatus(s);
            setIsBackendOffline(s?.backend !== 'online');
            setStatus((prev) => ({
              ...prev,
              isOnline: s?.backend === 'online',
              device: {
                ...prev.device,
                androidConnected: !!s?.android?.connected,
                iosConnected: !!s?.ios?.connected,
                usbDebugging: s?.usbDebugging === 'enabled'
              }
            }));
          }
        }).catch((e: any) => {
          console.warn('[AppContext] Error getting initial system status:', e);
        });
      }
    } catch (e) {
      console.warn('[AppContext] Error setting up system status subscription:', e);
    }

    return () => {
      console.log('[AppContext] Cleaning up system-status subscription');
      if (off) off();
    };
  }, []);


  return (
    <AppContext.Provider
      value={{
        settings,
        updateSettings,
        status,
        systemStatus,
        logs,
        isSettingsOpen,
        setIsSettingsOpen,
        isTutorialOpen,
        setIsTutorialOpen,
        refreshStatus,
        isBackendOffline,
        obsAutoConfig,
        setObsAutoConfig
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};