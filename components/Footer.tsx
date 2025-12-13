import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="h-10 border-t border-white/5 flex items-center justify-between px-6 bg-black/40 mt-auto backdrop-blur-sm">
      <span className="text-[10px] text-textSecondary uppercase tracking-widest opacity-70">
        System Ready
      </span>
      <div className="text-[10px] text-textSecondary flex gap-2">
        <span>Powered by <span className="font-bold text-white">Nexa</span></span>
        <span className="opacity-20">|</span>
        <a 
          href="https://github.com/MilannSharma" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-white hover:text-primary transition-colors font-medium"
        >
          Milan Sharma
        </a>
      </div>
    </footer>
  );
};