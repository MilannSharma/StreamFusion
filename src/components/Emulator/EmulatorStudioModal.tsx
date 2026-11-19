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
  const [device, setDevice] = useState(''); // '' = built-in emulator, otherwise the serial of a real phone
  // The phone list shows the last known phones at once (cached), then confirms with the live scan. An empty list only means
  // "no phone" after a scan really answered; before that it says "checking", so a slow adb never looks like a missing phone.
  const [phones, setPhones] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem('sf_phones_cache') || '[]'); } catch (e) { return []; } });
  const [phonesLive, setPhonesLive] = useState(false);
  const [phoneScan, setPhoneScan] = useState(0);
  useEffect(() => {
    let stop = false, timer: any = 0, got = false;
    const tick = async () => {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 9000); // a hung request must never stop the polling
      try {
        const j = await (await fetch('/api/devices', { signal: ac.signal })).json();
        if (!stop && j.success !== false) {
          const list = (j.devices || []).filter((d: any) => !['emulator-', 'localhost:', '127.0.0.1:'].some(p => String(d.serial).startsWith(p)));
          setPhones(list); got = !j.stale || list.length > 0; setPhonesLive(got);
          try { localStorage.setItem('sf_phones_cache', JSON.stringify(list)); } catch (e) {}
        }
      } catch (e) {}
      clearTimeout(to);
      if (!stop) timer = setTimeout(tick, got ? 4000 : 1500);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [phoneScan]);
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
          <div style={{ fontSize: 17, fontWeight: 800 }}>Android Testing</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Test on the built-in emulator or your own phone, with AI</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border, background: 'var(--bg-card, #fff)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.color }} />{device ? 'Testing on your phone' : label.text}{(device || running) && <span style={{ fontWeight: 400, color: 'var(--text-muted, #64748b)' }}>· {device || status.serial}</span>}
        </span>
        {phase === 'stopped' && !device && <button style={btn(true)} onClick={() => startEmulator(emu)} disabled={emu.busy}><Power size={14} /> Power on</button>}
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
      <div style={{ padding: tab === 'agent' ? 8 : 24, overflowY: tab === 'agent' ? 'hidden' : 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tab === 'emulator' && (
          <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><div style={{ fontSize: 16, fontWeight: 800 }}>Where do you want to test?</div><div style={sub}>Pick one. The AI chat opens right after, working on that phone.</div></div>

            <div style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Smartphone size={20} /></div>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={h3}>Built-in emulator</div>
                <div style={sub}>Android 14 virtual phone · {label.text}{running ? ' · ' + status.serial : ''}</div>
              </div>
              {phase === 'installing'
                ? <button style={btn(true)} disabled>Installing… {Math.round(status.installProgress || 0)}%</button>
                : <button style={btn(true)} onClick={() => { setDevice(''); if (phase === 'stopped' || phase === 'not_installed') startEmulator(emu); setTab('agent'); }} disabled={emu.busy}>{running ? <><Bot size={14} /> Test here</> : phase === 'booting' ? <><Bot size={14} /> Open chat</> : <><Power size={14} /> Power on &amp; test</>}</button>}
              {running && <>
                {onStartMirror && <button style={btn()} onClick={() => onStartMirror(status.serial)}><MonitorPlay size={14} /> Mirror</button>}
                <button style={btn()} title="Power off" onClick={() => emu.stop()} disabled={emu.busy}><Power size={14} /></button>
              </>}
            </div>

            {phones.map(d => (
              <div key={d.serial} style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderColor: device === d.serial ? '#4f46e5' : undefined }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Smartphone size={20} /></div>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={h3}>{d.displayName || d.model || d.serial}</div>
                  <div style={sub}>Your phone · {d.isWifi ? 'Wi-Fi' : 'USB'}{d.androidVersion ? ' · ' + d.androidVersion : ''}{d.battery != null ? ' · battery ' + d.battery + '%' : ''}{d.state !== 'device' ? ' · ' + d.state : ''}</div>
                </div>
                <button style={btn(true)} disabled={d.state !== 'device'} onClick={() => { setDevice(d.serial); setTab('agent'); }}><Bot size={14} /> Test on this phone</button>
                {onStartMirror && <button style={btn()} onClick={() => onStartMirror(d.serial)}><MonitorPlay size={14} /> Mirror</button>}
              </div>
            ))}
            {phones.length === 0 && !phonesLive && (
              <div style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, border: '2.5px solid rgba(148,163,184,0.35)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'sfspin2 0.9s linear infinite' }} />
                <style>{'@keyframes sfspin2{to{transform:rotate(360deg)}}'}</style>
                <div style={{ ...h3, fontSize: 13 }}>Checking for your phone…</div>
              </div>
            )}
            {phones.length === 0 && phonesLive && (
              <div style={{ ...card, padding: '14px 16px', borderStyle: 'dashed' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', animation: 'sfpulse 1.4s ease-in-out infinite' }} />
                  <style>{'@keyframes sfpulse{50%{opacity:.25}}'}</style>
                  <div style={{ ...h3, fontSize: 13 }}>No phone found yet. Looking for one…</div>
                </div>
                <ol style={{ ...sub, margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Plug your phone in with a USB cable.</li>
                  <li>On the phone: Settings, About phone, tap <b>Build number</b> 7 times.</li>
                  <li>Settings, Developer options, turn on <b>USB debugging</b>.</li>
                  <li>Tap <b>Allow</b> on the phone when it asks. It appears here by itself.</li>
                </ol>
                <button style={{ ...btn(), marginTop: 10 }} onClick={() => { setPhonesLive(false); setPhoneScan(x => x + 1); }}><RefreshCw size={13} /> Check again</button>
              </div>
            )}
            {phones.length > 0 && <div style={{ ...sub, textAlign: 'center' }}>{phones.filter(d => d.state === 'device').length} phone{phones.length > 1 ? 's' : ''} found. Pick one above.</div>}

            {running && !device && (
              <div style={{ ...card, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ ...h3, fontSize: 13 }}>Install an app (.apk)</div>
                  <input value={apkPath} onChange={e => setApkPath(e.target.value)} placeholder="Path to app-debug.apk" onKeyDown={e => { if (e.key === 'Enter') installApk(); }}
                    style={{ flex: 1, minWidth: 160, padding: '7px 11px', borderRadius: 10, border, fontSize: 12.5, background: 'var(--bg-card, #fff)' }} />
                  <button style={btn()} onClick={browseApk}><Upload size={14} /> Browse</button>
                  <button style={btn(true)} onClick={() => installApk()} disabled={installingApk || !apkPath.trim()}>{installingApk ? 'Installing…' : 'Install'}</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button style={btn()} onClick={() => setTab('settings')}><SlidersHorizontal size={14} /> Resources (RAM, CPU)</button>
              {running && <button style={btn()} onClick={() => { if (window.confirm('Erase all emulator data and restart?')) emu.reset(); }}><RotateCcw size={14} /> Factory reset</button>}
            </div>
          </div>
        )}

        {(visited.agent || tab === 'agent') && <AgentPanel key={device || 'emulator'} emu={emu} world="phone" active={tab === 'agent'} deviceSerial={device || undefined} />}

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
