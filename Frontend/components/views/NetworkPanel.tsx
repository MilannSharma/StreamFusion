
import React from 'react';

export const NetworkPanel: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest mb-4">Upload Speed</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-white">0.0</span>
            <span className="text-sm text-textSecondary mb-1.5">Mbps</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full mt-4 overflow-hidden">
             <div className="h-full bg-primary w-0 shadow-glow transition-all" />
          </div>
        </div>
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest mb-4">Download Speed</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-white">0.0</span>
            <span className="text-sm text-textSecondary mb-1.5">Mbps</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full mt-4 overflow-hidden">
             <div className="h-full bg-secondary w-0 shadow-glow-success transition-all" />
          </div>
        </div>
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest mb-4">Session Data</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-white">0</span>
            <span className="text-sm text-textSecondary mb-1.5">MB</span>
          </div>
          <p className="text-[10px] text-textSecondary mt-4 italic">Waiting for traffic...</p>
        </div>
      </div>

      <div className="bg-surface border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
           <div>
             <h3 className="text-white font-bold">Reverse Tethering</h3>
             <p className="text-xs text-textSecondary">Tunnel PC network to the connected Android device.</p>
           </div>
           <label className="relative inline-flex items-center cursor-pointer group">
             <input type="checkbox" className="sr-only peer" />
             <div className="w-12 h-7 bg-surfaceHighlight rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-textSecondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
           </label>
        </div>
        <div className="p-20 text-center">
           <p className="text-[10px] text-textSecondary/50 uppercase tracking-widest">Network Visualization Offline</p>
        </div>
      </div>
    </div>
  );
};
