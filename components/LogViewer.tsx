import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export const LogViewer: React.FC = () => {
  const { logs } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Mock logs if empty for UI demo purposes
  const displayLogs = logs.length > 0 ? logs : [
    { id: '0', timestamp: new Date().toLocaleTimeString(), level: 'info', message: 'System initialized...' },
    { id: '1', timestamp: new Date().toLocaleTimeString(), level: 'warning', message: 'Waiting for device connection...' },
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-amber-400';
      case 'success': return 'text-emerald-400';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="bg-[#050505] rounded-2xl border border-white/10 shadow-xl flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
        <span className="text-xs font-mono text-textSecondary/70 uppercase tracking-widest">Terminal Output</span>
        <div className="flex gap-1.5 opacity-50">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs custom-scrollbar">
        {displayLogs.map((log, idx) => (
          <div key={log.id || idx} className="mb-1.5 last:mb-0 break-words leading-relaxed group hover:bg-white/[0.02] -mx-2 px-2 rounded">
            <span className="text-zinc-600 mr-3 select-none">[{log.timestamp}]</span>
            <span className={`${getLevelColor(log.level)} font-medium`}>
               {log.level === 'success' && '❯ '}
               {log.message}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="animate-pulse flex gap-2 items-center text-zinc-700 mt-2">
            <span className="text-emerald-500">➜</span>
            <span className="h-4 w-2 bg-zinc-600 inline-block animate-pulse"></span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};