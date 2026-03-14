import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export const ConnectionPanel: React.FC = () => {
  const { status, setIsTutorialOpen, refreshStatus } = useApp();
  const [activeTab, setActiveTab] = useState<'usb' | 'wifi' | 'ios'>('usb');
  const [isDetecting, setIsDetecting] = useState(false);
  const [wifiIp, setWifiIp] = useState('');
  const [wifiPort, setWifiPort] = useState('5555');
  const [wifiConnecting, setWifiConnecting] = useState(false);
  const [wifiView, setWifiView] = useState<'guide' | 'setup' | 'connect'>('guide');
  const [iosDevices, setIosDevices] = useState<string[]>([]);

  // Auto-refresh devices
  useEffect(() => {
    const timer = setInterval(() => {
      refreshStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      await window.electron.getDevices();
      await refreshStatus();
    } finally {
      setTimeout(() => setIsDetecting(false), 1000);
    }
  };

  const handleEject = async (id: string) => {
    try {
      await window.electron.disconnectDevice(id);
      await refreshStatus();
    } catch (e) {
      console.error('Eject failed', e);
    }
  };

  const renderActiveMatrix = () => {
    if (status.device.androidConnected && status.device.currentDevice) {
      const dev = status.device.currentDevice;
      const batteryLevel = dev.battery || 85; 
      const storageUsed = 45; 
      
      return (
        <div className="space-y-4 animate-in fade-in slide-in-from-right duration-500">
          <div className="bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-cyan-500/10 transition-all duration-700" />
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-bold text-cyan-400 tracking-widest uppercase">Connected</span>
              </div>
              <button 
                onClick={() => handleEject(dev.id)}
                className="text-[10px] px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 rounded transition-colors uppercase font-bold"
              >
                Eject
              </button>
            </div>

            <div className="flex gap-4 mb-6">
              <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center text-2xl border border-white/10">
                📱
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">{dev.model}</h3>
                <p className="text-xs text-cyan-500/70">{dev.manufacturer} {dev.brand} • Android {dev.version}</p>
                <p className="text-[10px] font-mono text-white/40 mt-1 uppercase tracking-tighter">ID: {dev.id}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                  <span className="text-white/40">Battery Health</span>
                  <span className={batteryLevel < 20 ? 'text-red-400' : 'text-cyan-400'}>{batteryLevel}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className={`h-full transition-all duration-1000 ${
                      batteryLevel < 20 ? 'bg-red-500' : 'bg-cyan-500'
                    }`} 
                    style={{ width: `${batteryLevel}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                  <span className="text-white/40">Storage Usage</span>
                  <span className="text-cyan-400">{storageUsed}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${storageUsed}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 opacity-50">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-[10px] text-white font-medium uppercase tracking-widest">Protocol: ADB v2</span>
              </div>
              <div className="text-[10px] text-white/30 font-mono">NODE_ACTIVE</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
             <button 
               onClick={() => { /* Navigation handled by App.tsx view state if implemented, or just a hint */ }}
               className="p-3 bg-white/5 border border-white/10 rounded-lg hover:border-cyan-500/50 transition-all group text-left"
             >
               <div className="text-xs font-bold text-white/40 group-hover:text-cyan-400 transition-colors uppercase mb-1">Mirror</div>
               <div className="text-[10px] text-white/20">Launch stream</div>
             </button>
             <button 
               onClick={() => { /* Navigate to Files */ }}
               className="p-3 bg-white/5 border border-white/10 rounded-lg hover:border-blue-500/50 transition-all group text-left"
             >
               <div className="text-xs font-bold text-white/40 group-hover:text-blue-400 transition-colors uppercase mb-1">Files</div>
               <div className="text-[10px] text-white/20">Manage storage</div>
             </button>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center p-8 text-center animate-pulse">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10">
          <span className="text-2xl opacity-20">📡</span>
        </div>
        <h3 className="text-white/40 font-bold uppercase tracking-widest mb-2">System Awaiting Node Discovery</h3>
        <p className="text-xs text-white/20 max-w-[200px]">Connect a device via USB or IP to begin mirroring</p>
      </div>
    );
  };

  const renderUsbTab = () => (
    <div className="space-y-8 animate-fade-in text-center">
      <div className="bg-black/40 rounded-3xl p-10 border border-white/5 relative group overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="relative z-10 w-20 h-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-glow border border-primary/20 transition-transform group-hover:scale-110">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
           </svg>
        </div>
        <h3 className="text-white font-black uppercase tracking-tight text-xl mb-3">Sync Active Node</h3>
        <p className="text-xs text-textSecondary mb-10 max-w-xs mx-auto leading-loose font-medium opacity-70">Automated ADB polling for authenticated Android debug bridge connections over physical data ports.</p>
        
        <div className="flex flex-col gap-4 items-center">
          <button 
            onClick={handleAutoDetect}
            disabled={isDetecting}
            className={`relative group px-12 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center gap-3 overflow-hidden ${isDetecting ? 'bg-white/5 text-textSecondary cursor-not-allowed' : 'bg-primary text-white shadow-glow hover:scale-105 active:scale-95'}`}
          >
            {isDetecting ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Handshaking...</>
            ) : 'Initialize Scan'}
          </button>
          <button 
             onClick={() => setIsTutorialOpen(true)}
             className="text-[10px] font-black uppercase tracking-widest text-textSecondary/40 hover:text-primary transition-colors underline underline-offset-8"
           >
             Manual Configuration
          </button>
        </div>
      </div>
    </div>
  );

  const renderWifiTab = () => (
    <div className="space-y-6">
      {wifiView === 'guide' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">⚡</span>
            <h3 className="font-bold text-lg text-white">Wireless ADB Guide</h3>
          </div>
          <div className="space-y-3 text-sm text-white/60">
            <div className="flex gap-3">
              <span className="bg-cyan-500/20 text-cyan-400 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
              <p>Connect device via <strong className="text-white">USB</strong> for one-time pairing.</p>
            </div>
            <div className="flex gap-3">
              <span className="bg-cyan-500/20 text-cyan-400 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
              <p>Ensure both PC and Device are on the same <strong className="text-white">WiFi</strong> network.</p>
            </div>
            <div className="flex gap-3">
              <span className="bg-cyan-500/20 text-cyan-400 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
              <p>Enter the Device <strong className="text-white">IP Address</strong> to connect wirelessly.</p>
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <button 
              onClick={() => setWifiView('setup')}
              className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-sm transition-all"
            >
              Start Setup
            </button>
            <button 
              onClick={() => setWifiView('connect')}
              className="flex-1 py-3 bg-white/5 border border-white/10 hover:border-cyan-500/50 text-white rounded-lg font-bold text-sm transition-all"
            >
              Skip to Connect
            </button>
          </div>
        </div>
      )}

      {wifiView === 'setup' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 text-center">
          <h3 className="font-bold text-white uppercase tracking-widest text-sm mb-4">Step 1: Enable TCP Mode</h3>
          {status.device.androidConnected ? (
            <div className="p-4 bg-cyan-950/20 border border-cyan-500/30 rounded-lg">
              <p className="text-cyan-400 font-bold mb-4">Device Detected: {status.device.currentDevice?.model}</p>
              <button 
                onClick={async () => {
                  if (status.device.currentDevice) {
                    const ok = await window.electron.enableTcpMode(status.device.currentDevice.id);
                    if (ok) setWifiView('connect');
                  }
                }}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <span>Enable Wireless Mode</span>
                <span className="text-xs opacity-50">(adb tcpip 5555)</span>
              </button>
            </div>
          ) : (
            <div className="p-8 border-2 border-dashed border-white/10 rounded-lg">
              <p className="text-xs text-white/40 mb-4">Please connect your phone via USB first to enable wireless debugging.</p>
              <div className="animate-pulse text-2xl">🔌</div>
            </div>
          )}
          <button onClick={() => setWifiView('guide')} className="text-xs text-white/40 hover:text-white uppercase font-bold tracking-widest mt-4">← Back to guide</button>
        </div>
      )}

      {wifiView === 'connect' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
           <h3 className="font-bold text-white uppercase tracking-widest text-sm mb-4">Step 2: Connect via WiFi</h3>
           <div className="space-y-4">
             <div>
               <label className="text-[10px] font-bold text-white/40 uppercase mb-1 block">Device IP Address</label>
               <input 
                 type="text" 
                 value={wifiIp}
                 onChange={(e) => setWifiIp(e.target.value)}
                 placeholder="e.g. 192.168.1.10"
                 className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/10 focus:border-cyan-500/50 outline-none transition-all"
               />
             </div>
             <button 
               disabled={wifiConnecting || !wifiIp}
               onClick={async () => {
                 setWifiConnecting(true);
                 try {
                   const res = await window.electron.connectWifi(wifiIp);
                   if (res === 'connected' || res === 'already') {
                     await refreshStatus();
                   } else {
                     alert('Connection failed. Ensure IP is correct and TCP mode is enabled.');
                   }
                 } finally {
                   setWifiConnecting(false);
                 }
               }}
               className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all"
             >
               {wifiConnecting ? 'Negotiating Connection...' : 'Establish Wireless Link'}
             </button>
           </div>
           <button onClick={() => setWifiView('setup')} className="text-xs text-white/40 hover:text-white uppercase font-bold tracking-widest mt-4 block">← Reset setup</button>
        </div>
      )}
    </div>
  );

  const renderIosTab = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍎</span>
          <h3 className="font-bold text-lg text-white uppercase tracking-tight">iOS Connectivity Guide</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em]">Prerequisites</h4>
            <ul className="text-xs text-white/50 space-y-2 list-disc pl-4">
              <li>Connect via <strong className="text-white">Lightning/USB-C</strong> cable.</li>
              <li>Tap <strong className="text-white">"Trust this Computer"</strong> on your iPhone/iPad.</li>
              <li>Ensure <strong className="text-white">iTunes</strong> or Apple Devices app is installed (Windows).</li>
              <li>Disable "Screen Time" restrictions if mirroring fails.</li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em]">Mirroring Mode</h4>
            <p className="text-xs text-white/50 leading-relaxed">
              We use <strong className="text-white">libimobiledevice</strong> for discovery. Mirroring requires a stable USB handshake. For best results, use an original Apple cable.
            </p>
          </div>
        </div>

        <div className="pt-4 flex flex-col items-center border-t border-white/5 gap-4">
          <button 
            disabled={isDetecting}
            onClick={async () => {
              setIsDetecting(true);
              try {
                const devs = await window.electron.detectIosDevices();
                setIosDevices(devs);
                if (devs.length === 0) {
                   // Optional: toast or log "No devices found"
                }
              } catch (e: any) {
                alert(e.message || "Failed to detect iOS devices.");
              } finally {
                setIsDetecting(false);
              }
            }}
            className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-2xl font-black transition-all uppercase text-[10px] tracking-[0.3em] flex items-center justify-center gap-3"
          >
            {isDetecting ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : null}
            Initialize iOS Scan
          </button>
          <span className="text-[9px] text-white/20 uppercase tracking-widest italic">Requires System Drivers installed</span>
        </div>
      </div>

      {iosDevices.length > 0 && (
        <div className="grid grid-cols-1 gap-4 w-full animate-in slide-in-from-bottom duration-500">
          {iosDevices.map(udid => (
            <div key={udid} className="p-5 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl">📱</div>
                <div className="text-left">
                  <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-0.5">Apple Device Detected</div>
                  <div className="text-[10px] text-white/40 font-mono truncate w-48 tracking-tighter">{udid}</div>
                </div>
              </div>
              <button 
                onClick={() => window.electron.startIosMirror(udid)}
                className="px-6 py-2.5 bg-cyan-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-glow hover:scale-105 active:scale-95 transition-all"
              >
                Launch Mirror
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col gap-3 text-center md:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full w-fit mx-auto md:mx-0">
          <span className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-glow" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">System Interface v2.5.0</span>
        </div>
        <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">Terminal Initialization</h1>
        <p className="text-textSecondary text-sm max-w-2xl leading-relaxed font-medium mx-auto md:mx-0">Provision and authenticate hardware nodes for high-definition data streaming and system-level remote interaction.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-7 space-y-6">
          <div className="bg-surface border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl relative transition-all min-h-[500px]">
             <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-secondary/50 to-primary/50 opacity-20" />
             
             <div className="flex border-b border-white/5 bg-white/[0.02]">
                <button 
                  onClick={() => setActiveTab('usb')}
                  className={`flex-1 py-6 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${activeTab === 'usb' ? 'text-primary' : 'text-textSecondary hover:text-white hover:bg-white/5'}`}
                >
                  Hardwire USB
                  {activeTab === 'usb' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full shadow-glow" />}
                </button>
                <button 
                  onClick={() => setActiveTab('wifi')}
                  className={`flex-1 py-6 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${activeTab === 'wifi' ? 'text-secondary' : 'text-textSecondary hover:text-white hover:bg-white/5'}`}
                >
                  Wireless ADB
                  {activeTab === 'wifi' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-secondary rounded-full shadow-glow-success" />}
                </button>
                <button 
                  onClick={() => setActiveTab('ios')}
                  className={`flex-1 py-6 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${activeTab === 'ios' ? 'text-purple-400' : 'text-textSecondary hover:text-white hover:bg-white/5'}`}
                >
                  iOS Mirror
                  {activeTab === 'ios' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-purple-400 rounded-full shadow-glow-success" />}
                </button>
             </div>

             <div className="p-10">
               {activeTab === 'usb' && renderUsbTab()}
               {activeTab === 'wifi' && renderWifiTab()}
               {activeTab === 'ios' && renderIosTab()}
             </div>
          </div>
        </div>

        <div className="md:col-span-5 space-y-6">
           <div className="flex items-center justify-between px-2">
             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-textSecondary">Active Matrix</h3>
             <span className="text-[9px] font-black text-secondary uppercase animate-pulse">Scanning Terminals</span>
           </div>
           
           {renderActiveMatrix()}
        </div>
      </div>
    </div>
  );
};
