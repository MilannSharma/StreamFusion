import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FileEntry, TransferProgress } from '../../types';

export const FilePanel: React.FC = () => {
  const { status } = useApp();
  const [pcPath, setPcPath] = useState<string[]>([]);
  const [mobilePath, setMobilePath] = useState<string[]>(['/sdcard/']);
  
  const [pcView, setPcView] = useState<'drives' | 'files'>('drives');
  
  const [pcFiles, setPcFiles] = useState<FileEntry[]>([]);
  const [mobileFiles, setMobileFiles] = useState<FileEntry[]>([]);
  const [pcDrives, setPcDrives] = useState<FileEntry[]>([]);
  
  const [loadingPc, setLoadingPc] = useState(false);
  const [loadingMobile, setLoadingMobile] = useState(false);
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);

  const dragOverCount = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const isConnected = status.device.androidConnected;

  // Listen for progress
  useEffect(() => {
    window.electron.onTransferProgress((data) => {
      setTransferProgress(data);
      if (data.percent === 100) {
        setTimeout(() => setTransferProgress(null), 2000);
      }
    });
  }, []);

  // Initial load
  useEffect(() => {
    fetchPcDrives();
    if (isConnected) {
      fetchMobileFiles('/sdcard/');
    }
  }, [isConnected]);

  // Handle local FS browsing
  const fetchPcDrives = async () => {
    setLoadingPc(true);
    try {
      const drives = await window.electron.getLocalDrives();
      setPcDrives(drives);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPc(false);
    }
  };

  const fetchPcFiles = async (path: string) => {
    setLoadingPc(true);
    try {
      const files = await window.electron.listLocalFiles(path);
      setPcFiles(files);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPc(false);
    }
  };

  // Handle mobile FS browsing
  const fetchMobileFiles = async (path: string) => {
    setLoadingMobile(true);
    try {
      const files = await window.electron.listDeviceFiles(path);
      setMobileFiles(files);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMobile(false);
    }
  };

  const navigatePc = (item: FileEntry) => {
    if (item.type === 'drive') {
      setPcView('files');
      const newPath = [item.name];
      setPcPath(newPath);
      fetchPcFiles(newPath.join(''));
    } else if (item.type === 'folder') {
      const newPath = [...pcPath, item.name + '\\'];
      setPcPath(newPath);
      fetchPcFiles(newPath.join(''));
    }
  };

  const navigateMobile = (item: FileEntry) => {
    if (item.type === 'folder') {
      const current = mobilePath.join('');
      const newPath = current.endsWith('/') ? `${current}${item.name}/` : `${current}/${item.name}/`;
      setMobilePath([newPath]);
      fetchMobileFiles(newPath);
    }
  };

  const goBackPc = () => {
    if (pcPath.length <= 1) {
      setPcView('drives');
      setPcPath([]);
      fetchPcDrives();
    } else {
      const newPath = pcPath.slice(0, -1);
      setPcPath(newPath);
      fetchPcFiles(newPath.join(''));
    }
  };

  const goBackMobile = () => {
    const current = mobilePath[0];
    if (current === '/sdcard/') return;
    
    const parts = current.split('/').filter(Boolean);
    if (parts.length <= 1) {
      setMobilePath(['/sdcard/']);
      fetchMobileFiles('/sdcard/');
    } else {
      const newPart = '/' + parts.slice(0, -1).join('/') + '/';
      setMobilePath([newPart]);
      fetchMobileFiles(newPart);
    }
  };

  const handlePush = async (localPath: string) => {
    const remote = mobilePath.join('');
    try {
      await window.electron.pushFile(localPath, remote);
      fetchMobileFiles(remote);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePull = async (item: FileEntry) => {
    const remote = mobilePath.join('') + item.name;
    // For now pull to Downloads/StremFusion as per user request (handled in backend if not specified)
    try {
      await window.electron.pullFile(remote, ''); 
      // Refresh local view if we are in the downloads folder? 
      // For now just success notification through logs (handled in main.ts)
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (item: FileEntry) => {
    const path = mobilePath.join('') + item.name;
    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      setLoadingMobile(true);
      try {
        await window.electron.deleteFile(path);
        fetchMobileFiles(mobilePath.join(''));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingMobile(false);
      }
    }
  };

  const [showMkdirInput, setShowMkdirInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleOpen = async (item: FileEntry) => {
    const remote = mobilePath.join('') + item.name;
    setLoadingMobile(true);
    try {
      await window.electron.openFile(remote);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMobile(false);
    }
  };

  const handleMkdir = async () => {
    if (!newFolderName.trim()) return;
    const path = mobilePath.join('') + newFolderName.trim();
    setLoadingMobile(true);
    try {
      await window.electron.createFolder(path);
      setNewFolderName('');
      setShowMkdirInput(false);
      fetchMobileFiles(mobilePath.join(''));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMobile(false);
    }
  };

  // Drag & Drop handlers
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverCount.current++;
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverCount.current--;
    if (dragOverCount.current === 0) setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent, targetPath?: string) => {
    e.preventDefault();
    setIsDragging(false);
    dragOverCount.current = 0;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i] as any;
        if (file.path) {
          const remote = targetPath || mobilePath.join('');
          try {
            await window.electron.pushFile(file.path, remote);
            fetchMobileFiles(remote);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  };

  const renderFileIcon = (item: FileEntry) => {
    if (item.type === 'drive') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    }
    if (item.type === 'folder') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    }
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full relative">
      {/* PC Side (unchanged logic) */}
      <div className="bg-surface border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-xs font-black uppercase tracking-widest text-textSecondary flex-shrink-0">Local Computer</span>
            {pcView === 'files' && (
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-white/20">/</span>
                <span className="text-[10px] font-mono text-primary font-bold truncate">{pcPath.join('')}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pcView === 'files' && (
              <button onClick={goBackPc} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-textSecondary hover:text-white" title="Go Back">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </button>
            )}
            <button 
              onClick={() => pcView === 'drives' ? fetchPcDrives() : fetchPcFiles(pcPath.join(''))}
              className={`p-1.5 hover:bg-white/5 rounded-lg transition-colors text-textSecondary hover:text-white ${loadingPc ? 'animate-spin' : ''}`}
              title="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-6 flex flex-col overflow-hidden">
          <div 
            onDragEnter={onDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-2xl p-6 w-full group transition-all cursor-pointer mb-6 text-center shadow-2xl ${
              isDragging 
                ? 'border-primary bg-primary/10 scale-[1.02]' 
                : 'border-white/5 bg-white/[0.01] hover:bg-primary/[0.02] hover:border-primary/50'
            }`}
          >
             <div className={`p-3 rounded-full mb-3 transition-all inline-block shadow-glow ${isDragging ? 'bg-primary text-white scale-125' : 'bg-primary/10 text-primary'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
             </div>
             <p className="text-sm font-black text-white uppercase tracking-tight">{isDragging ? 'Drop to Sync' : 'Drop to Transfer'}</p>
             <p className="text-[10px] text-textSecondary uppercase tracking-widest mt-1">Files will be sent to StremFusion root</p>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-2">
             {pcView === 'drives' ? (
                <>
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest px-2 mb-3 font-black">Detected Disks</p>
                  {pcDrives.map((drive) => (
                    <button 
                      key={drive.name} 
                      onClick={() => navigatePc(drive)}
                      className="w-full group p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/5 hover:border-primary/20 transition-all text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:scale-110 transition-transform">
                          {renderFileIcon(drive)}
                        </div>
                        <div>
                          <p className="text-xs font-black text-white uppercase tracking-tight">{drive.name}</p>
                          <p className="text-[9px] text-textSecondary uppercase tracking-widest font-bold">Local Storage Unit</p>
                        </div>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white/20 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  ))}
                </>
             ) : (
                <>
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest px-2 mb-3 font-black">PC Directory List</p>
                  {pcFiles.map((file) => (
                    <div 
                      key={file.name} 
                      onClick={() => file.type === 'folder' && navigatePc(file)}
                      className={`group p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/5 transition-all ${file.type === 'folder' ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`p-2 rounded-lg ${file.type === 'folder' ? 'bg-yellow-500/10' : 'bg-white/5'}`}>
                          {renderFileIcon(file)}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-white uppercase tracking-tight truncate">{file.name}</p>
                          <p className="text-[9px] text-textSecondary uppercase tracking-widest">{file.type === 'folder' ? 'Directory' : `${file.size} • ${file.extension} File`}</p>
                        </div>
                      </div>
                      {file.type === 'file' && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handlePush(pcPath.join('') + file.name); }}
                            className="p-2 hover:bg-primary/20 text-primary rounded-lg transition-colors" 
                            title="Push to Mobile Device"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
             )}
          </div>
        </div>
      </div>

      {/* Device Side */}
      <div className="bg-surface border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-xs font-black uppercase tracking-widest text-textSecondary flex-shrink-0">Mobile Storage</span>
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-white/20">/</span>
              <span className="text-[10px] font-mono text-secondary font-bold truncate">{mobilePath[0]}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMkdirInput(!showMkdirInput)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-textSecondary hover:text-white" title="New Folder">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
            </button>
            {mobilePath[0] !== '/sdcard/' && (
              <button onClick={goBackMobile} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-textSecondary hover:text-white" title="Go Back">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </button>
            )}
            <button 
              onClick={() => fetchMobileFiles(mobilePath[0])}
              className={`p-1.5 hover:bg-white/5 rounded-lg transition-colors text-textSecondary hover:text-white ${loadingMobile ? 'animate-spin' : ''}`}
              title="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-6 flex flex-col overflow-hidden">
           {showMkdirInput && (
             <div className="mb-4 flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/10 animate-in fade-in slide-in-from-top-1">
                <input 
                  autoFocus
                  type="text" 
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMkdir()}
                  placeholder="New folder name..."
                  className="flex-1 bg-transparent border-none outline-none text-xs text-white px-2 py-1 uppercase tracking-tight font-bold"
                />
                <button onClick={handleMkdir} className="p-1.5 bg-secondary/20 text-secondary hover:bg-secondary/30 rounded-lg transition-colors" title="Confirm New Folder">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
                <button onClick={() => setShowMkdirInput(false)} className="p-1.5 hover:bg-white/10 text-textSecondary rounded-lg transition-colors" title="Cancel">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
             </div>
           )}

           {!isConnected ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
               {/* Unchanged Empty State */}
               <div className="p-4 bg-danger/10 rounded-full text-danger animate-pulse">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                 </svg>
               </div>
               <div>
                 <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">Mirror Link Not established</h3>
                 <p className="text-[10px] text-textSecondary uppercase tracking-widest leading-relaxed">Connect a device via USB or Wireless to bridge the filesystem.</p>
               </div>
             </div>
           ) : (
              <div 
                onDragEnter={onDragEnter}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, mobilePath[0])} 
                className={`flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-2 relative transition-all ${isDragging ? 'bg-secondary/5 rounded-xl border border-secondary/20' : ''}`}
              >
                 <p className="text-[10px] text-textSecondary uppercase tracking-widest px-2 mb-3 font-black">Device File List</p>
                 {mobileFiles.length === 0 && !loadingMobile && (
                   <div className="flex flex-col items-center justify-center p-12 opacity-20">
                     <p className="text-xs font-bold uppercase tracking-widest">No Files Found</p>
                   </div>
                 )}
                 {mobileFiles.map((file) => (
                   <div 
                     key={file.name} 
                     onClick={() => file.type === 'folder' && navigateMobile(file)}
                     className={`group p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/10 transition-all ${file.type === 'folder' ? 'cursor-pointer' : 'cursor-default'}`}
                   >
                     <div className="flex items-center gap-3 overflow-hidden">
                       <div className={`p-2 rounded-lg ${file.type === 'folder' ? 'bg-yellow-500/10' : 'bg-white/5'}`}>
                         {renderFileIcon(file)}
                       </div>
                       <div className="overflow-hidden">
                         <p className="text-xs font-bold text-white uppercase tracking-tight truncate">{file.name}</p>
                         <p className="text-[9px] text-textSecondary uppercase tracking-widest">{file.type === 'folder' ? 'Directory' : `${file.size || 'Size N/A'} • ${file.permissions || ''}`}</p>
                       </div>
                     </div>
                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       {file.type === 'file' && (
                         <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleOpen(file); }}
                            className="p-2 hover:bg-primary/20 text-primary rounded-lg transition-colors" 
                            title="Open File on PC"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handlePull(file); }}
                            className="p-2 hover:bg-secondary/20 text-secondary rounded-lg transition-colors" 
                            title="Download to PC"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </button>
                         </>
                       )}
                       <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                          className="p-2 hover:bg-danger/20 text-danger rounded-lg transition-colors" 
                          title="Delete"
                       >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                       </button>
                     </div>
                   </div>
                 ))}
                 
                 {isDragging && (
                   <div className="absolute inset-0 bg-secondary/10 backdrop-blur-[2px] border-2 border-dashed border-secondary/40 rounded-xl flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-300">
                     <div className="text-center group-hover:scale-110 transition-transform">
                       <div className="w-16 h-16 bg-secondary/20 rounded-full flex items-center justify-center mx-auto mb-4 text-secondary shadow-glow-secondary">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
                       </div>
                       <p className="text-sm font-black text-white uppercase tracking-tighter">Drop to Upload</p>
                       <p className="text-[9px] text-secondary font-bold uppercase tracking-widest mt-1">Syncing with nexus io</p>
                     </div>
                   </div>
                 )}
              </div>
            )}
           
           <div className="mt-4 p-4 bg-secondary/5 border border-secondary/20 rounded-xl flex items-center justify-between shadow-glow-secondary/20">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 ${isConnected ? 'bg-secondary animate-pulse' : 'bg-white/20'} rounded-full`} />
                <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Nexus IO Engine {isConnected ? 'Link Active' : 'Offline'}</span>
              </div>
              <span className="text-[10px] font-bold text-textSecondary uppercase tracking-tight">V2.4 Protocol</span>
           </div>
        </div>
      </div>

      {/* Transfer Progress HUD */}
      {transferProgress && (
        <div className="absolute inset-0 z-[200] flex items-end justify-center pb-12 pointer-events-none px-12">
           <div className="w-full bg-black/80 backdrop-blur-2xl border border-primary/30 rounded-[2.5rem] p-8 shadow-[0_0_100px_rgba(30,144,255,0.3)] animate-slide-in-bottom pointer-events-auto">
              <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/20 text-primary rounded-2xl animate-pulse">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-white uppercase tracking-tight mb-1">
                        {transferProgress.type === 'push' ? 'Pushing to Device' : 'Pulling to Computer'}
                      </h4>
                      <p className="text-xs font-bold text-primary uppercase tracking-widest">{transferProgress.fileName}</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <span className="text-3xl font-black text-white font-mono">{transferProgress.percent}%</span>
                    <p className="text-[10px] text-textSecondary font-black uppercase tracking-widest mt-1">{transferProgress.speed} • {Math.round(transferProgress.transferred / 1024 / 1024)} MB Transferred</p>
                 </div>
              </div>
              <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/5">
                 <div 
                    className="h-full bg-gradient-to-r from-primary to-secondary shadow-glow transition-all duration-300" 
                    style={{ width: `${transferProgress.percent}%` }}
                 />
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
