import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export const Controls: React.FC = () => {
  const { status, settings, obsAutoConfig, setObsAutoConfig, isBackendOffline } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | undefined>(undefined);
  const [isStreamingLocal, setIsStreamingLocal] = useState<boolean>(false);
  // UI status: assume bundled adb by default (passive, non-technical)
  const [deviceConnected, setDeviceConnected] = useState<boolean>(false);
  const [scrcpyStatus, setScrcpyStatus] = useState<'ready' | 'missing-adb' | 'missing-scrcpy'>('ready');

  const handleStart = async () => {
    setIsLoading(true);
    try {
      // Use Electron IPC to start streaming (Phase 1 stub)
      window.electron.startStreaming(selectedDevice);
    } catch (error) {
      console.error("Failed to start stream", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      window.electron.stopStreaming();
    } catch (error) {
      console.error("Failed to stop stream", error);
    } finally {
      setIsLoading(false);
    }
  };

  const isStreaming = isStreamingLocal || status.streaming;
  // No backend needed - buttons enabled based on device availability and streaming state only
  const canStart = (devices.length > 0) && !isStreaming;
  const canStop = isStreaming;

  useEffect(() => {
    // Fetch device list from main process
    let mounted = true;
    (async () => {
      try {
        console.log('[Controls] Fetching devices...');
        const list = await window.electron.getDevices();
        console.log('[Controls] Got devices:', list);
        if (!mounted) return;
        setDevices(list);
        if (list.length > 0) setSelectedDevice(list[0].id);
        setDeviceConnected(list.length > 0);
        // runtime check for scrcpy/ad b status (safe, non-technical badge)
        try {
          if (window.electron.checkScrcpyStatus) {
            const status = await window.electron.checkScrcpyStatus();
            if (!mounted) return;
            setScrcpyStatus(status);
          }
        } catch (err) {
          console.warn('Failed to check scrcpy status', err);
        }
      } catch (err) {
        console.error('Failed to fetch devices', err);
      }
    })();

    // Subscribe to streaming status
    const unsubscribeStreaming = window.electron.onStreamingStatus((s) => {
      console.log('[Controls] Streaming status update:', s);
      setIsStreamingLocal(!!s.streaming);
    });

    // Subscribe to device updates if available
    let unsubscribeDevices: (() => void) | undefined;
      if (window.electron.onDevicesUpdated) {
        console.log('[Controls] Setting up devices-updated listener');
        unsubscribeDevices = window.electron.onDevicesUpdated(async (list) => {
          console.log('[Controls] devices-updated event received:', list);
          setDevices(list);
          setDeviceConnected(list.length > 0);
          if (list.length > 0 && !selectedDevice) setSelectedDevice(list[0].id);
          try {
            if (window.electron.checkScrcpyStatus) {
              const status = await window.electron.checkScrcpyStatus();
              setScrcpyStatus(status);
            }
          } catch (err) {
            console.warn('Failed to check scrcpy status', err);
          }
        });
      }

    return () => {
      mounted = false;
      try { unsubscribeStreaming(); } catch {}
      try { unsubscribeDevices && unsubscribeDevices(); } catch {}
    };
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Passive status badges */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${deviceConnected ? 'bg-emerald-400' : 'bg-gray-500'}`} aria-hidden />
          <span className="text-xs text-textSecondary">Device: {deviceConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${scrcpyStatus === 'ready' ? 'bg-emerald-400' : 'bg-rose-500'}`} aria-hidden />
          <span className="text-xs text-textSecondary">
            {scrcpyStatus === 'ready' ? 'ADB: Ready' : scrcpyStatus === 'missing-adb' ? 'ADB: Missing' : 'Mirror tools missing'}
          </span>
        </div>
      </div>

      {/* Device selector */}
      <div className="flex items-center gap-2">
        <label htmlFor="device-select" className="text-xs text-textSecondary">Device:</label>
        <select
          id="device-select"
          className="bg-surface text-white px-2 py-1 rounded"
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
        >
          {devices.length === 0 && <option value="">No devices</option>}
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <button
          onClick={async () => {
            try {
              const list = await window.electron.getDevices();
              setDevices(list);
              if (list.length > 0) setSelectedDevice(list[0].id);
              if (window.electron.checkScrcpyStatus) {
                const s = await window.electron.checkScrcpyStatus();
                setScrcpyStatus(s);
              }
            } catch (err) {
              console.error('Manual refresh failed', err);
            }
          }}
          title="Refresh devices"
          className="ml-2 px-2 py-1 bg-surface/80 hover:bg-surface rounded text-textSecondary"
        >
          Refresh
        </button>
      </div>

      {/* Start Button */}
      <button
        onClick={handleStart}
        disabled={!canStart || isLoading}
        className={`group relative flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border transition-all duration-300 overflow-hidden ${
          canStart 
            ? 'bg-surface border-primary/20 hover:border-primary/50 hover:shadow-glow cursor-pointer' 
            : 'bg-surface/50 border-white/5 opacity-50 cursor-not-allowed'
        }`}
      >
        {canStart && (
           <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}
        
        <div className={`relative z-10 p-4 rounded-full mb-4 transition-transform duration-300 group-hover:scale-110 ${
          canStart ? 'bg-primary/20 text-primary' : 'bg-surfaceHighlight text-textSecondary'
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        </div>
        <span className={`relative z-10 text-xl font-bold tracking-tight ${canStart ? 'text-white' : 'text-textSecondary'}`}>
          Start Streaming
        </span>
        <span className="relative z-10 text-xs text-textSecondary mt-1">Initialize SCRCPY & OBS</span>
      </button>

      {/* Stop Button */}
      <button
        onClick={handleStop}
        disabled={!canStop || isLoading}
        className={`group relative flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border transition-all duration-300 overflow-hidden ${
          canStop 
            ? 'bg-surface border-danger/20 hover:border-danger/50 hover:shadow-glow-danger cursor-pointer' 
            : 'bg-surface/50 border-white/5 opacity-50 cursor-not-allowed'
        }`}
      >
        {canStop && (
           <div className="absolute inset-0 bg-gradient-to-br from-danger/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}

        <div className={`relative z-10 p-4 rounded-full mb-4 transition-transform duration-300 group-hover:scale-110 ${
          canStop ? 'bg-danger/20 text-danger' : 'bg-surfaceHighlight text-textSecondary'
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        </div>
        <span className={`relative z-10 text-xl font-bold tracking-tight ${canStop ? 'text-white' : 'text-textSecondary'}`}>
          Stop Streaming
        </span>
        <span className="relative z-10 text-xs text-textSecondary mt-1">Terminate all processes</span>
      </button>

      {/* Auto Config Switch */}
      <div className="bg-surface border border-white/5 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-surfaceHighlight/50 rounded-lg text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Auto-Configure OBS</p>
            <p className="text-xs text-textSecondary">Automatically create scenes & sources</p>
          </div>
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer group">
          <input 
            type="checkbox" 
            checked={obsAutoConfig} 
            onChange={(e) => setObsAutoConfig(e.target.checked)} 
            className="sr-only peer" 
            aria-label="Auto configure OBS"
          />
          <div className="w-12 h-7 bg-surfaceHighlight peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-textSecondary after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white group-hover:after:scale-90"></div>
        </label>
      </div>
    </div>
  );
};