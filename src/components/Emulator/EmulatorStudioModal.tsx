import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2, Play, Square, Upload, RefreshCw, Smartphone, CheckCircle,
  AlertCircle, Sparkles, Trash2, ArrowUpRight, Cpu, Layers, HardDrive,
  FileCode, Zap, ExternalLink, HelpCircle, BookOpen, Download, ShieldCheck,
  Terminal, Activity, Wifi, WifiOff, Radio, Search
} from 'lucide-react';

interface EmulatorStudioModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onToast: (msg: string, icon?: string) => void;
  onStartMirror?: (serial: string) => void;
  isFullPageView?: boolean;
}

interface EmulatorLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

export const EmulatorStudioView: React.FC<EmulatorStudioModalProps> = ({
  onToast,
  onStartMirror,
  isFullPageView = true
}) => {
  const [status, setStatus] = useState<{
    installed: boolean;
    isInstalling?: boolean;
    installProgress?: number;
    installStage?: string;
    isRunning: boolean;
    port5555Open?: boolean;
    adbConnected: boolean;
    serial: string;
    port: number;
  }>({
    installed: false,
    isInstalling: false,
    installProgress: 0,
    installStage: '',
    isRunning: false,
    port5555Open: false,
    adbConnected: false,
    serial: 'localhost:5555',
    port: 5555
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isInstallingApk, setIsInstallingApk] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [apkPathInput, setApkPathInput] = useState('');
  const [installedApps, setInstalledApps] = useState<{ package: string; name: string }[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [activeTab, setActiveTab] = useState<'control' | 'apps' | 'logs' | 'guide' | 'specs'>('control');
  const [logs, setLogs] = useState<EmulatorLog[]>([]);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Poll status & logs
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/emulator/status');
      const data = await res.json();
      if (data.success) {
        setStatus(data);
      }
    } catch (e) {}
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/emulator/logs');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch (e) {}
  };

  const fetchDiagnostics = async () => {
    try {
      const res = await fetch('/api/emulator/diagnostics');
      const data = await res.json();
      if (data.success) {
        setDiagnostics(data);
      }
    } catch (e) {}
  };

  const clearLogs = async () => {
    try {
      await fetch('/api/emulator/logs/clear', { method: 'POST' });
      setLogs([{ id: 'c-1', timestamp: new Date().toLocaleTimeString(), level: 'info', message: 'Logs cleared' }]);
      onToast('Logs cleared', '🧹');
    } catch (e) {}
  };

  const fetchApps = async () => {
    setIsLoadingApps(true);
    try {
      const res = await fetch(`/api/emulator/apps?serial=${encodeURIComponent(status.serial || 'localhost:5555')}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.apps)) {
        setInstalledApps(data.apps);
      }
    } catch (e) {}
    finally {
      setIsLoadingApps(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    fetchDiagnostics();
    const interval = setInterval(() => {
      fetchStatus();
      if (activeTab === 'logs' || activeTab === 'control') {
        fetchLogs();
      }
    }, status.isInstalling ? 800 : 2500);
    return () => clearInterval(interval);
  }, [status.isInstalling, activeTab]);

  useEffect(() => {
    if (autoScrollLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScrollLogs]);

  useEffect(() => {
    if (status.adbConnected) {
      fetchApps();
    }
  }, [status.adbConnected]);

  // 1. One-Click Install Handler
  const handleInstallEmulator = async () => {
    try {
      const res = await fetch('/api/emulator/install', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onToast('Installing StreamFusion Emulator...', '⚡');
        setStatus(prev => ({ ...prev, isInstalling: true, installProgress: 15, installStage: 'Installing StreamFusion Emulator...' }));
        fetchStatus();
        fetchLogs();
      }
    } catch (e: any) {
      onToast('Installation error: ' + e.message, '❌');
    }
  };

  // 2. Launch Emulator
  const handleStartEmulator = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/emulator/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onToast('StreamFusion Emulator starting...', '🚀');
        fetchStatus();
        fetchLogs();
      } else {
        onToast(data.message || 'Failed to start emulator', '❌');
      }
    } catch (e: any) {
      onToast('Start error: ' + e.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Stop Emulator
  const handleStopEmulator = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/emulator/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onToast('StreamFusion Emulator stopped', '⏹️');
        fetchStatus();
        fetchLogs();
      }
    } catch (e: any) {
      onToast('Stop error: ' + e.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Smart Auto-Detect & Bridge (Scans WSA, LDPlayer, Nox, BlueStacks, AVD)
  const handleAutoConnect = async () => {
    setIsAutoConnecting(true);
    onToast('Scanning active Android emulators...', '🔍');
    try {
      const res = await fetch('/api/emulator/auto-connect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onToast(data.message || 'Connected to emulator!', '⚡');
        fetchStatus();
        fetchLogs();
        fetchApps();
      } else {
        onToast(data.message || 'No running emulator found on common ports.', 'ℹ️');
        fetchLogs();
      }
    } catch (e: any) {
      onToast('Auto-connect error: ' + e.message, '❌');
    } finally {
      setIsAutoConnecting(false);
    }
  };

  // 5. Connect Port 5555 directly
  const handleConnectPort5555 = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/emulator/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 5555 })
      });
      const data = await res.json();
      if (data.success) {
        onToast('ADB connected to emulator port 5555!', '✅');
        fetchStatus();
        fetchLogs();
      } else {
        onToast(data.message || 'Port 5555 is not active.', '⚠️');
        fetchLogs();
      }
    } catch (e: any) {
      onToast('Connection error: ' + e.message, '❌');
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Sideload APK
  const handleInstallApk = async (customPath?: string) => {
    const targetPath = (customPath || apkPathInput).trim();
    if (!targetPath) {
      onToast('Please enter an APK file path', '⚠️');
      return;
    }

    if (!status.adbConnected) {
      onToast('Please start or connect an emulator before installing APKs.', '⚠️');
      return;
    }

    setIsInstallingApk(true);
    onToast(`Pushing APK to emulator...`, '⏳');

    try {
      const res = await fetch('/api/emulator/install-apk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apkPath: targetPath,
          serial: status.serial || 'localhost:5555'
        })
      });
      const data = await res.json();
      if (data.success) {
        onToast('APK installed successfully! 🎉', '✅');
        setApkPathInput('');
        fetchApps();
        fetchLogs();
      } else {
        onToast(data.message || 'Failed to install APK', '❌');
        fetchLogs();
      }
    } catch (e: any) {
      onToast('Install error: ' + e.message, '❌');
    } finally {
      setIsInstallingApk(false);
    }
  };

  // 7. Browse APK via Native File Dialog
  const handleBrowseApk = async () => {
    try {
      if ((window as any).electronAPI?.showOpenDialog) {
        const result = await (window as any).electronAPI.showOpenDialog({
          title: 'Select Android Application (.apk)',
          filters: [{ name: 'Android Package (*.apk)', extensions: ['apk'] }],
          properties: ['openFile']
        });
        if (result && !result.canceled && result.filePaths?.[0]) {
          const selectedPath = result.filePaths[0];
          setApkPathInput(selectedPath);
          handleInstallApk(selectedPath);
        }
      } else {
        onToast('Enter the full path to your .apk file below', 'ℹ️');
      }
    } catch (e) {}
  };

  // 8. Launch App on Emulator
  const handleLaunchApp = async (pkg: string) => {
    try {
      const res = await fetch('/api/emulator/launch-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg, serial: status.serial || 'localhost:5555' })
      });
      const data = await res.json();
      if (data.success) {
        onToast(`Launched ${pkg.split('.').pop()}`, '▶️');
        fetchLogs();
      } else {
        onToast('Launch error: ' + data.output, '⚠️');
      }
    } catch (e) {}
  };

  // 9. Uninstall App
  const handleUninstallApp = async (pkg: string) => {
    try {
      const res = await fetch('/api/emulator/uninstall-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg, serial: status.serial || 'localhost:5555' })
      });
      const data = await res.json();
      if (data.success) {
        onToast(`Uninstalled ${pkg.split('.').pop()}`, '🗑️');
        fetchApps();
        fetchLogs();
      } else {
        onToast('Uninstall error: ' + data.output, '⚠️');
      }
    } catch (e) {}
  };

  // 10. Direct 60FPS Scrcpy Stream / Play on PC
  const handlePlayOnPC = () => {
    if (onStartMirror) {
      onStartMirror(status.serial || 'localhost:5555');
      onToast('Launching 60FPS StreamFusion Emulator Play window...', '🎮');
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return '#f87171';
      case 'warn': return '#fbbf24';
      case 'success': return '#4ade80';
      case 'debug': return '#a78bfa';
      default: return '#93c5fd';
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: 'transparent'
    }}>
      {/* Header Banner */}
      <div style={{
        padding: '20px 28px',
        background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: isFullPageView ? '18px 18px 0 0' : 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff'
          }}>
            <Gamepad2 size={28} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10 }}>
              StreamFusion Android Emulator
              <span style={{
                fontSize: 10,
                background: 'rgba(99, 102, 241, 0.35)',
                color: '#c7d2fe',
                border: '1px solid rgba(165, 180, 252, 0.3)',
                padding: '3px 10px',
                borderRadius: 999,
                fontWeight: 700
              }}>
                v3.2 SENTINEL ENGINE
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#a5b4fc', marginTop: 3 }}>
              Zero-Latency Android Subsystem · Safe ADB Bridge · Real-time Live Logs
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Port Sentinel Status */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: status.port5555Open ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
            color: status.port5555Open ? '#4ade80' : '#94a3b8',
            border: `1px solid ${status.port5555Open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(100, 116, 139, 0.3)'}`
          }}>
            <Activity size={12} color={status.port5555Open ? '#4ade80' : '#94a3b8'} />
            <span>Port 5555: {status.port5555Open ? 'Listening' : 'Inactive'}</span>
          </div>

          {/* ADB Connection Status */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: !status.installed
              ? '#1e1b4b'
              : (status.adbConnected ? '#052e16' : (status.isRunning ? '#451a03' : '#1e1b4b')),
            color: !status.installed
              ? '#94a3b8'
              : (status.adbConnected ? '#4ade80' : (status.isRunning ? '#fbbf24' : '#94a3b8')),
            border: `1px solid ${!status.installed ? '#475569' : (status.adbConnected ? '#22c55e' : (status.isRunning ? '#f59e0b' : '#475569'))}`
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: !status.installed
                ? '#64748b'
                : (status.adbConnected ? '#4ade80' : (status.isRunning ? '#fbbf24' : '#64748b'))
            }} />
            <span>
              {!status.installed
                ? (status.isInstalling ? 'Installing...' : 'Not Installed')
                : (status.adbConnected
                  ? `Connected (${status.serial})`
                  : (status.isRunning ? 'Running · Awaiting ADB' : 'Ready'))}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {!status.installed ? (
        /* INSTALLATION FLOW */
        <div style={{
          padding: 36,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          textAlign: 'center'
        }}>
          <div style={{
            width: 84,
            height: 84,
            borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(79, 70, 229, 0.25) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            border: '1.5px solid rgba(99, 102, 241, 0.3)'
          }}>
            <Sparkles size={42} color="#6366f1" />
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>
            StreamFusion Android Emulator Setup
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', maxWidth: 520, lineHeight: 1.5, marginBottom: 28 }}>
            Run Android mobile apps directly on your Windows PC with 60 FPS performance,
            ADB bridge networking, and direct drag-and-drop APK sideloading.
          </p>

          {status.isInstalling ? (
            <div style={{ width: '100%', maxWidth: 440, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>
                <span>Installing StreamFusion Emulator...</span>
                <span>{status.installProgress || 15}%</span>
              </div>

              <div style={{
                height: 10,
                width: '100%',
                background: '#e2e8f0',
                borderRadius: 999,
                overflow: 'hidden',
                marginBottom: 12
              }}>
                <div style={{
                  height: '100%',
                  width: `${status.installProgress || 15}%`,
                  background: 'linear-gradient(90deg, #4f46e5 0%, #2563eb 100%)',
                  borderRadius: 999,
                  transition: 'width 0.4s ease'
                }} />
              </div>

              <div style={{ fontSize: 12, color: '#64748b' }}>
                {status.installStage || 'Configuring Android Virtual Environment...'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                maxWidth: 480,
                marginBottom: 12,
                textAlign: 'left'
              }}>
                <div style={{ padding: 12, background: 'var(--bg-card, #f8fafc)', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>⚡ 60 FPS Scrcpy Play</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Ultra-smooth PC window streaming</div>
                </div>
                <div style={{ padding: 12, background: 'var(--bg-card, #f8fafc)', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>📦 1-Click APK Testing</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Direct sideloading with error guard</div>
                </div>
              </div>

              <button
                onClick={handleInstallEmulator}
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 14,
                  padding: '14px 34px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <Download size={18} />
                <span>Install StreamFusion Emulator</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* INSTALLED DASHBOARD WITH 5 COMPREHENSIVE TABS */
        <>
          {/* Sub-navigation Tabs */}
          <div style={{
            display: 'flex',
            padding: '6px 28px 0',
            background: 'var(--bg-card, #f8fafc)',
            borderBottom: '1px solid #e2e8f0',
            gap: 12
          }}>
            <button
              onClick={() => setActiveTab('control')}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: activeTab === 'control' ? '#4f46e5' : 'var(--text-muted, #64748b)',
                borderBottom: activeTab === 'control' ? '3px solid #4f46e5' : '3px solid transparent'
              }}
            >
              <Zap size={14} /> Emulator &amp; APK Testing
            </button>

            <button
              onClick={() => { setActiveTab('apps'); fetchApps(); }}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: activeTab === 'apps' ? '#4f46e5' : 'var(--text-muted, #64748b)',
                borderBottom: activeTab === 'apps' ? '3px solid #4f46e5' : '3px solid transparent'
              }}
            >
              <Smartphone size={14} /> Installed Apps ({installedApps.length})
            </button>

            <button
              onClick={() => { setActiveTab('logs'); fetchLogs(); }}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: activeTab === 'logs' ? '#4f46e5' : 'var(--text-muted, #64748b)',
                borderBottom: activeTab === 'logs' ? '3px solid #4f46e5' : '3px solid transparent'
              }}
            >
              <Terminal size={14} /> Live Logs &amp; Diagnostics ({logs.length})
            </button>

            <button
              onClick={() => setActiveTab('guide')}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: activeTab === 'guide' ? '#4f46e5' : 'var(--text-muted, #64748b)',
                borderBottom: activeTab === 'guide' ? '3px solid #4f46e5' : '3px solid transparent'
              }}
            >
              <BookOpen size={14} /> Complete Setup &amp; User Guide
            </button>

            <button
              onClick={() => setActiveTab('specs')}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: activeTab === 'specs' ? '#4f46e5' : 'var(--text-muted, #64748b)',
                borderBottom: activeTab === 'specs' ? '3px solid #4f46e5' : '3px solid transparent'
              }}
            >
              <Cpu size={14} /> Engine Specs &amp; Controls
            </button>
          </div>

          {/* Body Content */}
          <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {activeTab === 'control' && (
              <>
                {/* Sentinel Port & Engine Bar */}
                <div style={{
                  background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
                  borderRadius: 14,
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  border: '1px solid rgba(99, 102, 241, 0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(99, 102, 241, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#a5b4fc'
                    }}>
                      <Radio size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                        Universal Emulator Auto-Bridge
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {status.port5555Open
                          ? 'Port 5555 is open and ready for ADB connections'
                          : 'Probes WSA, BlueStacks, LDPlayer, Nox, MuMu, or QEMU'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleAutoConnect}
                      disabled={isAutoConnecting}
                      style={{
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                      }}
                    >
                      <Search size={14} className={isAutoConnecting ? 'spin' : ''} />
                      <span>{isAutoConnecting ? 'Scanning Ports...' : '⚡ Auto-Detect Any Emulator'}</span>
                    </button>

                    <button
                      onClick={handleConnectPort5555}
                      disabled={isLoading}
                      style={{
                        padding: '8px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 10,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#c7d2fe',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Activity size={14} />
                      <span>Connect 5555</span>
                    </button>
                  </div>
                </div>

                {/* Launch Hero Card */}
                <div style={{
                  background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
                  border: '1.5px solid #c7d2fe',
                  borderRadius: 16,
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16
                }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Sparkles size={18} color="#4f46e5" />
                      <span>Run Android Apps on Windows with Zero Latency</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: '#4338ca', marginTop: 4, maxWidth: 480, lineHeight: 1.45 }}>
                      StreamFusion Emulator engine uses zero-latency Scrcpy 60FPS streaming. Test APKs, run mobile games, and automate with ADB.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {!status.isRunning ? (
                      <button
                        onClick={handleStartEmulator}
                        disabled={isLoading}
                        style={{
                          padding: '11px 22px',
                          fontSize: 13,
                          fontWeight: 700,
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                          color: '#fff',
                          border: 'none',
                          boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer'
                        }}
                      >
                        <Play size={16} fill="white" />
                        <span>{isLoading ? 'Starting...' : 'Start StreamFusion Emulator'}</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handlePlayOnPC}
                          style={{
                            padding: '11px 20px',
                            fontSize: 13,
                            fontWeight: 700,
                            borderRadius: 12,
                            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                            color: '#fff',
                            border: 'none',
                            boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <Gamepad2 size={16} />
                          <span>Play on PC (60FPS)</span>
                        </button>

                        <button
                          onClick={handleStopEmulator}
                          disabled={isLoading}
                          style={{
                            padding: '11px 18px',
                            fontSize: 13,
                            fontWeight: 700,
                            borderRadius: 12,
                            color: '#dc2626',
                            borderColor: '#fca5a5',
                            border: '1px solid #fca5a5',
                            background: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <Square size={14} fill="#dc2626" />
                          <span>Stop</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Sideload & Install APK Lab with Safety Guard */}
                <div style={{
                  background: 'var(--bg-card, #f8fafc)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  padding: '20px 22px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
                        📦 Sideload &amp; Install APK for Testing
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                        Select any Android `.apk` file from your PC to install and test immediately inside the emulator.
                      </div>
                    </div>

                    {status.adbConnected ? (
                      <span style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', padding: '3px 10px', borderRadius: 999, fontWeight: 700, border: '1px solid #bbf7d0' }}>
                        ● Ready on {status.serial}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, background: '#fffbeb', color: '#b45309', padding: '3px 10px', borderRadius: 999, fontWeight: 700, border: '1px solid #fde68a' }}>
                        ⚠️ Awaiting Emulator Connection
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <input
                      type="text"
                      placeholder="Enter or paste full APK path (e.g. C:\Downloads\app-debug.apk)..."
                      value={apkPathInput}
                      onChange={e => setApkPathInput(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 12.5,
                        background: 'var(--bg-main, #ffffff)',
                        color: 'var(--text-main)',
                        outline: 'none'
                      }}
                    />

                    <button
                      onClick={handleBrowseApk}
                      style={{
                        padding: '9px 18px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        borderRadius: 10,
                        cursor: 'pointer'
                      }}
                    >
                      <Upload size={14} />
                      <span>Browse APK</span>
                    </button>

                    <button
                      onClick={() => handleInstallApk()}
                      disabled={isInstallingApk || !apkPathInput.trim()}
                      style={{
                        padding: '9px 20px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        background: !status.adbConnected
                          ? '#94a3b8'
                          : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: status.adbConnected ? 'pointer' : 'not-allowed'
                      }}
                    >
                      <Upload size={14} />
                      <span>{isInstallingApk ? 'Installing...' : 'Install APK'}</span>
                    </button>
                  </div>

                  {!status.adbConnected && (
                    <div style={{
                      padding: '8px 12px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: 8,
                      fontSize: 11.5,
                      color: '#92400e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10
                    }}>
                      <AlertCircle size={14} color="#b45309" />
                      <span>
                        <strong>Note:</strong> Start the emulator or click <strong>"⚡ Auto-Detect Any Emulator"</strong> above so ADB connects before pushing APKs.
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
                    <span>💡 <strong>Tip:</strong> You can also drag-and-drop any .apk file directly onto the StreamFusion mirror window while running!</span>
                  </div>
                </div>

                {/* Compact Live Terminal Log Preview */}
                <div style={{
                  background: '#0b0f19',
                  borderRadius: 14,
                  border: '1px solid #1e293b',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '8px 16px',
                    background: '#111827',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #1e293b'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, color: '#94a3b8' }}>
                      <Terminal size={14} color="#38bdf8" />
                      <span>Live Engine Diagnostics &amp; Console Logs</span>
                      <span style={{ fontSize: 10, background: '#1e293b', color: '#38bdf8', padding: '2px 8px', borderRadius: 999 }}>
                        {logs.length} entries
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={clearLogs}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          fontSize: 11,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Trash2 size={12} /> Clear
                      </button>
                      <button
                        onClick={() => setActiveTab('logs')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        Full Terminal <ArrowUpRight size={12} />
                      </button>
                    </div>
                  </div>

                  <div style={{
                    padding: 12,
                    maxHeight: 140,
                    overflowY: 'auto',
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    fontSize: 11,
                    lineHeight: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3
                  }}>
                    {logs.slice(-8).map(log => (
                      <div key={log.id} style={{ display: 'flex', gap: 8, wordBreak: 'break-all' }}>
                        <span style={{ color: '#475569', userSelect: 'none' }}>[{log.timestamp}]</span>
                        <span style={{ color: getLogLevelColor(log.level), fontWeight: 700, minWidth: 62 }}>
                          [{log.level.toUpperCase()}]
                        </span>
                        <span style={{ color: '#e2e8f0' }}>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'apps' && (
              /* INSTALLED APPS TAB */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                    Installed Third-Party &amp; Test Applications:
                  </span>
                  <button
                    onClick={fetchApps}
                    style={{
                      padding: '6px 14px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      borderRadius: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={12} className={isLoadingApps ? 'spin' : ''} />
                    <span>Refresh List</span>
                  </button>
                </div>

                {installedApps.length === 0 ? (
                  <div style={{
                    padding: 36,
                    textAlign: 'center',
                    background: 'var(--bg-card, #f8fafc)',
                    borderRadius: 14,
                    border: '1px dashed #cbd5e1',
                    color: '#64748b'
                  }}>
                    <Smartphone size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div style={{ fontSize: 14, fontWeight: 700 }}>No third-party apps found yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Start the emulator and sideload an APK in the first tab to test here.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {installedApps.map(app => (
                      <div
                        key={app.package}
                        style={{
                          padding: '12px 16px',
                          background: 'var(--bg-card, #f8fafc)',
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: '#eff6ff',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 15
                          }}>
                            {app.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                              {app.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {app.package}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleLaunchApp(app.package)}
                            style={{
                              padding: '6px 14px',
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                          >
                            <Play size={12} fill="white" />
                            <span>Launch</span>
                          </button>

                          <button
                            onClick={() => handleUninstallApp(app.package)}
                            style={{
                              padding: '6px 10px',
                              fontSize: 12,
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              background: '#fff',
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              /* DEDICATED FULL LIVE LOGS & DIAGNOSTICS TAB */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
                {/* Diagnostics Summary Card */}
                {diagnostics && (
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: 12,
                    background: diagnostics.qemuInstalled ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)',
                    border: `1px solid ${diagnostics.qemuInstalled ? '#bbf7d0' : '#fde68a'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={16} color={diagnostics.qemuInstalled ? '#16a34a' : '#d97706'} />
                        <span>System Engine Diagnostics</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                        {diagnostics.summary}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleAutoConnect}
                        disabled={isAutoConnecting}
                        style={{
                          padding: '6px 14px',
                          fontSize: 11.5,
                          fontWeight: 700,
                          borderRadius: 8,
                          background: '#4f46e5',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ Re-Scan Ports
                      </button>
                    </div>
                  </div>
                )}

                {/* Main Terminal Window */}
                <div style={{
                  background: '#070b14',
                  borderRadius: 14,
                  border: '1.5px solid #1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: 380,
                  overflow: 'hidden',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
                }}>
                  {/* Terminal Header */}
                  <div style={{
                    padding: '10px 18px',
                    background: '#0f172a',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginLeft: 8 }}>
                        StreamFusion Engine Terminal Output · {logs.length} events logged
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={autoScrollLogs}
                          onChange={e => setAutoScrollLogs(e.target.checked)}
                        />
                        Auto-scroll
                      </label>

                      <button
                        onClick={fetchLogs}
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: '#cbd5e1',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <RefreshCw size={11} /> Refresh
                      </button>

                      <button
                        onClick={clearLogs}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Trash2 size={11} /> Clear
                      </button>
                    </div>
                  </div>

                  {/* Terminal Lines Container */}
                  <div style={{
                    padding: 16,
                    overflowY: 'auto',
                    flex: 1,
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    fontSize: 11.5,
                    lineHeight: 1.6,
                    color: '#e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    {logs.map((log) => (
                      <div key={log.id} style={{ display: 'flex', gap: 10, wordBreak: 'break-all' }}>
                        <span style={{ color: '#475569', userSelect: 'none', minWidth: 70 }}>
                          [{log.timestamp}]
                        </span>
                        <span style={{ color: getLogLevelColor(log.level), fontWeight: 700, minWidth: 75 }}>
                          [{log.level.toUpperCase()}]
                        </span>
                        <span style={{ color: '#e2e8f0' }}>{log.message}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'guide' && (
              /* COMPLETE SETUP & USER GUIDE TAB */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  background: 'var(--bg-card, #f8fafc)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '20px 22px'
                }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>
                    📖 How StreamFusion Android Engine Works
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    StreamFusion provides a high-performance Android environment on Windows. It uses <strong>Sentinel Port Bridge</strong>
                    and <strong>Hardware-Accelerated Scrcpy</strong> for zero-lag streaming, high FPS, and seamless APK testing.
                  </p>
                </div>

                <div style={{
                  background: 'var(--bg-card, #f8fafc)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '18px 20px'
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>
                    ⚡ Universal Auto-Bridge to Any Running Emulator
                  </div>
                  <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5, marginBottom: 12 }}>
                    StreamFusion can automatically connect to any Android environment already running on your Windows machine:
                  </p>
                  <ul style={{ fontSize: 12, color: '#64748b', paddingLeft: 18, lineHeight: 1.6 }}>
                    <li><strong>Windows Subsystem for Android (WSA)</strong>: Port 58526</li>
                    <li><strong>LDPlayer / NoxPlayer</strong>: Port 62001 or 62025</li>
                    <li><strong>BlueStacks</strong>: Port 5555</li>
                    <li><strong>MuMu Player</strong>: Port 7555</li>
                    <li><strong>Android Studio AVD</strong>: Port 5554</li>
                  </ul>
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={handleAutoConnect}
                      style={{
                        padding: '8px 16px',
                        background: '#4f46e5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Auto-Detect &amp; Connect Now
                    </button>
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-card, #f8fafc)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '18px 20px'
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>
                    🔧 Installing QEMU Standalone Engine (Optional)
                  </div>
                  <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5, marginBottom: 8 }}>
                    To run the native standalone QEMU engine without third-party emulators:
                  </p>
                  <div style={{
                    padding: 10,
                    background: '#0f172a',
                    borderRadius: 8,
                    fontFamily: 'Consolas, monospace',
                    fontSize: 12,
                    color: '#38bdf8'
                  }}>
                    winget install SoftwareFreedomConservancy.QEMU
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'specs' && (
              /* ENGINE SPECS & CONTROLS TAB */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  background: 'var(--bg-card, #f8fafc)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '18px 20px'
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', marginBottom: 12 }}>
                    ⚡ StreamFusion Android Engine Performance Profile
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <div style={{ padding: 12, background: 'var(--bg-main, #ffffff)', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>RAM Footprint</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>
                        ~500 MB Base (70% Less than BlueStacks)
                      </div>
                    </div>

                    <div style={{ padding: 12, background: 'var(--bg-main, #ffffff)', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Rendering Speed</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
                        60 - 120 FPS Direct Streaming
                      </div>
                    </div>

                    <div style={{ padding: 12, background: 'var(--bg-main, #ffffff)', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Input Latency</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>
                        &lt; 35ms Zero-Lag Response
                      </div>
                    </div>

                    <div style={{ padding: 12, background: 'var(--bg-main, #ffffff)', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Architecture</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                        StreamFusion Virtual Subsystem + ADB
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const EmulatorStudioModal: React.FC<EmulatorStudioModalProps> = ({
  isOpen = false,
  onClose,
  onToast,
  onStartMirror
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="mac-glass-modal mac-dark-glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: 820,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 22,
          border: '1.5px solid rgba(99, 102, 241, 0.45)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.6)'
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 20,
                right: 24,
                zIndex: 10,
                background: 'rgba(255, 255, 255, 0.12)',
                border: 'none',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: 999,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16
              }}
            >
              ✕
            </button>
          )}
          <EmulatorStudioView
            onToast={onToast}
            onStartMirror={onStartMirror}
            isFullPageView={false}
          />
        </div>
      </div>
    </div>
  );
};
