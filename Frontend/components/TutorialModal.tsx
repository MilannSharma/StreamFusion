import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const TutorialModal: React.FC = () => {
  const { isTutorialOpen, setIsTutorialOpen } = useApp();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const steps = [
    {
      id: 1,
      title: "Connect the Cable",
      description: "Plug your mobile device into your PC using a high-quality USB data cable.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m19.28 0H17.5m1.8-10.5h-2.1c-2.07 0-3.75-1.68-3.75-3.75V3.75m3.75 0V1.5m0 2.25h-3.75m3.75 0V3.75m-3.75 0v2.25m0-2.25h3.75" />
        </svg>
      )
    },
    {
      id: 2,
      title: "Enable Developer Mode",
      description: "Open Settings > About Phone. Tap 'Build Number' 7 times rapidly until you see 'You are now a developer'.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: 3,
      title: "Enable USB Debugging",
      description: "Go to Settings > Developer Options (often under System). Find 'USB Debugging' and switch it ON.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        </svg>
      )
    },
    {
      id: 4,
      title: "Grant Permission",
      description: "Look at your phone screen. A prompt will appear asking to allow USB debugging. Tap 'Allow'.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  ];

  useEffect(() => {
    if (isTutorialOpen) {
      setCompletedSteps([]);
      setShowSuccess(false);
    }
  }, [isTutorialOpen]);

  useEffect(() => {
    if (completedSteps.length === steps.length) {
      const timer = setTimeout(() => {
        setShowSuccess(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [completedSteps, steps.length]);

  const toggleStep = (id: number) => {
    if (completedSteps.includes(id)) {
      setCompletedSteps(completedSteps.filter(stepId => stepId !== id));
    } else {
      setCompletedSteps([...completedSteps, id]);
    }
  };

  const handleClose = async () => {
    await window.electron.completeOnboarding();
    setIsTutorialOpen(false);
  };

  if (!isTutorialOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl border border-white/10 flex flex-col max-h-[90vh] overflow-hidden ring-1 ring-white/5 relative">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02] z-10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-colors duration-500 ${showSuccess ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}`}>
              {showSuccess ? (
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                 </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{showSuccess ? "Success!" : "Connect Android"}</h2>
              <p className="text-xs text-textSecondary">{showSuccess ? "Device connection established" : "Follow steps to enable USB debugging"}</p>
            </div>
          </div>
          <button onClick={handleClose} title="Close Tutorial" className="text-textSecondary hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar z-10 min-h-[400px] flex flex-col relative">
          {showSuccess ? (
            <div className="flex-1 flex flex-col items-center justify-center animate-fade-in text-center py-8">
              <div className="relative flex items-center justify-center mb-10 w-full max-w-sm">
                <div className="relative z-10 bg-surface border border-white/10 p-4 rounded-2xl shadow-xl animate-[bounce_2s_infinite]">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-4 bg-zinc-700 rounded-sm"></div>
                </div>
                <div className="flex-1 h-2 bg-white/5 rounded-full mx-4 relative overflow-hidden min-w-[100px]">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-secondary to-transparent w-full h-full animate-[shimmer_1.5s_infinite] opacity-50"></div>
                  <div className="absolute top-0 left-0 h-full bg-secondary w-full origin-left animate-[grow_0.5s_ease-out_forwards]"></div>
                </div>
                <div className="relative z-10 bg-surface border border-white/10 p-4 rounded-2xl shadow-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-secondary rounded-full border-2 border-surface shadow-glow-success animate-pulse"></div>
                </div>
                <div className="absolute -top-10 bg-secondary text-white p-2 rounded-full shadow-lg shadow-secondary/20 animate-[bounce_0.5s_ease-out_0.5s_both]">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Connected Successfully!</h3>
              <p className="text-textSecondary mb-8">Your Android device is paired and ready for streaming.</p>
              <button 
                onClick={handleClose}
                className="px-8 py-3 bg-secondary hover:bg-emerald-400 text-white text-sm font-bold rounded-xl shadow-glow-success transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <span>Start Streaming</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="relative">
                <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-white/10"></div>
                {steps.map((step, index) => {
                  const isCompleted = completedSteps.includes(step.id);
                  return (
                    <div 
                      key={step.id} 
                      className={`relative flex gap-6 mb-8 last:mb-0 group cursor-pointer`}
                      onClick={() => toggleStep(step.id)}
                    >
                      <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                        isCompleted 
                          ? 'bg-primary border-primary text-white shadow-glow' 
                          : 'bg-surface border-white/10 text-textSecondary group-hover:border-primary/50 group-hover:text-primary'
                      }`}>
                        {isCompleted ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          step.icon
                        )}
                      </div>
                      <div className={`flex-1 p-4 rounded-xl border transition-all duration-300 ${
                        isCompleted 
                          ? 'bg-primary/10 border-primary/30' 
                          : 'bg-white/5 border-white/5 group-hover:bg-white/10 group-hover:border-white/10'
                      }`}>
                        <h3 className={`text-base font-bold mb-1 ${isCompleted ? 'text-white' : 'text-textPrimary'}`}>
                          {index + 1}. {step.title}
                        </h3>
                        <p className="text-sm text-textSecondary leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {!showSuccess && (
          <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-between items-center z-10">
            <p className="text-xs text-textSecondary">Click on steps to mark them as done.</p>
            <button 
              onClick={handleClose}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg transition-all border border-white/10"
            >
              Close
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes grow {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};