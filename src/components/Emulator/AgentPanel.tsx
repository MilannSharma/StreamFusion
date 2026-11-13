import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Square, Trash2, KeyRound, Plug, Copy, Check, ShieldAlert } from 'lucide-react';

interface AgentPanelProps {
  serial: string;
  connected: boolean;
}

type Msg =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; text: string }
  | { kind: 'tool'; id: string; name: string; input: any; state: 'running' | 'ok' | 'error'; summary?: string }
  | { kind: 'approval'; id: string; name: string; input: any; answered?: 'allowed' | 'denied' }
  | { kind: 'info'; text: string }
  | { kind: 'error'; text: string };

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5 (best)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (cheaper)' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (cheapest)' }
];

// API key lives in Electron safeStorage (encrypted by the OS); falls back to localStorage in a plain browser.
const secrets = (window as any).electronAPI?.secrets;
const KEY_NAME = 'anthropic_api_key';
const loadKey = async (): Promise<string> => {
  try { if (secrets) return (await secrets.get(KEY_NAME)) || ''; } catch (e) {}
  try { return localStorage.getItem(KEY_NAME) || ''; } catch (e) { return ''; }
};
const saveKey = async (v: string) => {
  try { if (secrets) return await secrets.set(KEY_NAME, v); } catch (e) {}
  try { localStorage.setItem(KEY_NAME, v); } catch (e) {}
};

const border = '1px solid var(--border-color, #e2e8f0)';
const card: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 12 };

