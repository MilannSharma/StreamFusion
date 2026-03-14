
import React from 'react';
import { useApp } from '../context/AppContext';

export const AboutModal: React.FC = () => {
  const { isAboutOpen, setIsAboutOpen } = useApp();

  if (!isAboutOpen) return null;

  const repoFiles = [
    { name: 'assets/logo', type: 'folder' },
    { name: 'components', type: 'folder' },
    { name: 'context', type: 'folder' },
    { name: 'dist-electron', type: 'folder' },
    { name: 'dist', type: 'folder' },
    { name: 'electron', type: 'folder' },
    { name: 'public/assets/logo', type: 'folder' },
    { name: 'services', type: 'folder' },
    { name: 'tools/scrcpy-win64', type: 'folder' },
    { name: 'App.tsx', type: 'file' },
    { name: 'INSTALL.md', type: 'file' },
    { name: 'README.md', type: 'file' },
    { name: 'WINDOWS_BUILD.md', type: 'file' },
    { name: 'global.d.ts', type: 'file' },
    { name: 'index.html', type: 'file' },
    { name: 'index.tsx', type: 'file' },
    { name: 'metadata.json', type: 'file' },
    { name: 'package.json', type: 'file' },
    { name: 'tsconfig.json', type: 'file' },
    { name: 'vite.config.ts', type: 'file' },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-lg p-4 animate-fade-in overflow-hidden">
      <div className="bg-surface w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl border border-white/10 flex flex-col relative overflow-hidden">
        
        {/* Header (GitHub Style) */}
        <div className="px-8 py-4 border-b border-white/10 bg-black/40 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/20 overflow-hidden">
               <img src="https://github.com/MilannSharma.png" alt="Milan Sharma" className="w-full h-full object-cover" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-primary font-semibold text-sm">MilannSharma</span>
              <span className="text-white/20">/</span>
              <span className="text-white font-black tracking-tight text-sm">StreamFusion</span>
              <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-[10px] text-textSecondary font-bold">Public</span>
            </div>
          </div>
          <button 
            onClick={() => setIsAboutOpen(false)} 
            className="text-textSecondary hover:text-white transition-all p-2 bg-white/5 hover:bg-white/10 rounded-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Navigation Tabs (Mock) */}
        <div className="px-8 flex items-center gap-6 border-b border-white/5 bg-black/20 text-xs font-semibold text-textSecondary z-10 shrink-0">
          {['Code', 'Issues', 'Pull requests', 'Actions', 'Wiki', 'Security', 'Insights', 'Settings'].map((tab, idx) => (
            <div key={tab} className={`py-3 cursor-pointer border-b-2 transition-colors ${idx === 0 ? 'text-white border-primary' : 'border-transparent hover:text-white hover:border-white/10'}`}>
              {tab}
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 z-10 font-sans selection:bg-primary/30 bg-background/50">
          <div className="max-w-4xl mx-auto space-y-12">
            
            {/* Repository File List Section */}
            <section className="bg-surface border border-white/5 rounded-xl overflow-hidden shadow-xl">
               <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src="https://github.com/MilannSharma.png" alt="Milan" className="w-5 h-5 rounded-full" />
                    <span className="text-xs font-bold text-white">MilannSharma</span>
                    <span className="text-xs text-textSecondary">added core files and logic</span>
                  </div>
                  <span className="text-[10px] text-textSecondary font-mono uppercase">eeb6e27 · last month</span>
               </div>
               <div className="divide-y divide-white/5">
                 {repoFiles.map((file) => (
                   <div key={file.name} className="px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.02] group transition-colors">
                     <div className="flex items-center gap-3">
                        {file.type === 'folder' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-textSecondary opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        )}
                        <span className="text-xs text-textSecondary group-hover:text-primary transition-colors">{file.name}</span>
                     </div>
                     <span className="text-[10px] text-white/10 italic">last month</span>
                   </div>
                 ))}
               </div>
            </section>

            {/* README Content */}
            <article className="prose prose-invert max-w-none space-y-10">
              <div className="border border-white/5 rounded-2xl p-8 bg-surface shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <img 
                src="icon.png" 
                alt="StremFusion" 
                className="w-16 h-16 object-contain opacity-50"
              />  </div>
                
                <h1 className="text-4xl font-black text-white tracking-tighter mb-4 animated-gradient-text uppercase">Stremfusion v2.5.0</h1>
                <p className="text-lg text-textSecondary leading-relaxed border-l-4 border-primary pl-6 py-2 bg-primary/5 rounded-r-xl mb-8">
                  A powerful desktop application for Android device mirroring and streaming control.
                </p>

                <div className="flex flex-wrap gap-2 mb-10">
                  {['MIT License', 'Electron', 'React', 'Windows', 'v1.0.0', 'Active Development'].map(tag => (
                    <span key={tag} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-textSecondary uppercase tracking-widest">{tag}</span>
                  ))}
                </div>

                <div className="space-y-12">
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                      <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                      📱 About Stremfusion
                    </h2>
                    <p className="text-textSecondary leading-relaxed text-base">
                      Stremfusion is a modern, feature-rich desktop application that enables seamless Android device mirroring and control directly from your Windows PC. Built with cutting-edge web technologies and packaged as a native desktop application using Electron, Stremfusion delivers professional-grade device streaming with an intuitive, responsive user interface.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                      <span className="w-1.5 h-6 bg-secondary rounded-full"></span>
                      ✨ Core Capabilities
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        "Real-time HD Mirroring - Ultra low latency",
                        "Automatic Device Detection - USB & WiFi",
                        "Real-time Status Monitoring - ADB & Debugging",
                        "OBS Integration - Auto-configure scenes",
                        "Native Desktop Experience - Performance first",
                        "Secure & Local - No cloud processing"
                      ].map(cap => (
                        <div key={cap} className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          <span className="text-sm text-textSecondary">{cap}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                    <h2 className="text-xl font-bold text-white mb-4">🚀 Quick Start Installation</h2>
                    <div className="space-y-4 font-mono text-xs">
                      <div className="p-4 bg-black/60 rounded-lg border border-white/5 text-primary">
                        # 1. Download & Extract<br/>
                        # 2. Enable USB Debugging on Device<br/>
                        # 3. Connect & Launch Stremfusion
                      </div>
                      <div className="text-textSecondary leading-relaxed p-2">
                        Step 1: On Your Android Device: Go to Settings → About Phone → Tap Build Number 7 times. <br/>
                        Step 2: Enable USB Debugging in Developer Options.<br/>
                        Step 3: Connect via USB and authorize the prompt.
                      </div>
                    </div>
                  </section>

                  <section>
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                      <span className="w-1.5 h-6 bg-danger rounded-full"></span>
                      🔧 Troubleshooting
                    </h2>
                    <div className="space-y-4">
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                        <h4 className="text-white font-bold text-sm mb-1">Device Not Detected?</h4>
                        <p className="text-xs text-textSecondary">Check USB cable, ensure USB Debugging is ON, and try a USB 3.0 port.</p>
                      </div>
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                        <h4 className="text-white font-bold text-sm mb-1">ADB Not Ready?</h4>
                        <p className="text-xs text-textSecondary">Restart the application or disconnect and reconnect the device to reset the ADB server.</p>
                      </div>
                    </div>
                  </section>

                  <section className="pt-10 border-t border-white/5 text-center">
                    <p className="text-[10px] text-textSecondary uppercase tracking-[0.4em] mb-4">Developed by</p>
                    <h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-6">Milan Sharma</h3>
                    <div className="flex justify-center gap-4">
                      <a href="https://github.com/MilannSharma" target="_blank" className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-glow hover:scale-105 transition-all">GitHub Profile</a>
                    </div>
                    <p className="mt-12 text-[10px] text-textSecondary/40 uppercase tracking-widest leading-loose">
                      Stremfusion v2.5.0 is Fully OpenSource. <br/> 
                      Just Give credit To respective developers. <br/>
                      Licensed under MIT. © 2026 Milan Sharma.
                    </p>
                  </section>
                </div>
              </div>
            </article>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-white/10 bg-black/60 flex justify-end gap-3 z-10 shrink-0">
          <button 
            onClick={() => setIsAboutOpen(false)}
            className="px-12 py-3 bg-white hover:bg-zinc-200 text-black text-xs font-black rounded-2xl transition-all uppercase tracking-widest active:scale-95 shadow-xl"
          >
            Close Documentation
          </button>
        </div>

      </div>
    </div>
  );
};
