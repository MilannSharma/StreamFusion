import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AppSettings } from '../types';

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setIsSettingsOpen, settings, updateSettings } = useApp();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  if (!isSettingsOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]: name === 'obsPort' || name.startsWith('scrcpy') ? Number(value) : value
    }));
  };

  const handleSave = () => {
    updateSettings(localSettings);
    setIsSettingsOpen(false);
  };

  const InputField = ({ label, name, type = "text", placeholder, options }: any) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-textSecondary uppercase tracking-wide">{label}</label>
      {options ? (
        <div className="relative">
          <select 
            name={name} 
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
        <input 
          type={type} 
          name={name}
          value={localSettings[name as keyof AppSettings]}
          onChange={handleChange}
          className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-white/20"
          placeholder={placeholder}
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 flex flex-col max-h-[90vh] overflow-hidden animate-fade-in ring-1 ring-white/5">
        
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <h2 className="text-lg font-bold text-white">Application Settings</h2>
          <button onClick={() => setIsSettingsOpen(false)} className="text-textSecondary hover:text-white transition-colors">
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
              <h3 className="text-sm font-bold uppercase tracking-wider">Screen Mirroring (Scrcpy)</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
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
              <InputField label="Bitrate (Mbps)" name="scrcpyBitrate" type="number" />
              <InputField label="Max FPS" name="scrcpyFps" type="number" />
            </div>
          </div>

          <div className="h-px bg-white/5 w-full"></div>

          {/* OBS Section */}
          <div>
            <div className="flex items-center gap-2 mb-4 text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-bold uppercase tracking-wider">OBS WebSocket</h3>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <InputField label="Host" name="obsHost" placeholder="localhost" />
                </div>
                <InputField label="Port" name="obsPort" type="number" placeholder="4455" />
              </div>
              <InputField label="Password" name="obsPassword" type="password" placeholder="••••••••" />
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
            className="px-6 py-2 bg-primary hover:bg-primaryHover text-white text-sm font-bold rounded-lg shadow-glow transition-all"
          >
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
};