export const AgentPanel: React.FC<AgentPanelProps> = ({ serial, connected }) => {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [model, setModel] = useState(() => { try { return localStorage.getItem('sf_agent_model') || MODELS[0].id; } catch (e) { return MODELS[0].id; } });
  const [mode, setMode] = useState<'ask' | 'auto'>('ask');
  const [tokens, setTokens] = useState({ input: 0, output: 0, cached: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [mcp, setMcp] = useState<{ claudeCode: string; json: string } | null>(null);
  const [copied, setCopied] = useState('');
  const sessionId = useRef('sf-' + Math.random().toString(36).slice(2, 10));
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadKey().then((k) => { setApiKey(k); if (!k) setShowSettings(true); }); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { try { localStorage.setItem('sf_agent_model', model); } catch (e) {} }, [model]);

  // ---------- live phone screen (polls a downscaled screenshot; click = tap) ----------
  const [shot, setShot] = useState('');
  const [dev, setDev] = useState({ w: 1080, h: 2400 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!connected) return;
    fetch('/api/device/tool/device_info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial }) })
      .then(r => r.json()).then(j => { if (j.ok && j.screen) setDev({ w: j.screen.w, h: j.screen.h }); }).catch(() => {});
  }, [connected, serial]);

  useEffect(() => {
    if (!connected) { setShot(''); return; }
    let stop = false; let last = '';
    (async () => {
      while (!stop) {
        try {
          const r = await fetch(`/api/device/screenshot.png?serial=${encodeURIComponent(serial)}&maxDim=900&t=${Date.now()}`);
          if (r.ok) { const u = URL.createObjectURL(await r.blob()); setShot(u); if (last) URL.revokeObjectURL(last); last = u; }
        } catch (e) {}
        await new Promise(r => setTimeout(r, busy ? 700 : 1500));
      }
      if (last) URL.revokeObjectURL(last);
    })();
    return () => { stop = true; };
  }, [connected, serial, busy]);

  const callTool = (name: string, args: any) => fetch(`/api/device/tool/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial, ...args }) });
  const onScreenClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    callTool('tap', { x: Math.round((e.clientX - r.left) / r.width * dev.w), y: Math.round((e.clientY - r.top) / r.height * dev.h) });
  };
  const phoneBtn = (key: string) => callTool('key', { key });

  // ---------- chat ----------
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!apiKey) { setShowSettings(true); return; }
    setInput(''); setBusy(true);
    setMsgs(m => [...m, { kind: 'user', text }]);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ sessionId: sessionId.current, message: text, apiKey, model, serial, mode })
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) handleEvent(JSON.parse(line)); }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setMsgs(m => [...m, { kind: 'error', text: e.message || String(e) }]);
    } finally { setBusy(false); abortRef.current = null; }
  }, [input, busy, apiKey, model, serial, mode]);

  const handleEvent = (ev: any) => {
    if (ev.type === 'text') setMsgs(m => [...m, { kind: 'agent', text: ev.text }]);
    else if (ev.type === 'tool_call') setMsgs(m => [...m, { kind: 'tool', id: ev.id, name: ev.name, input: ev.input, state: 'running' }]);
    else if (ev.type === 'tool_result') setMsgs(m => m.map(x => x.kind === 'tool' && x.id === ev.id ? { ...x, state: ev.ok ? 'ok' : 'error', summary: ev.summary } : x));
    else if (ev.type === 'approval') setMsgs(m => [...m, { kind: 'approval', id: ev.id, name: ev.name, input: ev.input }]);
    else if (ev.type === 'usage') setTokens(t => ({ input: t.input + (ev.input || 0), output: t.output + (ev.output || 0), cached: t.cached + (ev.cacheRead || 0) }));
    else if (ev.type === 'error') setMsgs(m => [...m, { kind: 'error', text: ev.message }]);
    else if (ev.type === 'done' && ev.reason !== 'complete') {
      const why: Record<string, string> = { stopped: 'Stopped.', refusal: 'The model declined this request.', max_tokens: 'Response was cut off (token limit).', step_limit: 'Stopped after 40 steps.' };
      setMsgs(m => [...m, { kind: 'info', text: why[ev.reason] || ev.reason }]);
    }
  };

  const answer = (id: string, allow: boolean) => {
    fetch('/api/agent/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, allow }) });
    setMsgs(m => m.map(x => x.kind === 'approval' && x.id === id ? { ...x, answered: allow ? 'allowed' : 'denied' } : x));
  };
  const stop = () => abortRef.current?.abort();
  const reset = () => {
    stop();
    fetch('/api/agent/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId.current }) });
    sessionId.current = 'sf-' + Math.random().toString(36).slice(2, 10);
    setMsgs([]); setTokens({ input: 0, output: 0, cached: 0 });
  };
  const openMcp = async () => {
    if (!mcp) { try { setMcp(await (await fetch('/api/mcp/config')).json()); } catch (e) {} }
    setShowSettings(true);
  };
  const copy = (id: string, v: string) => { navigator.clipboard?.writeText(v); setCopied(id); setTimeout(() => setCopied(''), 1500); };

  const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 290px)', minHeight: 520 }}>
      {/* ---------- left: chat ---------- */}
      <div style={{ ...card, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: border, flexWrap: 'wrap' }}>
          <select value={model} onChange={e => setModel(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border }}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={mode} onChange={e => setMode(e.target.value as any)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border }} title="Dangerous actions: shell, uninstall, clear data, install APK">
            <option value="ask">Ask before risky actions</option>
            <option value="auto">Auto (no prompts)</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginLeft: 'auto' }}>
            {fmt(tokens.input)} in · {fmt(tokens.output)} out{tokens.cached ? ` · ${fmt(tokens.cached)} cached` : ''}
          </span>
          <button onClick={openMcp} title="Connect Claude Code / other AI via MCP" style={iconBtn}><Plug size={14} /></button>
          <button onClick={() => setShowSettings(s => !s)} title="API key" style={iconBtn}><KeyRound size={14} /></button>
          <button onClick={reset} title="New chat" style={iconBtn}><Trash2 size={14} /></button>
        </div>

        {showSettings && (
          <div style={{ padding: 14, borderBottom: border, background: 'rgba(79,70,229,0.04)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Anthropic API key {apiKey && <span style={{ color: '#16a34a' }}>· saved</span>}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="password" placeholder="sk-ant-..." value={keyDraft} onChange={e => setKeyDraft(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border, fontSize: 12 }} />
                <button disabled={!keyDraft.trim()} onClick={async () => { const k = keyDraft.trim(); await saveKey(k); setApiKey(k); setKeyDraft(''); setShowSettings(false); }} style={primaryBtn}>Save</button>
              </div>
              <div style={{ color: 'var(--text-muted, #64748b)', marginTop: 4 }}>Stored encrypted on this PC and sent only to Anthropic. Get one at console.anthropic.com.</div>
            </div>
            {mcp && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Use Claude Code / Claude Desktop instead (no key needed here)</div>
                <div style={{ color: 'var(--text-muted, #64748b)', marginBottom: 4 }}>Keep StreamFusion open, then run once in a terminal:</div>
                <CodeLine text={mcp.claudeCode} onCopy={() => copy('cc', mcp.claudeCode)} done={copied === 'cc'} />
                <div style={{ color: 'var(--text-muted, #64748b)', margin: '6px 0 4px' }}>Other MCP clients (Claude Desktop, Cursor) config:</div>
                <CodeLine text={mcp.json} onCopy={() => copy('js', mcp.json)} done={copied === 'js'} multiline />
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13, maxWidth: 340, lineHeight: 1.6 }}>
              {connected ? 'Tell the agent what to test. For example:' : 'Start the emulator first (Emulator & APK Testing tab).'}
              {connected && <div style={{ marginTop: 8, fontStyle: 'italic' }}>"Open Settings, search for Wi-Fi and tell me what you see"</div>}
            </div>
          )}
          {msgs.map((m, i) => <Bubble key={i} m={m} onAnswer={answer} />)}
          {busy && <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Agent is working…</div>}
          <div ref={endRef} />
        </div>

        <div style={{ padding: 10, borderTop: border, display: 'flex', gap: 8 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={!connected}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={connected ? 'Instruction for the agent… (Enter to send, Shift+Enter for new line)' : 'Emulator is not connected'}
            style={{ flex: 1, resize: 'none', padding: '8px 10px', borderRadius: 10, border, fontSize: 13, fontFamily: 'inherit' }} />
          {busy
            ? <button onClick={stop} style={{ ...primaryBtn, background: '#dc2626' }}><Square size={14} /> Stop</button>
            : <button onClick={send} disabled={!input.trim() || !connected} style={primaryBtn}><Send size={14} /> Send</button>}
        </div>
      </div>

      {/* ---------- right: phone ---------- */}
      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ background: '#0f172a', borderRadius: 34, padding: 10, boxShadow: '0 10px 30px rgba(15,23,42,0.35)', width: '100%', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {shot
            ? <img ref={imgRef} src={shot} onClick={onScreenClick} alt="Device screen" draggable={false}
                style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 24, cursor: 'pointer', display: 'block' }} />
            : <div style={{ color: '#64748b', fontSize: 12, padding: 20, textAlign: 'center' }}>{connected ? 'Loading screen…' : 'Emulator offline'}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['Back', 'back'], ['Home', 'home'], ['Recents', 'recent']].map(([l, k]) => (
            <button key={k} onClick={() => phoneBtn(k)} disabled={!connected} style={{ ...iconBtn, padding: '5px 12px', fontSize: 11 }}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted, #64748b)' }}>Click the screen to tap</div>
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-main, #0f172a)' };
const primaryBtn: React.CSSProperties = { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

const CodeLine: React.FC<{ text: string; onCopy: () => void; done: boolean; multiline?: boolean }> = ({ text, onCopy, done, multiline }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
    <pre style={{ flex: 1, margin: 0, padding: '6px 8px', background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: 11, overflowX: 'auto', whiteSpace: multiline ? 'pre' : 'pre-wrap', wordBreak: 'break-all' }}>{text}</pre>
    <button onClick={onCopy} style={iconBtn}>{done ? <Check size={13} /> : <Copy size={13} />}</button>
  </div>
);

const Bubble: React.FC<{ m: Msg; onAnswer: (id: string, allow: boolean) => void }> = ({ m, onAnswer }) => {
  if (m.kind === 'user') return <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#4f46e5', color: '#fff', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.text}</div>;
  if (m.kind === 'agent') return <div style={{ alignSelf: 'flex-start', maxWidth: '92%', background: 'var(--bg-muted, #f1f5f9)', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>;
  if (m.kind === 'info') return <div style={{ alignSelf: 'center', fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>{m.text}</div>;
  if (m.kind === 'error') return <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 10, fontSize: 12.5 }}>{m.text}</div>;
  if (m.kind === 'approval') return (
    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: 10, fontSize: 12.5 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700, color: '#92400e' }}><ShieldAlert size={14} /> Approve risky action: {m.name}</div>
      <pre style={{ margin: '6px 0', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(m.input)}</pre>
      {m.answered ? <span style={{ fontWeight: 700 }}>{m.answered === 'allowed' ? 'Allowed' : 'Denied'}</span> : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onAnswer(m.id, true)} style={{ ...primaryBtn, padding: '5px 14px', background: '#16a34a' }}>Allow</button>
          <button onClick={() => onAnswer(m.id, false)} style={{ ...primaryBtn, padding: '5px 14px', background: '#dc2626' }}>Deny</button>
        </div>
      )}
    </div>
  );
  const color = m.state === 'ok' ? '#16a34a' : m.state === 'error' ? '#dc2626' : '#d97706';
  const args = Object.keys(m.input || {}).length ? ' ' + JSON.stringify(m.input) : '';
  return (
    <div style={{ fontSize: 11.5, fontFamily: 'JetBrains Mono, Consolas, monospace', border, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '5px 9px', background: 'var(--bg-card, #fff)' }}>
      <span style={{ fontWeight: 700 }}>{m.name}</span><span style={{ color: 'var(--text-muted, #64748b)' }}>{args.slice(0, 120)}</span>
      <div style={{ color }}>{m.state === 'running' ? 'running…' : m.summary}</div>
    </div>
  );
};
