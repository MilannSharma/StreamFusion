import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppSettings, BackendStatus, LogEntry, ViewType, CameraSettings, IpcDevice } from '../types';
import { api } from '../services/api';

interface AppContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  status: BackendStatus;
  logs: LogEntry[];
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  isTutorialOpen: boolean;
  setIsTutorialOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isAboutOpen: boolean;
  setIsAboutOpen: (open: boolean) => void;
  refreshStatus: () => Promise<void>;
  isBackendOffline: boolean;
  obsAutoConfig: boolean;
  setObsAutoConfig: (val: boolean) => void;
  cameraSettings: CameraSettings;
  setCameraSettings: (settings: CameraSettings) => void;
  clearLogs: () => void;
}

const defaultSettings: AppSettings = {
  scrcpyResolution: 1080,
  scrcpyBitrate: 8,
  scrcpyFps: 60,
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  theme: 'dark',
};

const defaultStatus: BackendStatus = {
  isOnline: false,
  streaming: false,
  device: {
    androidConnected: false,
    iosConnected: false,
    usbDebugging: false,
    currentDevice: undefined,
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentView, setCurrentView] = useState<ViewType>('connection');
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [obsAutoConfig, setObsAutoConfig] = useState(true);
  const [isBackendOffline, setIsBackendOffline] = useState(true);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({ mode: 'none', frame: 'box' });

  const clearLogs = () => setLogs([]);

  // Function to perform a one-off fetch of the current status
  const refreshStatus = async () => {
    try {
      const res = await api.getStatus();
      setStatus({ ...res.data, isOnline: true });
      setIsBackendOffline(false);
    } catch (err) {
      setIsBackendOffline(true);
      setStatus((prev) => ({ 
        ...prev, 
        isOnline: false,
        device: { ...prev.device, androidConnected: false, currentDevice: undefined },
        obs: { ...prev.obs, connected: false }
      }));
    }
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('stremfusion_settings', JSON.stringify(updated));
  };

  useEffect(() => {
    // Initial fetch
    refreshStatus();

    // Setup Electron IPC Event Listeners if available
    if (window.electron) {
      let isFetchingInfo = false;
      let lastDeviceId = '';

      window.electron.onDeviceUpdate(async (devices: IpcDevice[]) => {
        const activeDevice = devices.find(d => d.state === 'device');
        const isConnected = !!activeDevice;
        
        // If state changed or we don't have info yet, try to fetch
        let deviceInfo = undefined;
        
        if (activeDevice) {
          // If we changed devices or it just connected, reset the "isFetching" for this device
          if (activeDevice.id !== lastDeviceId) {
            isFetchingInfo = false;
            lastDeviceId = activeDevice.id;
          }

          if (!isFetchingInfo) {
            isFetchingInfo = true;
            try {
              deviceInfo = await window.electron.getDeviceInfo(activeDevice.id);
            } catch (e) {
              console.warn("Device info not yet available (Handshaking...)", activeDevice.id);
            } finally {
              isFetchingInfo = false;
            }
          }
        } else {
          lastDeviceId = '';
        }

        setStatus((prev) => {
          // If we already have info for the current device and it's still connected, don't overwrite with undefined
          const finalInfo = deviceInfo || (activeDevice?.id === prev.device.currentDevice?.id ? prev.device.currentDevice : undefined);
          
          return {
            ...prev,
            isOnline: true,
            device: {
              ...prev.device,
              androidConnected: isConnected,
              usbDebugging: !!activeDevice,
              currentDevice: finalInfo
            }
          };
        });
        
        setIsBackendOffline(false);
      });

      // Listen for log streams pushed from the backend
      window.electron.onLogEntry((entry: LogEntry) => {
        setLogs((prev) => {
          // Keep a maximum of 200 logs to prevent memory leaks over long sessions
          const updated = [...prev, entry];
          return updated.length > 200 ? updated.slice(updated.length - 200) : updated;
        });
      });
    }

    // Interval polling is removed!
    // The previous 3000ms interval polling behavior was replaced by the
    // push-based architecture on the `device:update` IPC channel.
  }, []);

  return (
    <AppContext.Provider
      value={{
        settings,
        updateSettings,
        status,
        logs,
        currentView,
        setCurrentView,
        isTutorialOpen,
        setIsTutorialOpen,
        isSettingsOpen,
        setIsSettingsOpen,
        isAboutOpen,
        setIsAboutOpen,
        refreshStatus,
        isBackendOffline,
        obsAutoConfig,
        setObsAutoConfig,
        cameraSettings,
        setCameraSettings,
        clearLogs
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
