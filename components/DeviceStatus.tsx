import React from 'react';
import { useApp } from '../context/AppContext';

export const DeviceStatus: React.FC = () => {
  const { status, refreshStatus, isBackendOffline, setIsTutorialOpen } = useApp();
  const { androidConnected, iosConnected, usbDebugging } = status.device;

  const StatusItem = ({ label, active, warning }: { label: string; active: boolean; warning?: boolean }) => {
    const colorClass = active ? 'bg-secondary' : warning ? 'bg-warning' : 'bg-surfaceHighlight';
    const textClass = active ? 'text-white' : warning ? 'text-warning' : 'text-textSecondary';
    const glowClass = active ? 'shadow-glow-success' : '';
    
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
        <span className="text-sm font-medium text-textSecondary">{label}</span>
        <div className="flex items-center gap-2">
           <span className={`text-xs font-semibold ${textClass}`}>
             {active ? 'Online' : warning ? 'Waiting' : 'Offline'}
           </span>
           <div className={`w-2.5 h-2.5 rounded-full ${colorClass} ${glowClass} ${active ? 'animate-pulse' : ''}`} />
        </div>
      </div>
    );
  };

  return (
    <div className="bg-surface rounded-2xl p-1 border border-white/5 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-secondary opacity-20"></div>
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Devices
          </h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsTutorialOpen(true)}
              className="p-1.5 rounded-md hover:bg-white/10 text-primary hover:text-white transition-all active:scale-95"
              title="How to Connect?"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button 
              onClick={refreshStatus}
              disabled={isBackendOffline}
              className="p-1.5 rounded-md hover:bg-white/10 text-textSecondary hover:text-white transition-all active:scale-95"
              title="Refresh Status"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <StatusItem label="Backend API" active={!isBackendOffline} />
          <StatusItem label="Android" active={androidConnected} />
          <StatusItem label="iOS Device" active={iosConnected} warning={!iosConnected} />
          
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
            <span className="text-sm font-medium text-textSecondary">USB Debugging</span>
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
              usbDebugging 
                ? 'bg-primary/20 text-primary border-primary/20' 
                : 'bg-surfaceHighlight text-textSecondary border-transparent'
            }`}>
              {usbDebugging ? 'Enabled' : 'Disabled'}
            </div>
          </div>
        </div>

        {!androidConnected && (
          <button 
            onClick={() => setIsTutorialOpen(true)}
            className="w-full mt-4 py-2 flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary rounded-lg text-xs font-bold transition-all group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 group-hover:animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            How to connect Android?
          </button>
        )}
      </div>
    </div>
  );
};