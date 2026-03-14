import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { CameraMode, CameraFrame } from '../../types';

export const MirrorPanel: React.FC = () => {
  const { status, settings, updateSettings, cameraSettings, setCameraSettings, logs, refreshStatus, clearLogs } = useApp();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isRecording, setIsRecording] = useState(false);
  const [hideNavBar, setHideNavBar] = useState(true);
  
  // Recording settings
  const [recordFps, setRecordFps] = useState(60);
  const [recordQuality, setRecordQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [saveToDevice, setSaveToDevice] = useState(false);
  const [showRecordSettings, setShowRecordSettings] = useState(false);

  const videoRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs]);

  const handleStartMirror = async () => {
    if (!status.device.androidConnected || !status.device.currentDevice) return;
    
    setIsLoading(true);
    try {
      const mirrorSettings = {
        resolution: settings.scrcpyResolution,
        bitrate: settings.scrcpyBitrate,
        fps: settings.scrcpyFps,
        turnScreenOff: true,
        hideNavBar: hideNavBar
      };
      
      const deviceId = status.device.currentDevice.id;
      await window.electron.startStream(deviceId, mirrorSettings);
    } catch (error) {
      console.error("Failed to start mirror", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopMirror = async () => {
    setIsLoading(true);
    try {
      await window.electron.stopStream();
    } catch (error) {
      console.error("Failed to stop mirror", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRecord = async () => {
    if (!status.device.currentDevice) return;
    
    if (isRecording) {
      await window.electron.stopRecording();
      setIsRecording(false);
    } else {
      const recSettings = {
        fps: recordFps,
        quality: recordQuality,
        saveToDevice: saveToDevice,
        bitrate: recordQuality === 'high' ? 16 : recordQuality === 'medium' ? 8 : 4
      };
      await window.electron.startRecording(status.device.currentDevice.id, recSettings);
      setIsRecording(true);
    }
  };

  const handleScreenshot = async () => {
    if (!status.device.currentDevice) return;
    setIsLoading(true);
    try {
      const path = await window.electron.takeScreenshot(status.device.currentDevice.id);
      // Success feedback could be a toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleCamera = async () => {
    if (!status.device.currentDevice) return;
    await window.electron.startCameraCapture(status.device.currentDevice.id);
  };

  const handleVideo = async () => {
    if (!status.device.currentDevice) return;
    await window.electron.startVideoCapture(status.device.currentDevice.id);
  };

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const openCamera = () => setShowCameraModal(true);
  const selectCameraMode = (mode: CameraMode, frame: CameraFrame = 'box') => {
    setCameraSettings({ mode, frame });
    setShowCameraModal(false);
  };

  return (
    <div className={`flex flex-col h-full gap-6 ${isFullscreen ? 'fixed inset-0 z-[200] bg-black p-0' : ''}`}>
      {!isFullscreen && (
        <div className="flex justify-between items-end animate-in fade-in slide-in-from-top duration-500">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">Mirror Matrix</h1>
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20 tracking-widest uppercase">NODE_ACTIVE</span>
            </div>
            
            <div className="flex items-center gap-4 mt-3">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-textSecondary uppercase tracking-widest">Refresh Rate</span>
                <select 
                  title="Refresh Rate"
                  value={settings.scrcpyFps}
                  onChange={(e) => updateSettings({ scrcpyFps: Number(e.target.value) })}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold text-white outline-none focus:border-primary/50"
                >
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                  <option value={120}>120 FPS</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-textSecondary uppercase tracking-widest">Pipe Density</span>
                <select 
                  title="Pipe Density (Bitrate)"
                  value={settings.scrcpyBitrate}
                  onChange={(e) => updateSettings({ scrcpyBitrate: Number(e.target.value) })}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold text-white outline-none focus:border-primary/50"
                >
                  <option value={4}>4 Mbps</option>
                  <option value={8}>8 Mbps</option>
                  <option value={16}>16 Mbps</option>
                  <option value={32}>32 Mbps</option>
                </select>
              </div>

              <div className="flex items-center gap-2 mt-4 ml-2">
                 <input 
                   type="checkbox" 
                   id="hideNav" 
                   checked={hideNavBar} 
                   onChange={(e) => setHideNavBar(e.target.checked)}
                   className="w-3 h-3 bg-white/5 border-white/10 rounded"
                 />
                 <label htmlFor="hideNav" className="text-[9px] font-black text-white/40 uppercase tracking-widest cursor-pointer hover:text-white transition-colors">Hide Nav Bar</label>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {status.streaming ? (
              <button 
                onClick={handleStopMirror}
                disabled={isLoading}
                className="bg-red-500 hover:bg-red-400 text-white px-8 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all flex items-center gap-2"
              >
                {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <div className="w-2 h-2 bg-white rounded-full animate-pulse" />}
                Terminate Mirror
              </button>
            ) : (
              <button 
                onClick={handleStartMirror}
                disabled={isLoading || !status.device.androidConnected}
                className={`px-8 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 border ${
                  status.device.androidConnected 
                    ? 'bg-primary text-white border-primary shadow-glow hover:scale-105 active:scale-95' 
                    : 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed'
                }`}
              >
                {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Initialize Link
              </button>
            )}

            <div className="w-px h-10 bg-white/10 mx-1" />

            <button 
              onClick={() => setShowLogs(!showLogs)}
              className={`p-2.5 rounded-xl transition-all border ${showLogs ? 'bg-primary/10 text-primary border-primary/20' : 'bg-white/5 text-white/60 border-white/10'}`}
              title="Toggle Console"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Video Container */}
      <div 
        ref={videoRef}
        className={`relative flex-1 bg-[#050505] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl group flex items-center justify-center transition-all duration-500 ${isFullscreen ? 'rounded-none border-0' : ''}`}
      >
        {status.device.androidConnected ? (
          <div 
            className="w-full h-full bg-[#08080a] flex items-center justify-center relative overflow-hidden transition-transform duration-500"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <div className="text-center z-10 flex flex-col items-center">
               <div className="w-24 h-24 bg-cyan-500/10 text-cyan-400 rounded-[2rem] flex items-center justify-center mb-6 border border-cyan-500/20 shadow-glow animate-pulse">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                 </svg>
               </div>
               <p className="text-white/40 text-xs font-black uppercase tracking-[0.6em]">Mirror Link Active</p>
               <div className="mt-4 flex gap-2">
                  <div className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
                  <div className="w-1 h-1 rounded-full bg-cyan-400 animate-ping [animation-delay:200ms]" />
                  <div className="w-1 h-1 rounded-full bg-cyan-400 animate-ping [animation-delay:400ms]" />
               </div>
            </div>

            {/* HUD / Recording Toolbar */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-6 py-3 bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-500 -translate-y-4 group-hover:translate-y-0 shadow-2xl z-50">
               <button 
                 onClick={handleToggleRecord}
                 className={`p-3 rounded-xl transition-all flex items-center gap-2 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                 title={isRecording ? 'Stop Recording' : 'Start Screen Record'}
               >
                 <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
                 <span className="text-[10px] font-black uppercase tracking-widest">{isRecording ? 'REC ON' : 'REC'}</span>
               </button>
               
               <div className="w-px h-6 bg-white/10 mx-2" />
               
               <button onClick={handleScreenshot} className="p-3 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Take Screenshot">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
               </button>
               
               <button onClick={handleCamera} className="p-3 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Open Camera App">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
               </button>

               <button onClick={handleVideo} className="p-3 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Open Video App">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
               </button>

               <div className="w-px h-6 bg-white/10 mx-2" />

               <button 
                 onClick={() => setShowRecordSettings(!showRecordSettings)}
                 className={`p-3 rounded-xl transition-all ${showRecordSettings ? 'text-primary bg-primary/10' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                 title="Record Settings"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
               </button>
            </div>

            {/* Record Settings Panel */}
            {showRecordSettings && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 w-64 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-2xl p-5 shadow-2xl z-50 animate-in fade-in zoom-in duration-300">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Quality</span>
                    <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                       {(['low', 'medium', 'high'] as const).map(q => (
                         <button 
                           key={q}
                           onClick={() => setRecordQuality(q)}
                           className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${recordQuality === q ? 'bg-primary text-white' : 'text-white/30 hover:text-white'}`}
                         >
                           {q}
                         </button>
                       ))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-white/40 uppercase tracking-widest">
                    <span>Target FPS</span>
                    <select 
                      title="Target FPS"
                      value={recordFps}
                      onChange={(e) => setRecordFps(Number(e.target.value))}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white outline-none"
                    >
                      <option value={30}>30 FPS</option>
                      <option value={60}>60 FPS</option>
                    </select>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Store On Device</span>
                    <button 
                      title="Toggle Save to Device"
                      onClick={() => setSaveToDevice(!saveToDevice)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${saveToDevice ? 'bg-primary' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${saveToDevice ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-12 flex flex-col items-center max-w-sm">
            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6 text-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Mirror Offline</h3>
            <p className="text-xs text-textSecondary opacity-60 uppercase tracking-widest font-bold">Authorize terminal to begin high-def data mirroring.</p>
          </div>
        )}
      </div>

      {/* Log Console */}
      {showLogs && !isFullscreen && (
        <div className="h-48 bg-black/60 backdrop-blur-3xl rounded-[2rem] border border-white/10 overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-500">
          <div className="px-6 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">Live Scrcpy Log Stream</span>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={clearLogs} 
                className="text-[8px] font-black text-white/20 hover:text-white uppercase tracking-widest transition-colors"
                title="Clear logs"
              >
                Flush Pipe
              </button>
              <button onClick={() => setShowLogs(false)} className="text-white/20 hover:text-white transition-colors" title="Hide Logs">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] custom-scrollbar">
            <div className="flex flex-col gap-1.5">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 items-start opacity-0 animate-in fade-in duration-300 fill-mode-forwards">
                  <span className="text-white/10 whitespace-nowrap">[{log.timestamp.split('T')[1].split('.')[0]}]</span>
                  <span className={`flex-1 break-all ${log.level === 'error' ? 'text-red-500' : log.level === 'success' ? 'text-green-500' : 'text-white/60'}`}>{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
