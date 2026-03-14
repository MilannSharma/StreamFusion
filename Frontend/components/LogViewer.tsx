
import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export const LogViewer: React.FC = () => {
  const { logs } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-amber-400';
      case 'success': return 'text-emerald-400';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="bg-[#050505] rounded-3xl border border-white/10 shadow-2xl flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
        <span className="text-[10px] font-black text-textSecondary/70 uppercase tracking-[0.3em]">System Output Console</span>
        <div className="flex gap-2 opacity-30">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 font-mono text-xs custom-scrollbar bg-black/20">
        {logs.length > 0 ? (
          logs.map((log, idx) => (
            <div key={log.id || idx} className="mb-2 last:mb-0 break-words leading-relaxed group hover:bg-white/[0.02] -mx-2 px-2 rounded py-0.5">
              <span className="text-zinc-700 mr-4 select-none opacity-50">[{log.timestamp}]</span>
              <span className={`${getLevelColor(log.level)} font-medium`}>
                 {log.level === 'success' ? '✔ ' : log.level === 'error' ? '✘ ' : '❯ '}
                 {log.message}
              </span>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 italic gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 opacity-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[10px] uppercase font-black tracking-widest opacity-20">Idle Console — Awaiting Service Input</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
