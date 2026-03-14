
import React from 'react';
import { useApp } from '../context/AppContext';
import { ViewType } from '../types';

export const Sidebar: React.FC = () => {
  const { currentView, setCurrentView, setIsTutorialOpen, setIsSettingsOpen } = useApp();

  const navItems: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { 
      id: 'connection', 
      label: 'Terminal Hub', 
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> 
    },
    { 
      id: 'mirror', 
      label: 'Live Stream', 
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> 
    },
    { 
      id: 'files', 
      label: 'Asset Explorer', 
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg> 
    },
    { 
      id: 'network', 
      label: 'Tunnel Ops', 
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg> 
    },
    { 
      id: 'info', 
      label: 'Core Specs', 
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg> 
    },
  ];

  return (
    <aside className="w-full h-full flex flex-col bg-surface/30 overflow-hidden group hover:backdrop-blur-3xl transition-all duration-300">
      {/* Navigation Area - pt-16 to match the Header height, or pt-2 for a clean top-aligned look */}
      <nav className="flex-1 flex flex-col pt-16 space-y-1 overflow-hidden">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`w-full flex items-center h-12 transition-all duration-300 relative group/btn whitespace-nowrap ${
              currentView === item.id 
                ? 'text-white' 
                : 'text-textSecondary hover:text-white hover:bg-white/5'
            }`}
          >
            {/* BACKGROUND HIGHLIGHT */}
            {currentView === item.id && (
              <div className="absolute inset-x-2 inset-y-1 bg-primary rounded-xl shadow-glow z-0 animate-fade-in" />
            )}

            {/* ICON CONTAINER */}
            <div className={`relative z-10 flex-shrink-0 w-16 flex items-center justify-center transition-transform duration-300 group-hover/btn:scale-110 ${
              currentView === item.id ? 'text-white' : 'text-primary/70'
            }`}>
              {item.icon}
            </div>
            
            {/* LABEL */}
            <span className={`relative z-10 transition-all duration-300 text-[11px] font-black uppercase tracking-widest leading-none ${
              currentView === item.id ? 'text-white' : 'text-textSecondary group-hover/btn:text-white'
            } opacity-0 -translate-x-3 group-hover:opacity-100 group-hover:translate-x-0`}>
              {item.label}
            </span>
            
            {/* SIDE INDICATOR BAR */}
            {currentView === item.id && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full shadow-glow z-20" />
            )}
          </button>
        ))}
      </nav>

      {/* Utility Area */}
      <div className="flex flex-col mb-8 pt-6 space-y-1 overflow-hidden border-t border-white/5">
        <button 
          onClick={() => setIsTutorialOpen(true)}
          className="w-full flex items-center h-12 transition-all duration-300 relative group/util text-textSecondary hover:text-white hover:bg-white/5 whitespace-nowrap"
        >
          <div className="flex-shrink-0 w-16 flex items-center justify-center transition-colors group-hover/util:text-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="transition-all duration-300 text-[11px] font-black uppercase tracking-widest leading-none opacity-0 -translate-x-3 group-hover:opacity-100 group-hover:translate-x-0">
            Setup Guide
          </span>
        </button>
        
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="w-full flex items-center h-12 transition-all duration-300 relative group/util text-textSecondary hover:text-white hover:bg-white/5 whitespace-nowrap"
        >
          <div className="flex-shrink-0 w-16 flex items-center justify-center transition-colors group-hover/util:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <span className="transition-all duration-300 text-[11px] font-black uppercase tracking-widest leading-none opacity-0 -translate-x-3 group-hover:opacity-100 group-hover:translate-x-0">
            Global Config
          </span>
        </button>
      </div>
    </aside>
  );
};
