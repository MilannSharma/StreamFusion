
import React from 'react';
import { useApp } from '../context/AppContext';

export const Footer: React.FC = () => {
  const { status, isBackendOffline } = useApp();
  const { androidConnected, iosConnected, usbDebugging } = status.device;

  const StatusDot = ({ active, pulse = true }: { active: boolean; pulse?: boolean }) => (
    <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
      active 
        ? `bg-secondary shadow-[0_0_8px_rgba(16,185,129,0.6)] ${pulse ? 'animate-pulse' : ''}` 
        : 'bg-white/10'
    }`} />
  );

  return (
    <footer className="h-8 border-t border-white/5 flex items-center justify-between px-4 bg-surface/40 backdrop-blur-2xl z-[110] select-none shrink-0">
      {/* LEFT: System & Connection Status */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Backend API */}
        <div className="flex items-center gap-2 group cursor-help" title="Local Core Service Status">
          <StatusDot active={!isBackendOffline} />
          <span className={`text-[9px] font-black uppercase tracking-tighter ${!isBackendOffline ? 'text-textPrimary' : 'text-textSecondary/50'}`}>
            Backend API
          </span>
        </div>

        <div className="w-px h-3 bg-white/10" />

        {/* ADB Bridge */}
        <div className="flex items-center gap-2" title="Android Debug Bridge">
          <StatusDot active={androidConnected || usbDebugging} />
          <span className={`text-[9px] font-black uppercase tracking-tighter ${androidConnected ? 'text-textPrimary' : 'text-textSecondary/50'}`}>
            ADB Connect
          </span>
        </div>

        <div className="w-px h-3 bg-white/10" />

        {/* Interface Modes */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" title="USB Connection">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${androidConnected && !iosConnected ? 'text-primary' : 'text-white/10'}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v2.586l.707-.707a1 1 0 111.414 1.414l-2.414 2.414a1 1 0 01-1.414 0L6.879 6.293a1 1 0 011.414-1.414l.707.707V3a1 1 0 011-1zm0 10a1 1 0 011 1v2.586l.707-.707a1 1 0 111.414 1.414l-2.414 2.414a1 1 0 01-1.414 0L6.879 16.293a1 1 0 011.414-1.414l.707.707V13a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className={`text-[9px] font-black uppercase tracking-tighter ${androidConnected ? 'text-textPrimary' : 'text-textSecondary/50'}`}>USB Linked</span>
          </div>

          <div className="flex items-center gap-1.5" title="WiFi Connection">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${status.device.currentDevice?.name?.includes('192.') ? 'text-secondary' : 'text-white/10'}`} viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 11-2 0 1 1 0 012 0zM8 16a1 1 0 11-2 0 1 1 0 012 0zM13 16a1 1 0 11-2 0 1 1 0 012 0zM16 16a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            <span className={`text-[9px] font-black uppercase tracking-tighter ${status.device.currentDevice?.name?.includes('192.') ? 'text-textPrimary' : 'text-textSecondary/50'}`}>WiFi Sync</span>
          </div>
        </div>

        <div className="w-px h-3 bg-white/10" />

        {/* Platform Indicators */}
        <div className="flex items-center gap-3">
          <span className={`text-[9px] font-black uppercase tracking-widest ${androidConnected ? 'text-primary' : 'text-textSecondary/30'}`}>Android</span>
          <span className={`text-[9px] font-black uppercase tracking-widest ${iosConnected ? 'text-primary' : 'text-textSecondary/30'}`}>iOS</span>
        </div>
      </div>

      {/* CENTER: Smart Alerts */}
      <div className="flex-1 px-8 flex justify-center overflow-hidden">
        {!isBackendOffline && (
          usbDebugging ? (
            <div className="flex items-center gap-2 text-secondary/70">
              <StatusDot active={true} pulse={false} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
                Mobile Debugging is ON
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-danger animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
                Not Connected: Turn on USB Debugging in your device to continue
              </span>
            </div>
          )
        )}
      </div>

      {/* RIGHT: Credits & Branding */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-textSecondary uppercase tracking-widest opacity-50 font-bold">Powered by</span>
          <span className="text-[9px] text-primary font-black uppercase tracking-widest group cursor-default transition-all hover:tracking-[0.2em]">Nexa</span>
        </div>
        
        <div className="w-px h-3 bg-white/10" />
        
        <div className="group flex items-center gap-2">
          <span className="text-[9px] text-white font-black uppercase tracking-widest transition-all group-hover:text-primary">Milan Sharma</span>
        </div>
      </div>
    </footer>
  );
};
