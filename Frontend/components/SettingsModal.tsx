import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AppSettings } from '../types';

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setIsSettingsOpen, settings, updateSettings, status, refreshStatus } = useApp();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  if (!isSettingsOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]: name === 'obsPort' || name.startsWith('scrcpy') ? Number(value) : value
    }));
  };

  const handleSave = async () => {
    updateSettings(localSettings);
    // Persist to store
    await window.electron.saveSetting('appSettings', localSettings);
    setIsSettingsOpen(false);
  };

  const handleToggleStartup = async (enabled: boolean) => {
    await window.electron.setLaunchOnStartup(enabled);
    await window.electron.saveSetting('launchOnStartup', enabled);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    // In a real app, we'd send these specific localSettings to a test endpoint
    // For now, we save and refresh to simulate the verification
    updateSettings(localSettings);
    await refreshStatus();
    setTimeout(() => setIsTesting(false), 800);
  };

  const InputField = ({ label, name, type = "text", placeholder, options, children }: any) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-textSecondary uppercase tracking-wide">{label}</label>
      {options ? (
        <div className="relative">
          <select 
            name={name} 
            title={label}
            aria-label={label}
            value={localSettings[name as keyof AppSettings]} 
            onChange={handleChange}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm appearance-none"
          >
            {options.map((opt: any) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="absolute right-3 top-3 pointer-events-none text-textSecondary">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      ) : (
        <div className="relative">
          <input 
            type={type} 
            name={name}
            value={localSettings[name as keyof AppSettings]}
            onChange={handleChange}
            className={`w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-white/20 ${children ? 'pr-10' : ''}`}
            placeholder={placeholder}
          />
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 flex flex-col max-h-[90vh] overflow-hidden animate-fade-in ring-1 ring-white/5">
        
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 text-primary rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">Application Settings</h2>
          </div>
          <button onClick={() => setIsSettingsOpen(false)} title="Close Settings" className="text-textSecondary hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
          {/* Scrcpy Section */}
          <div>
            <div className="flex items-center gap-2 mb-4 text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-bold uppercase tracking-wider">Screen Mirroring</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <InputField 
                  label="Resolution" 
                  name="scrcpyResolution" 
                  options={[
                    {value: 1920, label: '1920p (Full HD)'},
                    {value: 1600, label: '1600p'},
                    {value: 1280, label: '1280p (HD)'},
                    {value: 1024, label: '1024p'},
                    {value: 800, label: '800p'},
                  ]} 
                />
              </div>
              <InputField label="Bitrate (Mbps)" name="scrcpyBitrate" type="number" />
              <InputField label="Max FPS" name="scrcpyFps" type="number" />
            </div>
          </div>

          <div className="h-px bg-white/5 w-full"></div>

          {/* OBS Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <h3 className="text-sm font-bold uppercase tracking-wider">OBS WebSocket</h3>
              </div>
              <button 
                onClick={handleTestConnection}
                disabled={isTesting}
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border transition-all ${
                  isTesting ? 'bg-white/5 text-textSecondary border-white/5' : 'bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/20'
                }`}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
            </div>

            <p className="text-[10px] text-textSecondary mb-4 leading-tight italic">
              Enable in OBS via Tools &gt; WebSocket Server Settings. Ensure "Enable WebSocket server" is checked.
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <InputField label="Host" name="obsHost" placeholder="localhost" />
                </div>
                <InputField label="Port" name="obsPort" type="number" placeholder="4455" />
              </div>
              
              <InputField 
                label="Server Password" 
                name="obsPassword" 
                type={showPassword ? "text" : "password"} 
                placeholder="Required for secure connection"
              >
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-8 text-textSecondary hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </InputField>
              
              <div className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${status.obs.connected ? 'bg-secondary/5 border-secondary/20' : 'bg-surfaceHighlight border-white/5'}`}>
                <span className="text-xs font-medium text-textSecondary">Current Status:</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${status.obs.connected ? 'text-secondary' : 'text-danger'}`}>
                  {status.obs.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-end gap-3">
          <button 
            onClick={() => setIsSettingsOpen(false)}
            className="px-4 py-2 text-sm font-medium text-textSecondary hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-primary hover:bg-primaryHover text-white text-sm font-bold rounded-lg shadow-glow transition-all active:scale-95"
          >
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
};