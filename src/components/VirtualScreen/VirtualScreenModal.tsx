import React, { useState, useEffect } from 'react';
import {
  Monitor, Play, Square, Settings, Smartphone, CheckCircle2,
  AlertCircle, Sparkles, RefreshCw, Zap, ArrowLeft, Home,
  Layers, Bell, Sliders, Volume2, Volume1, Maximize2, MousePointer
} from 'lucide-react';

interface VirtualScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  serial: string;
  deviceName: string;
  isMirroring: boolean;
  onToast: (msg: string, icon?: string) => void;
}

export const VirtualScreenModal: React.FC<VirtualScreenModalProps> = ({
  isOpen,
  onClose,
  serial,
  deviceName,
  isMirroring,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<'launch' | 'guide'>('launch');
  // Display Mode: 'phone' (Full-Screen Vertical Phone) or 'desktop' (16:9 Multi-Window)
  const [displayMode, setDisplayMode] = useState<'phone' | 'desktop'>('phone');
  // Default to Vertical Mobile Portrait (9:20 ratio) with balanced 300 DPI (crisp natural phone icons)
  const [virtualDisplaySize, setVirtualDisplaySize] = useState('1080x2400/300');
  const [maxSize, setMaxSize] = useState(700); // 700px height ensures 100% fits on any laptop without cut-off!
  const [flexDisplay, setFlexDisplay] = useState(false); // Locked by default to prevent ratio deformation
  const [isDetectingDisplay, setIsDetectingDisplay] = useState(false);
  const [selectedApp, setSelectedApp] = useState('com.android.settings');
  const [customApp, setCustomApp] = useState('');
  const [installedApps, setInstalledApps] = useState<{ package: string; label: string }[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [turnScreenOff, setTurnScreenOff] = useState(false);
  const [stayAwake, setStayAwake] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isConfiguringAdb, setIsConfiguringAdb] = useState(false);

  // Fetch installed apps when modal opens
  useEffect(() => {
    if (isOpen && serial) {
      setIsLoadingApps(true);
      fetch(`http://127.0.0.1:3001/api/devices/${encodeURIComponent(serial)}/apps`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.apps)) {
            setInstalledApps(data.apps);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingApps(false));
    }
  }, [isOpen, serial]);

  // Query connected device's exact native physical screen resolution
  const handleMatchNativeDisplay = async () => {
    if (!serial) {
      onToast('Connect a phone first!', '⚠️');
      return;
    }
    setIsDetectingDisplay(true);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/devices/${encodeURIComponent(serial)}/display`);
      const data = await res.json();
      if (data.success && data.virtualDisplaySize) {
        setVirtualDisplaySize(data.virtualDisplaySize);
        onToast(`Matched phone screen: ${data.width}x${data.height} (${data.density} DPI)`, '📱');
      } else {
        onToast('Using default 1080x2400/420', 'ℹ️');
      }
    } catch (e: any) {
      onToast('Failed to detect display: ' + e.message, '❌');
    } finally {
      setIsDetectingDisplay(false);
    }
  };

  if (!isOpen) return null;

  const quickPillApps = [
    { label: 'Settings', pkg: 'com.android.settings', icon: '⚙️' },
    { label: 'Chrome', pkg: 'com.android.chrome', icon: '🌐' },
    { label: 'YouTube', pkg: 'com.google.android.youtube', icon: '📺' },
    { label: 'WhatsApp', pkg: 'com.whatsapp', icon: '💬' },
    { label: 'ChatGPT', pkg: 'com.openai.chatgpt', icon: '🤖' }
  ];

  const handleLaunchVirtualScreen = async () => {
    if (!serial) {
      onToast('Please connect and select a phone first!', '⚠️');
      return;
    }

    const appToLaunch = customApp.trim() || selectedApp || 'com.android.settings';

    setIsLaunching(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/mirror/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial,
          mode: 'virtual-display',
          config: {
            isVirtualDisplay: true,
            virtualDisplaySize,
            maxSize,
            flexDisplay,
            displayMode,
            startApp: appToLaunch,
            turnScreenOff,
            stayAwake
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        onToast(`Vertical Screen launched with ${appToLaunch}!`, '📱');
        // Open attached floating navigation dock for mirroring window
        if ((window as any).electronAPI?.openMirrorToolbar) {
          (window as any).electronAPI.openMirrorToolbar({
            serial,
            title: `StreamFusion Virtual Display - ${deviceName || serial}`
          });
        }
        onClose();
      } else {
        onToast('Failed to start Virtual Screen: ' + data.message, '❌');
      }
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStopVirtualScreen = async () => {
    try {
      await fetch('http://127.0.0.1:3001/api/mirror/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial })
      });
      if ((window as any).electronAPI?.closeMirrorToolbar) {
        (window as any).electronAPI.closeMirrorToolbar();
      }
      onToast('Virtual Screen stopped', '⏹️');
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    }
  };

  const handleSendKey = async (keycode: number, label: string) => {
    if (!serial) return;
    try {
      await fetch('http://127.0.0.1:3001/api/control/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, keycode })
      });
      onToast(`${label}`, '⚡');
    } catch (e) {}
  };

  const handleStatusbar = async (requested: 'notifications' | 'settings') => {
    if (!serial) return;
    const w = window as any; // pressing the same button again closes the panel
    const action: 'notifications' | 'settings' | 'collapse' = w.__sfShade === requested ? 'collapse' : requested;
    w.__sfShade = action === 'collapse' ? '' : requested;
    try {
      await fetch('http://127.0.0.1:3001/api/control/statusbar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, action })
      });
      onToast(action === 'collapse' ? 'Panel closed' : action === 'settings' ? 'Quick Settings opened' : 'Notifications opened', '🔔');
    } catch (e) {}
  };

  const handleAutoConfigureAdb = async () => {
    if (!serial) return;
    setIsConfiguringAdb(true);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/devices/${encodeURIComponent(serial)}/desktop-mode`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        onToast('Phone Developer Options auto-configured for Virtual Screen!', '✅');
      } else {
        onToast('Auto-configure notice: ' + data.message, 'ℹ️');
      }
    } catch (e: any) {
      onToast('Failed to auto-configure: ' + e.message, '❌');
    } finally {
      setIsConfiguringAdb(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="mac-glass-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 22,
          border: '1.5px solid rgba(59, 130, 246, 0.5)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(59, 130, 246, 0.25)',
              border: '1px solid rgba(96, 165, 250, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa'
            }}>
              <Smartphone size={24} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                Vertical Screen Workspace
                <span style={{ fontSize: 10, background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                  v3.2.2
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Phone: <strong style={{ color: '#e2e8f0' }}>{deviceName || serial}</strong> · Mobile Screen Ratio (9:20)
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#ffffff',
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          padding: '6px 24px 0',
          background: 'var(--bg-card, #f8fafc)',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 12
        }}>
          <button
            onClick={() => setActiveTab('launch')}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: activeTab === 'launch' ? '#2563eb' : 'var(--text-muted, #64748b)',
              borderBottom: activeTab === 'launch' ? '3px solid #2563eb' : '3px solid transparent'
            }}
          >
            <Play size={14} /> 📱 Launch Vertical Screen &amp; Fit
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: activeTab === 'guide' ? '#2563eb' : 'var(--text-muted, #64748b)',
              borderBottom: activeTab === 'guide' ? '3px solid #2563eb' : '3px solid transparent'
            }}
          >
            <Settings size={14} /> 📱 Mobile Setup Guide (Zaroori Settings)
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 22, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'launch' ? (
            <>
              {/* Feature Intro */}
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 13,
                color: '#1e40af',
                display: 'flex',
                gap: 12,
                alignItems: 'center'
              }}>
                <Sparkles size={20} style={{ color: '#2563eb', flexShrink: 0 }} />
                <div>
                  <strong>Mobile-Matched Vertical Screen:</strong> Aapke phone ke exact ratio (9:20) me vertical window banegi jo laptop monitor par 100% bina cut hue fit hogi.
                </div>
              </div>

              {/* Mode Selector: Phone Full-Screen vs Desktop Freeform */}
              <div style={{
                display: 'flex',
                background: '#f1f5f9',
                padding: 4,
                borderRadius: 12,
                gap: 6
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('phone');
                    setVirtualDisplaySize('1080x2400/320');
                    setFlexDisplay(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 14px',
                    borderRadius: 9,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: displayMode === 'phone' ? '#2563eb' : 'transparent',
                    color: displayMode === 'phone' ? '#ffffff' : '#475569',
                    boxShadow: displayMode === 'phone' ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Smartphone size={16} /> 📱 Phone Mode (Full-Screen Vertical)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('desktop');
                    setVirtualDisplaySize('1920x1080/420');
                    setFlexDisplay(true);
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 14px',
                    borderRadius: 9,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: displayMode === 'desktop' ? '#2563eb' : 'transparent',
                    color: displayMode === 'desktop' ? '#ffffff' : '#475569',
                    boxShadow: displayMode === 'desktop' ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Monitor size={16} /> 🖥️ Desktop Mode (16:9 Multi-Window)
                </button>
              </div>

              {/* 1. Aspect Ratio & Resolution Presets */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                    1. Screen Shape &amp; Resolution Presets
                  </label>
                  {displayMode === 'phone' && (
                    <button
                      type="button"
                      onClick={handleMatchNativeDisplay}
                      disabled={isDetectingDisplay}
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        color: '#2563eb',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5
                      }}
                    >
                      <Zap size={12} />
                      {isDetectingDisplay ? 'Detecting...' : 'Auto-Match My Phone Screen'}
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: displayMode === 'phone' ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 10 }}>
                  {(displayMode === 'phone' ? [
                    {
                      label: '📱 Phone Portrait (9:20 Balanced)',
                      val: '1080x2400/320',
                      badge: 'RECOMMENDED',
                      desc: 'True modern phone shape with balanced UI (no oversized zoom)'
                    },
                    {
                      label: '📱 Compact Low-Load (9:20)',
                      val: '720x1600/260',
                      badge: 'FAST & LIGHT',
                      desc: 'Ultra-lightweight vertical phone screen, lowest CPU usage'
                    },
                    {
                      label: '📱 Flagship Ratio (19.5:9)',
                      val: '1080x2340/320',
                      badge: 'SAMSUNG / 1+',
                      desc: 'Modern flagship ratio for Samsung Galaxy & OnePlus'
                    }
                  ] : [
                    {
                      label: '🖥️ Desktop Full HD (16:9)',
                      val: '1920x1080/420',
                      badge: '1080P WIDE',
                      desc: 'High-res desktop workspace with freeform apps'
                    },
                    {
                      label: '🖥️ Desktop Standard HD',
                      val: '1280x720/320',
                      badge: '720P FAST',
                      desc: 'Fast desktop layout for high performance'
                    }
                  ]).map(res => (
                    <div
                      key={res.val}
                      onClick={() => setVirtualDisplaySize(res.val)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: virtualDisplaySize === res.val ? '2px solid #2563eb' : '1px solid var(--border-subtle)',
                        background: virtualDisplaySize === res.val ? '#eff6ff' : 'var(--bg-main, #ffffff)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: virtualDisplaySize === res.val ? '#1e40af' : 'var(--text-main)' }}>
                          {res.label}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.35 }}>{res.desc}</div>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        width: 'fit-content',
                        background: virtualDisplaySize === res.val ? '#2563eb' : '#f1f5f9',
                        color: virtualDisplaySize === res.val ? '#ffffff' : '#64748b'
                      }}>
                        {res.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Window Scale & Monitor Fit (Fix for Half Screen Cut-Off & Zoom) */}
              <div style={{ background: 'var(--bg-card, #f8fafc)', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                      2. Window Scale &amp; Monitor Fit (Zero Cut-Off)
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Laptop screen height ke mutabik window auto-scale hogi. Taskbar ke neeche cut hone ka issue 100% fixed!
                    </div>
                  </div>
                  <span className="badge badge-green" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                    Zero Cut-Off
                  </span>
                </div>

                {/* Quick Height Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Laptop Fit (720px)', val: 720, badge: 'DEFAULT', desc: '100% fits 768p & 1080p laptops' },
                    { label: 'Compact (640px)', val: 640, badge: 'SIDEBAR', desc: 'Small side-by-side window' },
                    { label: 'Full HD (800px)', val: 800, badge: '1080P', desc: 'For 1080p at 100% scale' },
                    { label: 'Large (950px)', val: 950, badge: '2K/4K', desc: 'For big external monitors' }
                  ].map(s => (
                    <button
                      key={s.val}
                      type="button"
                      onClick={() => setMaxSize(s.val)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: maxSize === s.val ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: maxSize === s.val ? '#dbeafe' : '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: maxSize === s.val ? '#1e40af' : '#0f172a' }}>
                          {s.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 2 }}>{s.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Live Height Slider */}
                <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--glass-bg)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#334155' }}>
                      Fine-Tune Window Height:
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                      {maxSize}px Height · Width: {Math.round(maxSize * (displayMode === 'phone' ? 1080/2400 : 16/9))}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="520"
                    max="1020"
                    step="20"
                    value={maxSize}
                    onChange={e => setMaxSize(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    <span>520px (Tiny)</span>
                    <span>720px (Laptop Standard Fit)</span>
                    <span>1020px (2K Large)</span>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#16a34a', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={!flexDisplay}
                      onChange={e => setFlexDisplay(!e.target.checked)}
                    />
                    <span>🔒 Lock Exact Phone Aspect Ratio (No Stretching, Zero Black Bars)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#64748b' }}>
                    <input
                      type="checkbox"
                      checked={flexDisplay}
                      onChange={e => setFlexDisplay(e.target.checked)}
                    />
                    <span>Enable Freeform Flex-Display (-x)</span>
                  </label>
                </div>
              </div>

              {/* 3. Choose App to Launch */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: 8 }}>
                  3. Choose App to Launch on Vertical Screen
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {quickPillApps.map(app => (
                    <button
                      key={app.pkg}
                      type="button"
                      onClick={() => { setSelectedApp(app.pkg); setCustomApp(''); }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        border: selectedApp === app.pkg && !customApp ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                        background: selectedApp === app.pkg && !customApp ? '#dbeafe' : 'var(--bg-main, #ffffff)',
                        color: selectedApp === app.pkg && !customApp ? '#1e40af' : 'var(--text-main, #334155)'
                      }}
                    >
                      <span>{app.icon}</span> {app.label}
                    </button>
                  ))}
                </div>

                {/* Dropdown of installed apps */}
                {installedApps.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <select
                      value={selectedApp}
                      onChange={e => { setSelectedApp(e.target.value); setCustomApp(''); }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        background: 'var(--bg-main, #ffffff)',
                        color: 'var(--text-main)'
                      }}
                    >
                      <option value="com.android.settings">⚙️ Settings (com.android.settings)</option>
                      {installedApps.map(app => (
                        <option key={app.package} value={app.package}>
                          📱 {app.label} ({app.package})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Custom Package Input */}
                <input
                  type="text"
                  placeholder="Or type package name (e.g. com.whatsapp, com.android.chrome)"
                  value={customApp}
                  onChange={e => setCustomApp(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13
                  }}
                />
              </div>

              {/* 4. Toggles */}
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', background: 'var(--bg-card, #f8fafc)', padding: '10px 16px', borderRadius: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={stayAwake}
                    onChange={e => setStayAwake(e.target.checked)}
                  />
                  <span>Keep Screen Awake</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={turnScreenOff}
                    onChange={e => setTurnScreenOff(e.target.checked)}
                  />
                  <span>Turn Off Phone Physical Screen (Saves Battery)</span>
                </label>
              </div>

              {/* 5. Launch / Stop Actions */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleLaunchVirtualScreen}
                  disabled={isLaunching}
                  className="btn-primary"
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    fontSize: 14,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: 10
                  }}
                >
                  <Play size={16} />
                  {isLaunching ? 'Launching Vertical Screen...' : '📱 Launch Vertical Screen Now'}
                </button>

                {isMirroring && (
                  <button
                    onClick={handleStopVirtualScreen}
                    className="btn-danger"
                    style={{
                      padding: '12px 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 10
                    }}
                  >
                    <Square size={16} /> Stop Session
                  </button>
                )}
              </div>

              {/* 6. On-Screen Navigation & Remote Controls */}
              <div style={{
                background: 'var(--glass-soft)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '14px 16px'
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sliders size={14} color="#2563eb" /> ON-SCREEN REMOTE NAVIGATION CONTROLS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleSendKey(4, 'Back ◀')}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendKey(3, 'Home ⚪')}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Home size={13} /> Home
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendKey(187, 'Recent Apps ⏹')}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Layers size={13} /> Recents
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusbar('notifications')}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Bell size={13} /> Notifications
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusbar('settings')}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Settings size={13} /> Quick Tiles
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendKey(24, 'Volume Up 🔊')}
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: 12 }}
                    title="Volume Up"
                  >
                    <Volume2 size={13} /> +
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendKey(25, 'Volume Down 🔉')}
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: 12 }}
                    title="Volume Down"
                  >
                    <Volume1 size={13} /> -
                  </button>
                </div>
              </div>

              {/* 7. Mouse & Keyboard Navigation Cheatsheet */}
              <div style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MousePointer size={13} color="#2563eb" />
                  <strong>Mouse:</strong> Right-Click = Back | Middle-Click = Home
                </div>
                <div>
                  <strong>Keyboard:</strong> Alt+B = Back | Alt+H = Home | Alt+S = Recents | Alt+F = Fullscreen
                </div>
              </div>
            </>
          ) : (
            /* Tab 2: Mobile Setup Guide */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Quick ADB Auto-Config Card */}
              <div style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
                border: '1.5px solid #86efac',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={16} style={{ color: '#16a34a' }} /> 1-Click Phone Auto-Config (Recommended)
                  </div>
                  <div style={{ fontSize: 12, color: '#1e293b', marginTop: 2 }}>
                    ADB ke zariye phone ke Developer Options me Freeform &amp; Desktop Mode settings automatic ON karein.
                  </div>
                </div>
                <button
                  onClick={handleAutoConfigureAdb}
                  disabled={isConfiguringAdb}
                  className="btn-primary"
                  style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, borderRadius: 8, background: '#16a34a', borderColor: '#16a34a' }}
                >
                  {isConfiguringAdb ? 'Configuring...' : '⚡ Auto-Configure Phone'}
                </button>
              </div>

              {/* Step 1 */}
              <div className="glass-panel" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    1
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                    Developer Options Enable Karein (Agar pehle se nahi hai)
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 34, lineHeight: 1.5 }}>
                  Phone ki <strong>Settings</strong> ➔ <strong>About Phone</strong> me jayein. <strong>"Build Number"</strong> par <strong>7 baar lagataar tap</strong> karein. Screen par <em>"You are now a developer!"</em> aayega.
                </div>
              </div>

              {/* Step 2 */}
              <div className="glass-panel" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    2
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                    Developer Options Kholein
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 34, lineHeight: 1.5 }}>
                  Phone Settings ➔ <strong>System</strong> (ya <strong>Additional Settings</strong>) ➔ <strong>Developer Options</strong> ko open karein.
                </div>
              </div>

              {/* Step 3 */}
              <div className="glass-panel" style={{ padding: 14, border: '1.5px solid #3b82f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    3
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#1e40af' }}>
                    Yeh 2 Settings ON Karein (Sabse Zaroori)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 34 }}>
                  <div style={{ background: 'var(--glass-soft)', padding: 8, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                      ✅ "Force activities to be resizable"
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Is setting ko <strong>ON</strong> karein taaki phone ki koi bhi app virtual second screen par open ho sake.
                    </div>
                  </div>

                  <div style={{ background: 'var(--glass-soft)', padding: 8, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                      ✅ "Enable freeform windows" ya "Force desktop mode"
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Is setting ko <strong>ON</strong> karein taaki PC display par Android independent desktop window bana sake.
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4: Brand Specific */}
              <div className="glass-panel" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#64748b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    4
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                    Phone Brand Ke Mutabik Special Tips
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 34, fontSize: 11, color: 'var(--text-muted)' }}>
                  <div>📱 <strong>Vivo / iQOO (Funtouch OS / OriginOS)</strong>: Developer Options me <em>"Multi-window for all apps"</em> allow karein.</div>
                  <div>📱 <strong>Xiaomi / Redmi / POCO (MIUI / HyperOS)</strong>: Developer Options me <em>"USB Debugging (Security settings)"</em> ON karein.</div>
                  <div>📱 <strong>Samsung (One UI)</strong>: Advanced Features ➔ Multi-window ➔ <em>"Multi window for all apps"</em> ON karein.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
