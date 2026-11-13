import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, Bot, Package, Terminal, SlidersHorizontal, Power, Upload, Play, Trash2, RefreshCw, MonitorPlay, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AgentPanel } from './AgentPanel';
import { ResourcesCard } from './ResourcesCard';
import { PowerPanel, startEmulator } from './PowerControl';
import { useEmulator, type EmulatorPhase } from './useEmulator';

interface EmulatorStudioModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onToast: (msg: string, icon?: string) => void;
  onStartMirror?: (serial: string) => void;
  isFullPageView?: boolean;
}

type Tab = 'emulator' | 'agent' | 'apps' | 'logs' | 'settings';

const border = '1px solid var(--border-subtle, #e2e8f0)';
const card: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 14, padding: '18px 20px' };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: 'var(--text-main, #0f172a)', margin: 0 };
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 };
const btn = (primary = false, danger = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: primary || danger ? 'none' : border, background: danger ? '#dc2626' : primary ? '#4f46e5' : 'var(--bg-card, #fff)', color: primary || danger ? '#fff' : 'var(--text-main, #0f172a)'
});

const PHASE_LABEL: Record<EmulatorPhase, { text: string; color: string }> = {
  not_installed: { text: 'Not installed', color: '#94a3b8' },
  installing: { text: 'Installing…', color: '#f59e0b' },
  stopped: { text: 'Powered off', color: '#94a3b8' },
  booting: { text: 'Starting…', color: '#f59e0b' },
  running: { text: 'Running', color: '#22c55e' }
};

