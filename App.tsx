import React from 'react';
import { AppProvider } from './context/AppContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { DeviceStatus } from './components/DeviceStatus';
import { Controls } from './components/Controls';
import { ObsStatus } from './components/ObsStatus';
import { LogViewer } from './components/LogViewer';
import { SettingsModal } from './components/SettingsModal';
import { TutorialModal } from './components/TutorialModal';

const DashboardContent: React.FC = () => {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header />
      
      <main className="flex-1 p-6 pt-28 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-[500px]">
          {/* Left Column: Status (3 cols) - HIDDEN for scrcpy focus */}
          <div className="lg:col-span-3 space-y-6 flex flex-col hidden">
            <DeviceStatus />
            <ObsStatus />
          </div>

          {/* Middle Column: Controls (expanded since status hidden) */}
          <div className="lg:col-span-6 flex flex-col">
            <Controls />
          </div>

          {/* Right Column: Logs (expanded) */}
          <div className="lg:col-span-6 flex flex-col h-full max-h-[calc(100vh-160px)]">
            <LogViewer />
          </div>
        </div>
      </main>

      <SettingsModal />
      <TutorialModal />
      <Footer />
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