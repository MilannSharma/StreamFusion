
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export const Controls: React.FC = () => {
  const { status, settings, obsAutoConfig, setObsAutoConfig, isBackendOffline } = useApp();
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await api.startStream(settings, obsAutoConfig);
    } catch (error) {
      console.error("Failed to start stream", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await api.stopStream();
    } catch (error) {
      console.error("Failed to stop stream", error);
    } finally {
      setIsLoading(false);
    }
  };

  const isStreaming = status.streaming;
  const canStart = !isBackendOffline && status.device.androidConnected && !isStreaming;
  const canStop = !isBackendOffline && isStreaming;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Start Button */}
      <button
        onClick={handleStart}
        disabled={!canStart || isLoading}
        className={`group relative flex-1 flex flex-col items-center justify-center p-8 rounded-3xl border transition-all duration-300 overflow-hidden ${
          canStart 
            ? 'bg-surface border-primary/20 hover:border-primary/50 hover:shadow-glow cursor-pointer' 
            : 'bg-surface/50 border-white/5 opacity-50 cursor-not-allowed'
        }`}
      >
        {canStart && (
           <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}
        
        <div className={`relative z-10 p-5 rounded-full mb-6 transition-transform duration-300 group-hover:scale-110 ${
          canStart ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-surfaceHighlight text-textSecondary'
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        </div>
        <span className={`relative z-10 text-xl font-black uppercase tracking-widest ${canStart ? 'text-white' : 'text-textSecondary'}`}>
          Initialize Mirror
        </span>
        <span className="relative z-10 text-[10px] font-bold uppercase tracking-[0.2em] text-textSecondary mt-2">Launch SCRCPY Engine</span>
      </button>

      {/* Stop Button */}
      <button
        onClick={handleStop}
        disabled={!canStop || isLoading}
        className={`group relative flex-1 flex flex-col items-center justify-center p-8 rounded-3xl border transition-all duration-300 overflow-hidden ${
          canStop 
            ? 'bg-surface border-danger/20 hover:border-danger/50 hover:shadow-glow-danger cursor-pointer' 
            : 'bg-surface/50 border-white/5 opacity-50 cursor-not-allowed'
        }`}
      >
        {canStop && (
           <div className="absolute inset-0 bg-gradient-to-br from-danger/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}

        <div className={`relative z-10 p-5 rounded-full mb-6 transition-transform duration-300 group-hover:scale-110 ${
          canStop ? 'bg-danger/20 text-danger border border-danger/20' : 'bg-surfaceHighlight text-textSecondary'
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        </div>
        <span className={`relative z-10 text-xl font-black uppercase tracking-widest ${canStop ? 'text-white' : 'text-textSecondary'}`}>
          Terminate Session
        </span>
        <span className="relative z-10 text-[10px] font-bold uppercase tracking-[0.2em] text-textSecondary mt-2">Kill active processes</span>
      </button>

      {/* Auto Config Switch */}
      <div className="bg-surface border border-white/5 rounded-2xl p-5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase tracking-wider">Sync OBS Studio</p>
            <p className="text-[10px] text-textSecondary font-bold uppercase tracking-widest">Auto-Inject Scene Hook</p>
          </div>
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer group">
          <input 
            type="checkbox" 
            checked={obsAutoConfig} 
            onChange={(e) => setObsAutoConfig(e.target.checked)} 
            className="sr-only peer" 
          />
          <div className="w-12 h-7 bg-surfaceHighlight peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-textSecondary after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white group-hover:after:scale-90"></div>
        </label>
      </div>
    </div>
  );
};
