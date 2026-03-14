
import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { ConnectionPanel } from './components/views/ConnectionPanel';
import { MirrorPanel } from './components/views/MirrorPanel';
import { FilePanel } from './components/views/FilePanel';
import { NetworkPanel } from './components/views/NetworkPanel';
import { InfoPanel } from './components/views/InfoPanel';
import { SettingsModal } from './components/SettingsModal';
import { TutorialModal } from './components/TutorialModal';
import { AboutModal } from './components/AboutModal';

const DashboardContent: React.FC = () => {
  const { currentView, status, isBackendOffline, setIsAboutOpen, setIsTutorialOpen } = useApp();

  React.useEffect(() => {
    window.electron.onShowOnboarding(() => {
        setIsTutorialOpen(true);
    });
  }, [setIsTutorialOpen]);

  const renderView = () => {
    switch (currentView) {
      case 'connection': return <ConnectionPanel />;
      case 'mirror': return <MirrorPanel />;
      case 'files': return <FilePanel />;
      case 'network': return <NetworkPanel />;
      case 'info': return <InfoPanel />;
      default: return <ConnectionPanel />;
    }
  };

  const currentDevice = status.device.currentDevice;

  return (
    <div className="flex flex-col h-screen bg-background text-textPrimary overflow-hidden font-sans text-sm selection:bg-primary/30">
      
      {/* 1. FULL-WIDTH HEADER */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-surface/60 backdrop-blur-3xl shrink-0 z-[120] w-full">
        <div className="flex items-center gap-6">
           {/* BRANDING */}
           <div className="flex items-center gap-4">
              <div className="bg-primary/20 p-3 rounded-2xl flex-shrink-0 shadow-glow ring-1 ring-white/10">
                 <img 
                    src="./assets/Stream_Fusion_logo-.png" 
                    alt="Logo" 
                    className="w-10 h-10 object-contain" 
                 />
              </div>
              <span className="font-black text-2xl tracking-tighter animated-gradient-text uppercase select-none drop-shadow-sm">
                STREMFUSION
              </span>
              <span className="text-[10px] font-black text-primary/40 uppercase tracking-[0.3em] ml-1">Nexus Core</span>
           </div>
        </div>

        <div className="flex items-center gap-6">
           {/* SERVICE STATUS */}
           <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
              <div className={`w-2 h-2 rounded-full ${isBackendOffline ? 'bg-danger shadow-glow-danger' : 'bg-secondary shadow-glow-success'} animate-pulse`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-textSecondary">
                {isBackendOffline ? 'Service Offline' : 'Core Service Active'}
              </span>
           </div>
           
           {currentDevice && (
             <>
               <div className="w-px h-6 bg-white/10" />
               <div className="flex items-center gap-3">
                 <div className="flex flex-col items-end">
                   <span className="text-[10px] text-textSecondary font-black uppercase tracking-tighter leading-none mb-0.5">Connected</span>
                   <span className="text-xs font-bold text-white uppercase tracking-tight">{currentDevice.name}</span>
                 </div>
                 <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary/10 border border-secondary/20 rounded-md text-[10px] text-secondary font-black shadow-inner">
                   {currentDevice.battery}%
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                     <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                   </svg>
                 </div>
               </div>
             </>
           )}

           <div className="w-px h-6 bg-white/10" />

           <button 
             onClick={() => setIsAboutOpen(true)}
             className="group flex items-center gap-2 px-5 py-2.5 text-[10px] font-black text-white transition-all bg-primary/10 hover:bg-primary border border-primary/20 hover:border-primary/40 rounded-xl uppercase tracking-[0.2em] shadow-lg hover:shadow-glow active:scale-95"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             System Info
           </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 2. SIDEBAR (Starts below Header) */}
        <div className="w-16 hover:w-64 flex-shrink-0 transition-[width] duration-500 cubic-bezier(0.4, 0, 0.2, 1) relative z-[110] border-r border-white/5 bg-surface/20">
          <Sidebar />
        </div>

        {/* 3. MAIN CONTENT AREA */}
        <div className="flex flex-col flex-1 overflow-hidden relative">
          <main className="flex-1 overflow-hidden relative bg-[#070708]">
            <div className="h-full overflow-y-auto custom-scrollbar p-8">
              <div className="animate-fade-in min-h-full">
                {renderView()}
              </div>
            </div>
            
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
               <div className="h-full w-full bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px]"></div>
            </div>
          </main>

          <Footer />
        </div>
      </div>

      {/* MODALS */}
      <SettingsModal />
      <TutorialModal />
      <AboutModal />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <DashboardContent />
    </AppProvider>
  );
};

export default App;
