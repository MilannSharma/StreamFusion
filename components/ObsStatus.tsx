import React from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export const ObsStatus: React.FC = () => {
  const { status, isBackendOffline } = useApp();
  const { connected, sources } = status.obs;

  const SourceIndicator = ({ label, active }: { label: string; active: boolean }) => (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-secondary shadow-glow-success' : 'bg-surfaceHighlight'}`} />
      <span className={`text-xs ${active ? 'text-white' : 'text-textSecondary/50'}`}>{label}</span>
    </div>
  );

  return (
    <div className="bg-surface rounded-2xl p-1 border border-white/5 shadow-xl relative overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            OBS Studio
          </h2>
          <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
            connected 
              ? 'bg-secondary/10 text-secondary border-secondary/20 shadow-glow-success' 
              : 'bg-danger/10 text-danger border-danger/20'
          }`}>
            {connected ? 'Connected' : 'Offline'}
          </div>
        </div>

        <div className="bg-black/40 rounded-lg p-3 border border-white/5 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-textSecondary">Active Sources</span>
          </div>
          <div className="space-y-2">
            <SourceIndicator label="Stremfusion_Screen" active={sources.screen} />
            <SourceIndicator label="Stremfusion_Audio" active={sources.audio} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => alert("Reconnection logic triggered")}
            disabled={isBackendOffline}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 text-textSecondary hover:text-white border border-white/5 text-xs font-medium rounded-lg transition-colors disabled:opacity-30"
          >
            Reconnect
          </button>
          <button 
            onClick={api.openObs}
            className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 text-xs font-medium rounded-lg transition-all"
          >
            Launch OBS
          </button>
        </div>
      </div>
    </div>
  );
};