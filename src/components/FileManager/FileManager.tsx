import React, { useState, useEffect, useRef } from 'react';
import {
  Folder, File, Image, Film, Music, Download, Upload, Trash2, Edit3,
  FolderPlus, RefreshCw, ChevronRight, ArrowUp, HardDrive, Eye, EyeOff,
  CheckSquare, Square, MoreVertical, X, ExternalLink
} from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  size: string;
  sizeBytes: number;
  sizeDisplay: string;
  date: string;
  perms: string;
}

interface FileManagerProps {
  serial: string;
  onToast: (msg: string, icon?: string) => void;
}

const QUICK_CHIPS = [
  { label: 'Storage', path: '/sdcard/', icon: HardDrive },
  { label: 'Downloads', path: '/sdcard/Download/', icon: Download },
  { label: 'Camera', path: '/sdcard/DCIM/Camera/', icon: Image },
  { label: 'Pictures', path: '/sdcard/Pictures/', icon: Image },
  { label: 'Movies', path: '/sdcard/Movies/', icon: Film },
  { label: 'Music', path: '/sdcard/Music/', icon: Music },
  { label: 'Documents', path: '/sdcard/Documents/', icon: File },
];

export default function FileManager({ serial, onToast }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState<string>('/sdcard/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [transferStatus, setTransferStatus] = useState<string>('');

  // Modals
  const [modalType, setModalType] = useState<'mkdir' | 'rename' | 'delete' | null>(null);
  const [modalInput, setModalInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async (targetPath: string) => {
    if (!serial) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/files/list?serial=${encodeURIComponent(serial)}&path=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      if (data.success) {
        setFiles(data.files || []);
        setCurrentPath(data.currentPath || targetPath);
        setSelectedFile(null);
      } else {
        onToast(data.message || 'Failed to list directory', '❌');
      }
    } catch (err: any) {
      onToast(`Error: ${err.message}`, '❌');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (serial) {
      fetchFiles(currentPath);
    }
  }, [serial]);

  const navigateUp = () => {
    if (currentPath === '/sdcard/' || currentPath === '/sdcard') return;
    const parts = currentPath.replace(/\/$/, '').split('/');
    parts.pop();
    const parent = parts.join('/') + '/';
    fetchFiles(parent.startsWith('/sdcard') ? parent : '/sdcard/');
  };

  const handleItemClick = (item: FileItem) => {
    setSelectedFile(item);
  };

  const handleItemDoubleClick = (item: FileItem) => {
    if (item.isDir) {
      fetchFiles(item.path.endsWith('/') ? item.path : `${item.path}/`);
    } else {
      handleDownload(item);
    }
  };

  // Upload handlers
  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !serial) return;
    setTransferStatus(`Uploading ${fileList.length} item(s)...`);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      let nativePath = '';
      if ((window as any).electronAPI?.getPathForFile) {
        nativePath = (window as any).electronAPI.getPathForFile(file);
      }

      try {
        if (nativePath) {
          // Native electron file push with 0 memory overhead
          const res = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serial,
              filePath: nativePath,
              remoteDir: currentPath,
              isApkInstall: file.name.toLowerCase().endsWith('.apk')
            })
          });
          const data = await res.json();
          if (data.success) {
            onToast(data.message, '✅');
          } else {
            onToast(data.message, '❌');
          }
        } else {
          // Web fallback base64
          const reader = new FileReader();
          await new Promise<void>((resolve, reject) => {
            reader.onload = async () => {
              const base64 = (reader.result as string).split(',')[1];
              const res = await fetch('/api/files/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  serial,
                  fileName: file.name,
                  base64Data: base64,
                  remoteDir: currentPath
                })
              });
              const data = await res.json();
              if (data.success) onToast(data.message, '✅');
              else onToast(data.message, '❌');
              resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
      } catch (err: any) {
        onToast(`Upload failed: ${err.message}`, '❌');
      }
    }

    setTransferStatus('');
    fetchFiles(currentPath);
  };

  // Download handler
  const handleDownload = async (item: FileItem) => {
    if (!serial || !item) return;
    setTransferStatus(`Downloading ${item.name} to PC...`);
    try {
      const res = await fetch('/api/files/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial,
          remotePath: item.path
        })
      });
      const data = await res.json();
      if (data.success) {
        onToast(`Saved to Downloads: ${item.name}`, '📥');
        if ((window as any).electronAPI?.openPath) {
          (window as any).electronAPI.openPath(data.folder);
        }
      } else {
        onToast(data.message || 'Download failed', '❌');
      }
    } catch (err: any) {
      onToast(`Download error: ${err.message}`, '❌');
    } finally {
      setTransferStatus('');
    }
  };

  // Operations: mkdir, rename, delete
  const executeOperation = async () => {
    if (!serial || !modalType) return;
    try {
      let body: any = { serial, action: modalType };
      if (modalType === 'mkdir') {
        body.targetPath = currentPath;
        body.newName = modalInput.trim();
      } else if (modalType === 'rename') {
        if (!selectedFile) return;
        body.targetPath = selectedFile.path;
        body.newName = modalInput.trim();
      } else if (modalType === 'delete') {
        if (!selectedFile) return;
        body.targetPath = selectedFile.path;
      }

      const res = await fetch('/api/files/operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        onToast(data.message, '✅');
        setModalType(null);
        setModalInput('');
        fetchFiles(currentPath);
      } else {
        onToast(data.message, '❌');
      }
    } catch (err: any) {
      onToast(`Action failed: ${err.message}`, '❌');
    }
  };

  const getFileIcon = (item: FileItem) => {
    if (item.isDir) return <Folder size={18} color="#2563eb" />;
    const ext = item.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext || '')) {
      return <Image size={18} color="#10b981" />;
    }
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext || '')) {
      return <Film size={18} color="#8b5cf6" />;
    }
    if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext || '')) {
      return <Music size={18} color="#f59e0b" />;
    }
    if (ext === 'apk') {
      return <File size={18} color="#06b6d4" />;
    }
    return <File size={18} color="#64748b" />;
  };

  // Filter hidden files
  const displayFiles = showHidden ? files : files.filter(f => !f.name.startsWith('.'));

  // Path segments for breadcrumb
  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Folder size={24} color="#2563eb" />
            <span>Mobile File Manager</span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            High-speed wireless and USB file explorer with drag-and-drop push and 1-click download.
          </p>
        </div>

        {transferStatus && (
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#2563eb',
            background: '#eff6ff',
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid #bfdbfe'
          }}>
            {transferStatus}
          </div>
        )}
      </div>

      {/* Quick Location Chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 14 }}>
        {QUICK_CHIPS.map(chip => {
          const Icon = chip.icon;
          const isActive = currentPath === chip.path;
          return (
            <button
              key={chip.path}
              onClick={() => fetchFiles(chip.path)}
              className={`brand-pill ${isActive ? 'active' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              <Icon size={14} />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Breadcrumb & Navigation Bar */}
      <div className="glass-panel" style={{
        padding: '10px 14px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflowX: 'auto' }}>
          <button
            onClick={navigateUp}
            disabled={currentPath === '/sdcard/' || currentPath === '/sdcard'}
            className="btn-icon"
            style={{ width: 30, height: 30, opacity: (currentPath === '/sdcard/' || currentPath === '/sdcard') ? 0.3 : 1 }}
            title="Go to Parent Folder"
          >
            <ArrowUp size={16} />
          </button>

          <span style={{ color: '#94a3b8', margin: '0 4px' }}>|</span>

          <span
            onClick={() => fetchFiles('/sdcard/')}
            style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
          >
            Internal Storage
          </span>

          {pathParts.slice(1).map((part, idx) => {
            const subPath = '/' + pathParts.slice(0, idx + 2).join('/') + '/';
            return (
              <React.Fragment key={subPath}>
                <ChevronRight size={14} color="#94a3b8" />
                <span
                  onClick={() => fetchFiles(subPath)}
                  style={{
                    fontSize: 13,
                    color: idx === pathParts.length - 2 ? '#0f172a' : '#2563eb',
                    fontWeight: idx === pathParts.length - 2 ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {part}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
            title="Toggle Hidden Files"
          >
            {showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>{showHidden ? 'Hide Dotfiles' : 'Show Hidden'}</span>
          </button>

          <button
            onClick={() => fetchFiles(currentPath)}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: 11 }}
            title="Refresh List"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        background: '#f8fafc',
        padding: '8px 14px',
        borderRadius: 10,
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleUploadFiles(e.target.files)}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={14} />
            <span>Upload Files</span>
          </button>

          <button
            onClick={() => {
              setModalType('mkdir');
              setModalInput('');
            }}
            className="btn-secondary"
            style={{ padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FolderPlus size={14} />
            <span>New Folder</span>
          </button>
        </div>

        {selectedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!selectedFile.isDir && (
              <button
                onClick={() => handleDownload(selectedFile)}
                className="btn-secondary"
                style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb' }}
                title="Download to PC"
              >
                <Download size={14} />
                <span>Save to PC</span>
              </button>
            )}

            <button
              onClick={() => {
                setModalType('rename');
                setModalInput(selectedFile.name);
              }}
              className="btn-secondary"
              style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              title="Rename File"
            >
              <Edit3 size={14} />
              <span>Rename</span>
            </button>

            <button
              onClick={() => {
                setModalType('delete');
              }}
              className="btn-secondary"
              style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626' }}
              title="Delete File"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Drag & Drop Surface / File Table */}
      <div
        className="glass-panel"
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          handleUploadFiles(e.dataTransfer.files);
        }}
        style={{
          padding: 0,
          overflow: 'hidden',
          border: isDragging ? '2px dashed #2563eb' : '1px solid #e2e8f0',
          background: isDragging ? '#eff6ff' : '#ffffff',
          transition: 'all 0.15s ease'
        }}
      >
        {isDragging && (
          <div style={{
            padding: 30,
            textAlign: 'center',
            color: '#2563eb',
            fontWeight: 700,
            fontSize: 15
          }}>
            Drop files here to push to {currentPath}
          </div>
        )}

        {!isDragging && (
          <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px', width: 40 }}></th>
                  <th style={{ padding: '10px 14px' }}>Name</th>
                  <th style={{ padding: '10px 14px', width: 110 }}>Size</th>
                  <th style={{ padding: '10px 14px', width: 140 }}>Date Modified</th>
                  <th style={{ padding: '10px 14px', width: 90 }}>Permissions</th>
                </tr>
              </thead>
              <tbody>
                {displayFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                      {loading ? 'Loading files from device...' : 'No files in this folder'}
                    </td>
                  </tr>
                ) : (
                  displayFiles.map(file => {
                    const isSelected = selectedFile?.path === file.path;
                    return (
                      <tr
                        key={file.path}
                        onClick={() => handleItemClick(file)}
                        onDoubleClick={() => handleItemDoubleClick(file)}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isSelected ? '#eff6ff' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.1s ease'
                        }}
                      >
                        <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                          {getFileIcon(file)}
                        </td>
                        <td style={{ padding: '8px 14px', fontWeight: file.isDir ? 700 : 500, color: file.isDir ? '#0f172a' : '#334155' }}>
                          {file.name}
                        </td>
                        <td style={{ padding: '8px 14px', color: '#64748b', fontSize: 12 }}>
                          {file.sizeDisplay}
                        </td>
                        <td style={{ padding: '8px 14px', color: '#64748b', fontSize: 12 }}>
                          {file.date}
                        </td>
                        <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>
                          {file.perms}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialogs for mkdir / rename / delete */}
      {modalType && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 420,
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {modalType === 'mkdir' && 'Create New Folder'}
              {modalType === 'rename' && 'Rename Item'}
              {modalType === 'delete' && 'Delete Item'}
            </h3>

            {modalType === 'delete' ? (
              <p style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>
                Are you sure you want to permanently delete <strong>{selectedFile?.name}</strong> from your phone?
              </p>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
                  {modalType === 'mkdir' ? 'Folder Name:' : 'New Name:'}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={modalInput}
                  onChange={e => setModalInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && executeOperation()}
                  placeholder="Enter name..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    outline: 'none'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setModalType(null)}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={executeOperation}
                className={modalType === 'delete' ? 'btn-danger' : 'btn-primary'}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  background: modalType === 'delete' ? '#dc2626' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                {modalType === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
