
import React from 'react';
import { useApp } from '../context/AppContext';

export const Header: React.FC = () => {
  const { setIsSettingsOpen, setIsAboutOpen } = useApp();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 px-6 flex items-center justify-between border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative bg-black border border-white/10 p-1.5 rounded-lg">
            <img 
              src="https://i.ibb.co/L50qgXF/image.png" 
              alt="Stremfusion Logo" 
              className="h-6 w-6 object-contain" 
            />
          </div>
        </div>
        <h1 className="text-lg font-bold tracking-tight text-white animated-gradient-text uppercase select-none">Stremfusion</h1>
      </div>

      <nav className="flex items-center gap-2">
        <button 
          onClick={() => setIsAboutOpen(true)}
          className="px-3 py-1.5 text-xs font-medium text-textSecondary hover:text-white transition-colors hover:bg-white/5 rounded-md"
        >
          About
        </button>
        <button 
          onClick={() => window.open('https://github.com/MilannSharma', '_blank')}
          className="px-3 py-1.5 text-xs font-medium text-textSecondary hover:text-white transition-colors hover:bg-white/5 rounded-md"
        >
          Documentation
        </button>
        <div className="w-px h-4 bg-white/10 mx-2"></div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2 bg-surface hover:bg-surfaceHighlight border border-white/10 hover:border-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 shadow-lg shadow-black/30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </nav>
    </header>
  );
};