export const EmulatorStudioView: React.FC<EmulatorStudioModalProps> = ({ onToast, onStartMirror, isFullPageView = true }) => {
  const emu = useEmulator((m) => onToast(m, '❌'));
  const { status, phase } = emu;
  const running = phase === 'running';
  const [tab, setTab] = useState<Tab>('emulator');
  const [visited, setVisited] = useState<{ agent?: boolean }>({});
  useEffect(() => { if (tab === 'agent') setVisited({ agent: true }); }, [tab]);

  // ---- APK install ----
  const [apkPath, setApkPath] = useState('');
  const [installingApk, setInstallingApk] = useState(false);
  const installApk = async (p?: string) => {
    const path = (p || apkPath).trim();
    if (!path) return onToast('Enter the path of an .apk file', '⚠️');
    if (!running) return onToast('Power on the emulator first', '⚠️');
    setInstallingApk(true);
    try {
      const j = await (await fetch('/api/emulator/install-apk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apkPath: path, serial: status.serial }) })).json();
      if (j.success) { onToast('App installed', '✅'); setApkPath(''); loadApps(); } else onToast(j.message || 'Install failed', '❌');
    } catch (e: any) { onToast('Install error: ' + e.message, '❌'); }
    finally { setInstallingApk(false); }
  };
  const browseApk = async () => {
    const api = (window as any).electronAPI;
    if (!api?.showOpenDialog) return onToast('Paste the full path to the .apk file', 'ℹ️');
    const r = await api.showOpenDialog({ title: 'Select Android app (.apk)', filters: [{ name: 'Android Package', extensions: ['apk'] }], properties: ['openFile'] });
    if (r && !r.canceled && r.filePaths?.[0]) { setApkPath(r.filePaths[0]); installApk(r.filePaths[0]); }
  };

  // ---- apps ----
  const [apps, setApps] = useState<{ package: string; name: string }[]>([]);
  const loadApps = useCallback(async () => {
    if (!running) return setApps([]);
    try { setApps((await (await fetch(`/api/emulator/apps?serial=${encodeURIComponent(status.serial)}`)).json()).apps || []); } catch (e) {}
  }, [running, status.serial]);
  useEffect(() => { if (tab === 'apps' || tab === 'emulator') loadApps(); }, [tab, loadApps]);
  const appAction = async (kind: 'launch-app' | 'uninstall-app', pkg: string) => {
    if (kind === 'uninstall-app' && !window.confirm(`Uninstall ${pkg}?`)) return;
    const j = await (await fetch('/api/emulator/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: pkg, serial: status.serial }) })).json();
    onToast(j.message || (j.success ? 'Done' : 'Failed'), j.success ? '✅' : '❌');
    if (kind === 'uninstall-app') loadApps();
  };

  // ---- logs ----
  const [logs, setLogs] = useState<{ id: string; timestamp: string; level: string; message: string }[]>([]);
  useEffect(() => {
    if (tab !== 'logs') return;
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/emulator/logs')).json(); if (!stop) setLogs(j.logs || []); } catch (e) {} if (!stop) setTimeout(tick, 2000); };
    tick();
    return () => { stop = true; };
  }, [tab]);

  // ---- hardware check (settings) ----
  const [hw, setHw] = useState<any>(null);
  useEffect(() => { if (tab === 'settings' && !hw) fetch('/api/emulator/hardware').then(r => r.json()).then(setHw).catch(() => {}); }, [tab, hw]);

  const label = PHASE_LABEL[phase];
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'emulator', label: 'Emulator', icon: <Smartphone size={15} /> },
    { id: 'agent', label: 'AI Agent', icon: <Bot size={15} /> },
    { id: 'apps', label: `Apps${running ? ` (${apps.length})` : ''}`, icon: <Package size={15} /> },
    { id: 'logs', label: 'Logs', icon: <Terminal size={15} /> },
    { id: 'settings', label: 'Settings', icon: <SlidersHorizontal size={15} /> }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, color: 'var(--text-main, #0f172a)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: isFullPageView ? '18px 24px' : '18px 64px 18px 24px', borderBottom: border }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Smartphone size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Android Emulator</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Android 14 virtual phone for app testing and AI automation</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border, background: 'var(--bg-card, #fff)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.color }} />{label.text}{running && <span style={{ fontWeight: 400, color: 'var(--text-muted, #64748b)' }}>· {status.serial}</span>}
        </span>
        {phase === 'stopped' && <button style={btn(true)} onClick={() => startEmulator(emu)} disabled={emu.busy}><Power size={14} /> Power on</button>}
        {running && <button style={btn(false, true)} onClick={() => emu.stop()} disabled={emu.busy}><Power size={14} /> Power off</button>}
        {phase === 'booting' && <button style={btn()} onClick={() => emu.stop()}>Cancel</button>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 20px', borderBottom: border }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '11px 14px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t.id ? '#4f46e5' : 'var(--text-muted, #64748b)', borderBottom: tab === t.id ? '3px solid #4f46e5' : '3px solid transparent'
          }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: tab === 'agent' ? 14 : 24, overflowY: tab === 'agent' ? 'hidden' : 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tab === 'emulator' && (<>
          <div style={{ ...card, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 300px', display: 'flex', justifyContent: 'center' }}>
              <PowerPanel emu={emu} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={h3}>Virtual phone</div>
              <div style={sub}>Google Android 14 (API 34) · x86_64 · Google APIs</div>
              {running ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <button style={btn(true)} onClick={() => setTab('agent')}><Bot size={14} /> Open AI Agent</button>
                  {onStartMirror && <button style={btn()} onClick={() => onStartMirror(status.serial)}><MonitorPlay size={14} /> Mirror in StreamFusion</button>}
                  <button style={btn()} onClick={() => { if (window.confirm('Erase all emulator data and restart?')) emu.reset(); }}><RotateCcw size={14} /> Factory reset</button>
                </div>
              ) : (
                <div style={{ ...sub, marginTop: 10 }}>{phase === 'stopped' ? 'Power on to use the AI agent, install apps and run tests.' : ''}</div>
              )}
              <button style={{ ...btn(), marginTop: 12 }} onClick={() => setTab('settings')}><SlidersHorizontal size={14} /> Resources (RAM, CPU)</button>
            </div>
          </div>

          <div style={card}>
            <div style={h3}>Install an app (.apk)</div>
            <div style={sub}>{running ? 'Pick an APK from your PC to install and test it.' : 'Power on the emulator to install apps.'}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input value={apkPath} onChange={e => setApkPath(e.target.value)} placeholder="C:\Downloads\app-debug.apk" disabled={!running}
                onKeyDown={e => { if (e.key === 'Enter') installApk(); }}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border, fontSize: 13, background: running ? 'var(--bg-card, #fff)' : 'var(--bg-input, #f1f5f9)' }} />
              <button style={btn()} onClick={browseApk} disabled={!running}><Upload size={14} /> Browse</button>
              <button style={btn(true)} onClick={() => installApk()} disabled={!running || installingApk || !apkPath.trim()}>{installingApk ? 'Installing…' : 'Install'}</button>
            </div>
          </div>
        </>)}

        {(visited.agent || tab === 'agent') && <AgentPanel emu={emu} world="phone" active={tab === 'agent'} />}

        {tab === 'apps' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ ...h3, flex: 1 }}>Installed apps</div>
              <button style={btn()} onClick={loadApps} disabled={!running}><RefreshCw size={13} /> Refresh</button>
            </div>
            {!running && <div style={{ ...sub, marginTop: 12 }}>Power on the emulator to see its apps.</div>}
            {running && apps.length === 0 && <div style={{ ...sub, marginTop: 12 }}>No user-installed apps yet. Install an APK from the Emulator tab.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {apps.map(a => (
                <div key={a.package} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border, borderRadius: 10 }}>
                  <Package size={18} color="#64748b" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', fontFamily: 'monospace' }}>{a.package}</div>
                  </div>
                  <button style={btn(true)} onClick={() => appAction('launch-app', a.package)}><Play size={13} /> Open</button>
                  <button style={btn()} onClick={() => appAction('uninstall-app', a.package)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div style={{ background: '#0f172a', borderRadius: 14, padding: 14, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12, color: '#e2e8f0', minHeight: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ flex: 1, color: '#94a3b8' }}>Emulator log</span>
              <button style={{ ...btn(), padding: '3px 10px', fontSize: 11 }} onClick={async () => { await fetch('/api/emulator/logs/clear', { method: 'POST' }); setLogs([]); }}>Clear</button>
            </div>
            {logs.length === 0 && <div style={{ color: '#64748b' }}>No log entries.</div>}
            {logs.map(l => (
              <div key={l.id} style={{ display: 'flex', gap: 10, padding: '1px 0', color: l.level === 'error' ? '#fca5a5' : l.level === 'warn' ? '#fcd34d' : l.level === 'success' ? '#86efac' : '#cbd5e1' }}>
                <span style={{ color: '#64748b', flexShrink: 0 }}>{l.timestamp}</span><span style={{ wordBreak: 'break-word' }}>{l.message}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'settings' && (<>
          <ResourcesCard />
          <div style={card}>
            <div style={h3}>Hardware acceleration</div>
            {!hw ? <div style={sub}>Checking…</div> : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, fontSize: 13 }}>
                {hw.accelOk ? <CheckCircle2 size={18} color="#16a34a" /> : <AlertTriangle size={18} color="#d97706" />}
                <div>
                  <div style={{ fontWeight: 700 }}>{hw.accelOk ? 'Hardware acceleration is available' : 'Hardware acceleration not confirmed'}</div>
                  <div style={sub}>{hw.cpus} CPU threads · {hw.ramGB} GB RAM on this PC. {hw.accelOk ? '' : 'Enable virtualization in BIOS and the Windows "Windows Hypervisor Platform" feature, otherwise the emulator will be very slow.'}</div>
                </div>
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  );
};

export const EmulatorStudioModal: React.FC<EmulatorStudioModalProps> = ({ isOpen = false, onClose, onToast, onStartMirror }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '92%', maxWidth: 1000, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', position: 'relative' }}>
        {onClose && <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, border: 'none', background: 'rgba(15,23,42,0.08)', width: 30, height: 30, borderRadius: 999, cursor: 'pointer' }}>✕</button>}
        <EmulatorStudioView onToast={onToast} onStartMirror={onStartMirror} isFullPageView={false} />
      </div>
    </div>
  );
};
