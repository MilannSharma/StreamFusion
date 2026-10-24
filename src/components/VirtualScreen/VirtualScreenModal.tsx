import React, { useState, useEffect } from 'react';
import { Monitor, Play, Square, Settings, Smartphone, CheckCircle2, AlertCircle, Sparkles, ExternalLink, RefreshCw, Zap } from 'lucide-react';

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
  const [virtualDisplaySize, setVirtualDisplaySize] = useState('1920x1080/420');
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
            startApp: appToLaunch,
            turnScreenOff,
            stayAwake
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        onToast(`Virtual Screen spawned with ${appToLaunch}!`, '🖥️');
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
      onToast('Virtual Screen stopped', '⏹️');
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    }
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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="glass-panel"
        onClick={e => e.stopPropagation()}
        style={{
          width: '94%',
          maxWidth: 680,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          border: '1.5px solid #3b82f6',
          borderRadius: 16
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
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
              <Monitor size={24} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                Virtual Screen Workspace
                <span style={{ fontSize: 10, background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                  v3.1.1
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Device: <strong style={{ color: '#e2e8f0' }}>{deviceName || serial}</strong> · Independent PC Display
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
          padding: '8px 24px 0',
          background: 'var(--bg-card, #f8fafc)',
          borderBottom: '1px solid #e2e8f0',
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
            <Play size={14} /> Launch Virtual Screen
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
            <Smartphone size={14} /> 📱 Mobile Setup Guide (Zaroori Settings)
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {activeTab === 'launch' ? (
            <>
              {/* Feature Intro */}
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                padding: '14px 18px',
                fontSize: 13,
                color: '#1e40af',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}>
                <Sparkles size={20} style={{ color: '#2563eb', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>What is Virtual Screen? (Second Android Display)</div>
                  Phone ki physical screen par koi disturbance nahi hota! PC par ek alag independent 1080p display open ho jata hai jisme mouse aur keyboard se koi bhi Android app smoothly chala sakte hain.
                </div>
              </div>

              {/* 1. App Selector */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: 8 }}>
                  1. Choose App to Launch on Virtual Screen
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
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
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Or select from installed phone apps:</div>
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
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Or type any custom package name:</div>
                  <input
                    type="text"
                    placeholder="e.g. com.android.chrome or com.whatsapp"
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
              </div>

              {/* 2. Display Resolution Preset */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: 8 }}>
                  2. Virtual Screen Resolution &amp; DPI
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: '1080p Desktop', val: '1920x1080/420', desc: 'Crisp & Wide (Recommended)' },
                    { label: '720p Laptop', val: '1280x720/280', desc: 'Compact & Low CPU' },
                    { label: '2K Ultrawide', val: '2560x1440/560', desc: 'Ultra High Definition' }
                  ].map(res => (
                    <div
                      key={res.val}
                      onClick={() => setVirtualDisplaySize(res.val)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: virtualDisplaySize === res.val ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: virtualDisplaySize === res.val ? '#eff6ff' : 'var(--bg-main, #ffffff)',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: virtualDisplaySize === res.val ? '#1e40af' : 'var(--text-main)' }}>
                        {res.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{res.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Toggles */}
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', background: 'var(--bg-card, #f8fafc)', padding: '12px 16px', borderRadius: 10 }}>
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

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
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
                  {isLaunching ? 'Launching Virtual Screen...' : '🖥️ Launch Virtual Screen Now'}
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
            </>
          ) : (
            /* Tab 2: Mobile Setup Guide */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <div className="glass-panel" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    1
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>
                    Developer Options Enable Karein (Agar pehle se nahi hai)
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 36, lineHeight: 1.5 }}>
                  Phone ki <strong>Settings</strong> ➔ <strong>About Phone</strong> me jayein. <strong>"Build Number"</strong> par <strong>7 baar lagataar tap</strong> karein. Screen par <em>"You are now a developer!"</em> ka message aayega.
                </div>
              </div>

              {/* Step 2 */}
              <div className="glass-panel" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    2
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>
                    Developer Options Kholein
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 36, lineHeight: 1.5 }}>
                  Phone Settings ➔ <strong>System</strong> (ya <strong>Additional Settings</strong>) ➔ <strong>Developer Options</strong> ko open karein.
                </div>
              </div>

              {/* Step 3 */}
              <div className="glass-panel" style={{ padding: 16, border: '1.5px solid #3b82f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    3
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>
                    Yeh 2 Settings ON Karein (Sabse Zaroori)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 36 }}>
                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      ✅ "Force activities to be resizable"
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Is setting ko <strong>ON</strong> karein taaki phone ki koi bhi app virtual second screen par open ho sake.
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      ✅ "Enable freeform windows" ya "Force desktop mode"
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Is setting ko <strong>ON</strong> karein taaki PC display par Android independent desktop window bana sake.
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4: Brand Specific */}
              <div className="glass-panel" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#64748b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    4
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>
                    Phone Brand Ke Mutabik Special Tips
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 36, fontSize: 12, color: 'var(--text-muted)' }}>
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
