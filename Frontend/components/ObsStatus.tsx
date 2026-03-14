import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const ObsStatus: React.FC = () => {
  const { status, isBackendOffline, refreshStatus } = useApp();
  const [obsIp, setObsIp] = useState('127.0.0.1');
  const [obsPort, setObsPort] = useState(4455);
  const [obsPassword, setObsPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      const state = await window.electron.obsStatus();
      setIsConnected(state);
    };
    checkStatus();
    const timer = setInterval(checkStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const ok = await window.electron.obsConnect(obsIp, obsPort, obsPassword);
      setIsConnected(ok);
      if (ok) {
        // Try to inject scene if device is connected
        if (status.device.androidConnected && status.device.currentDevice) {
           await window.electron.obsInjectScene(status.device.currentDevice.model);
        }
      } else {
        alert('OBS Connection failed. Check your settings and Ensure WebSocket is enabled in OBS.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await window.electron.obsDisconnect();
    setIsConnected(false);
  };

  const SourceIndicator = ({ label, active }: { label: string; active: boolean }) => (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-secondary shadow-glow-success' : 'bg-surfaceHighlight'}`} />
      <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-white' : 'text-textSecondary/50'}`}>{label}</span>
    </div>
  );

  return (
    <div className="bg-surface rounded-3xl p-6 border border-white/5 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
      
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-primary/30 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-textSecondary group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          OBS Integration
        </h2>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
          isConnected 
            ? 'bg-secondary/10 text-secondary border-secondary/20 shadow-glow-success' 
            : 'bg-white/5 text-white/20 border-white/10'
        }`}>
          {isConnected ? 'Link Active' : 'Offline'}
        </div>
      </div>

      {!isConnected ? (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-white/30 uppercase mb-1 block">Host</label>
              <input 
                title="OBS Host IP"
                type="text" 
                value={obsIp}
                onChange={(e) => setObsIp(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-white/30 uppercase mb-1 block">Port</label>
              <input 
                title="OBS Port"
                type="number" 
                value={obsPort}
                onChange={(e) => setObsPort(Number(e.target.value))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-white/30 uppercase mb-1 block">Password</label>
            <input 
              type="password" 
              value={obsPassword}
              onChange={(e) => setObsPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-primary/50"
              placeholder="WebSocket Password"
            />
          </div>
          <button 
            onClick={handleConnect}
            disabled={isConnecting || isBackendOffline}
            className="w-full py-3 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-glow hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {isConnecting ? 'Establishing Link...' : 'Establish OBS Link'}
          </button>
        </div>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
          <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Active Pipeline</span>
            </div>
            <div className="space-y-3">
              <SourceIndicator label={status.device.currentDevice ? `StremFusion — ${status.device.currentDevice.model}` : 'Generic Device'} active={true} />
              <SourceIndicator label="Direct Window Capture" active={true} />
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={handleDisconnect}
              className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Disconnect
            </button>
            <button 
               onClick={async () => {
                 if (status.device.currentDevice) {
                   await window.electron.obsInjectScene(status.device.currentDevice.model);
                 }
               }}
               className="flex-1 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
               Inject Scene
            </button>
          </div>
        </div>
      )}
    </div>
  );
};