import React, { useEffect, useState } from 'react';
import { KeyRound, Check, Copy, Sun, Moon, Monitor, Download, Globe } from 'lucide-react';
import { loadKey, saveKey } from '../Emulator/secrets';
import { ResourcesCard } from '../Emulator/ResourcesCard';
import { getShowWindow } from '../Emulator/PowerControl';
import { getTheme, setTheme, type Theme } from './theme';

const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 10, letterSpacing: '0.04em' };
const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 };
const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="glass-panel" style={{ padding: 22, marginBottom: 18 }}>
    <div style={label}>{title}</div>
    {children}
  </div>
);

const Code: React.FC<{ text: string; done: boolean; onCopy: () => void }> = ({ text, done, onCopy }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
    <pre style={{ flex: 1, margin: 0, padding: '8px 10px', background: '#0f172a', color: '#e2e8f0', borderRadius: 10, fontSize: 11.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text' }}>{text}</pre>
    <button className="btn-secondary" style={{ padding: '6px 9px' }} onClick={onCopy}>{done ? <Check size={14} /> : <Copy size={14} />}</button>
  </div>
);

export const ApiSection: React.FC = () => {
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [mcp, setMcp] = useState<{ claudeCode: string; json: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [live, setLive] = useState<{ connected: boolean; clients: string[] }>({ connected: false, clients: [] });
  useEffect(() => {
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/mcp/live/status')).json(); if (!stop) setLive({ connected: !!j.connected, clients: j.clients || [] }); } catch (e) {} if (!stop) setTimeout(tick, 3000); };
    tick();
    return () => { stop = true; };
  }, []);
  useEffect(() => { loadKey().then(setSaved); fetch('/api/mcp/config').then(r => r.json()).then(setMcp).catch(() => {}); }, []);
  const copy = (id: string, v: string) => { navigator.clipboard?.writeText(v); setCopied(id); setTimeout(() => setCopied(''), 1500); };
  return (<>
    <Card title="ANTHROPIC API KEY">
      <div style={{ ...muted, marginBottom: 10 }}>Used by the built-in AI agent (Android Emulator and Web Testing). {saved ? <b style={{ color: '#16a34a' }}>Key saved.</b> : <b style={{ color: '#b91c1c' }}>Not connected.</b>}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="password" placeholder={saved ? 'Paste a new key to replace the saved one' : 'sk-ant-...'} value={draft} onChange={e => setDraft(e.target.value)} style={{ flex: 1, width: 'auto', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 9, padding: '9px 12px', fontSize: 13, color: 'var(--text-main)', userSelect: 'text' }} />
        <button className="btn-primary" disabled={!draft.trim()} onClick={async () => { const k = draft.trim(); await saveKey(k); setSaved(k); setDraft(''); }}><KeyRound size={14} /> Save</button>
        {saved && <button className="btn-secondary" onClick={async () => { await saveKey(''); setSaved(''); }}>Remove</button>}
      </div>
      <div style={{ ...muted, marginTop: 8 }}>Stored encrypted on this PC and sent only to Anthropic. Get a key at console.anthropic.com.</div>
    </Card>
    {mcp && (
      <Card title="USE CLAUDE CODE / CLAUDE DESKTOP INSTEAD (NO KEY NEEDED HERE)">
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: live.connected ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)', color: live.connected ? '#15803d' : 'var(--text-muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: live.connected ? '#22c55e' : '#94a3b8' }} />
          {live.connected ? 'MCP connected: ' + live.clients.join(', ') : 'No MCP client connected yet'}
        </div>
        <div style={{ ...muted, marginBottom: 8 }}>Keep StreamFusion open, then run once in a terminal:</div>
        <Code text={mcp.claudeCode} done={copied === 'cc'} onCopy={() => copy('cc', mcp.claudeCode)} />
        <div style={{ ...muted, margin: '12px 0 8px' }}>Other MCP clients (Claude Desktop, Cursor) config:</div>
        <Code text={mcp.json} done={copied === 'js'} onCopy={() => copy('js', mcp.json)} />
      </Card>
    )}
  </>);
};

export const EmulatorSection: React.FC = () => {
  const [showWin, setShowWin] = useState(getShowWindow());
  return (<>
    <Card title="START BEHAVIOUR">
      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
        <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={showWin} onChange={e => { setShowWin(e.target.checked); try { localStorage.setItem('sf_emu_show_window', e.target.checked ? '1' : '0'); } catch (err) {} }} />
        Also show the separate emulator window when powering on
      </label>
      <div style={{ ...muted, marginTop: 6 }}>Off by default: the phone is shown inside StreamFusion.</div>
    </Card>
    <ResourcesCard />
  </>);
};

export const WebSection: React.FC = () => {
  const [web, setWeb] = useState<any>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/web/status')).json(); if (!stop) setWeb(j); } catch (e) {} if (!stop) setTimeout(tick, 2000); };
    tick();
    return () => { stop = true; };
  }, []);
  const post = (p: string, body?: any) => fetch('/api/web/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return (
    <Card title="BROWSER (WEB TESTING)">
      {!web ? <div style={muted}>Checking…</div> : web.isInstalling ? <div style={muted}>{web.stage || 'Installing…'}</div> : !web.installed ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => post('install')}><Download size={14} /> Install Google Chrome</button>
          <span style={muted}>Chrome or Edge was not found. This downloads the official installer (installs for you only, no admin).{web.error ? ' ' + web.error : ''}</span>
        </div>
      ) : (<>
        <div style={{ ...muted, marginBottom: 6 }}><Globe size={13} style={{ verticalAlign: -2 }} /> <b style={{ color: '#16a34a' }}>{web.browser} found.</b> Nothing to install.</div>
        <div style={muted}>Web Testing opens your own browser in its own window with a separate profile, so you can log in or pass bot checks yourself. The AI agent controls that same window. Your normal browser profile is not touched.</div>
      </>)}
    </Card>
  );
};

export const AppearanceSection: React.FC = () => {
  const [t, setT] = useState<Theme>(getTheme());
  const opts: { id: Theme; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <Sun size={16} /> }, { id: 'dark', label: 'Dark', icon: <Moon size={16} /> }, { id: 'system', label: 'System', icon: <Monitor size={16} /> }
  ];
  return (
    <Card title="THEME">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {opts.map(o => (
          <button key={o.id} onClick={() => { setT(o.id); setTheme(o.id); }} className="btn-secondary"
            style={{ padding: '14px 22px', flexDirection: 'column', gap: 6, minWidth: 110, ...(t === o.id ? { borderColor: '#6366f1', color: '#4338ca', boxShadow: '0 0 0 3px rgba(99,102,241,0.15)' } : {}) }}>
            {o.icon}{o.label}
          </button>
        ))}
      </div>
    </Card>
  );
};
