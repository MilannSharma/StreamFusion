import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

export const StatusBar: React.FC = () => {
  const { systemStatus } = useApp() as any;
  const [debugStatus, setDebugStatus] = useState<any>(null);

  useEffect(() => {
    console.log('[StatusBar] systemStatus from context:', systemStatus);
    setDebugStatus(systemStatus);
  }, [systemStatus]);

  const backend = systemStatus?.backend ?? 'offline';
  const adb = systemStatus?.adb ?? 'not-ready';
  const android = systemStatus?.android ?? { connected: false, model: null, id: null };
  const ios = systemStatus?.ios ?? { connected: false };
  const usb = systemStatus?.usbDebugging ?? 'disabled';

  console.log('[StatusBar] Rendering with:', { backend, adb, android, usb });

  return (
    <div className="w-full bg-surface border-b border-white/5 text-xs text-textSecondary px-4 py-1 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Backend API:</span>
        <span className={`${backend === 'online' ? 'text-green-400' : 'text-red-400'}`}>{backend === 'online' ? 'Online' : 'Offline'}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-semibold">ADB:</span>
        <span className={`${adb === 'ready' ? 'text-green-400' : 'text-red-400'}`}>{adb === 'ready' ? 'Ready' : 'Not Ready'}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-semibold">Android:</span>
        {android.connected ? (
          <span className="text-green-400">Connected ({android.model ?? android.id ?? 'unknown'})</span>
        ) : (
          <span className="text-red-400">Offline</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-semibold">iOS Device:</span>
        <span className="text-red-400">Not Connected</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-semibold">USB Debugging:</span>
        <span className={`${usb === 'enabled' ? 'text-green-400' : 'text-red-400'}`}>{usb === 'enabled' ? 'Enabled' : 'Disabled'}</span>
      </div>

    </div>
  );
};
