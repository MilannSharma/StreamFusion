
import React from 'react';
import { useApp } from '../../context/AppContext';

export const InfoPanel: React.FC = () => {
  const { status } = useApp();
  const device = status.device.currentDevice;

  if (!device) return (
    <div className="flex flex-col items-center justify-center h-full text-center p-12 space-y-6">
      <div className="p-6 bg-danger/10 rounded-full text-danger animate-pulse border border-danger/20">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Hardware Diagnostics Offline</h2>
        <p className="text-textSecondary max-w-sm mx-auto uppercase tracking-widest text-[10px] leading-relaxed">Device connection required. Please connect a terminal via USB or Wireless Pairing to initialize hardware profile and system diagnostics.</p>
      </div>
      <button className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/10 transition-all">
        Retry Connection
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 max-w-5xl mx-auto">
      {/* Battery & Hardware Profile */}
      <div className="md:col-span-4 space-y-6">
        <div className="bg-surface border border-white/5 rounded-3xl p-8 flex flex-col items-center text-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-secondary/20 to-transparent" />
          <div className="relative w-32 h-32 mb-6">
             <svg className="w-full h-full transform -rotate-90">
               <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
               <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-secondary" 
                 strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * device.battery) / 100} strokeLinecap="round" />
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
               <span className="text-3xl font-bold text-white">{device.battery}%</span>
               <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{device.isCharging ? 'Charging' : 'On Battery'}</span>
             </div>
          </div>
          <h3 className="text-xl font-bold text-white mb-1">{device.name}</h3>
          <p className="text-xs text-textSecondary">{device.version}</p>
        </div>

        <div className="bg-surface border border-white/5 rounded-2xl p-6 space-y-4">
           <div className="flex justify-between items-center">
              <span className="text-xs text-textSecondary font-medium">Storage Usage</span>
              <span className="text-xs text-white font-bold">{device.storage.used}GB / {device.storage.total}GB</span>
           </div>
           <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(device.storage.used / device.storage.total) * 100}%` }} />
           </div>
        </div>
      </div>

      {/* Detailed Specs */}
      <div className="md:col-span-8 space-y-6">
         <div className="bg-surface border border-white/5 rounded-3xl p-8 shadow-xl">
           <h3 className="text-sm font-bold uppercase tracking-widest text-textSecondary mb-6 border-b border-white/5 pb-4">System Specifications</h3>
            <div className="grid grid-cols-2 gap-y-8">
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Model Name</p>
                <p className="text-white font-semibold">{device.model || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">OS Version</p>
                <p className="text-white font-semibold">{device.version || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Architecture</p>
                <p className="text-white font-semibold">{device.cpu || 'ARM64-v8a'}</p>
              </div>
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">RAM Capacity</p>
                <p className="text-white font-semibold">{device.ram || '8 GB LPDDR5'}</p>
              </div>
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Screen Resolution</p>
                <p className="text-white font-semibold">{device.resolution || '2400 x 1080'}</p>
              </div>
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Serial Number</p>
                <p className="text-white font-semibold font-mono text-[10px]">{device.serial || 'NX-7782-B90'}</p>
              </div>
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Manufacturer</p>
                <p className="text-white font-semibold">{device.manufacturer || 'Nexus Core'}</p>
              </div>
              <div>
                <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Android ID</p>
                <p className="text-white font-semibold font-mono text-[10px]">{device.androidId || '88f2-99c1-00e4'}</p>
              </div>
           </div>
         </div>
         
         <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="p-3 bg-primary/10 text-primary rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </div>
             <div>
               <p className="text-white font-bold">System Maintenance</p>
               <p className="text-xs text-textSecondary">Advanced diagnostics require ADB root access.</p>
             </div>
           </div>
           <button className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs font-bold transition-all">Enable Root</button>
         </div>
      </div>
    </div>
  );
};
