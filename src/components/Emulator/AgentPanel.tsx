import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Square, Trash2, KeyRound, Plug, Copy, Check, ShieldAlert, Power, FlaskConical, Paperclip, FileText, X, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { EmulatorApi } from './useEmulator';
import { PowerPanel, startEmulator } from './PowerControl';
import { WebPane } from './WebPane';

interface AgentPanelProps {
  emu: EmulatorApi;
  world?: 'phone' | 'web';
  active?: boolean;
}

type Msg =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; text: string }
  | { kind: 'tool'; id: string; name: string; input: any; state: 'running' | 'ok' | 'error'; summary?: string }
  | { kind: 'approval'; id: string; name: string; input: any; answered?: 'allowed' | 'denied' }
  | { kind: 'startPrompt'; pending: string; state: 'ask' | 'starting' | 'cancelled' }
  | { kind: 'info'; text: string }
  | { kind: 'check'; id?: string; title: string; status: string; evidence: string }
  | { kind: 'report'; runId: string; status: string }
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

export const AgentPanel: React.FC<AgentPanelProps> = ({ emu, world = 'phone', active = true }) => {
  const isWeb = world === 'web';
  const serial = emu.status.serial || 'emulator-5554';
  const connected = emu.phase === 'running';
  const hideKey = 'sf_chat_hidden_' + world;
  const [chatHidden, setChatHidden] = useState(() => { try { return localStorage.getItem(hideKey) === '1'; } catch (e) { return false; } });
  useEffect(() => { try { localStorage.setItem(hideKey, chatHidden ? '1' : '0'); } catch (e) {} }, [chatHidden, hideKey]);
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
  const [pending, setPending] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(() => { try { return localStorage.getItem('sf_test_mode') === '1'; } catch (e) { return false; } });
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [showReports, setShowReports] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [web, setWeb] = useState<any>(null);
  useEffect(() => {
    if (!showSettings) return;
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/web/status')).json(); if (!stop) setWeb(j); } catch (e) {} if (!stop) setTimeout(tick, 2000); };
    tick();
    return () => { stop = true; };
  }, [showSettings]);
  const webPost = (p: string, body?: any) => fetch('/api/web/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  useEffect(() => { try { localStorage.setItem('sf_test_mode', testMode ? '1' : '0'); } catch (e) {} }, [testMode]);
  const loadRuns = () => fetch('/api/agent/reports').then(r => r.json()).then(j => setRuns(j.runs || [])).catch(() => {});
  useEffect(() => { if (showReports) loadRuns(); }, [showReports]);
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const out: { name: string; text: string }[] = [];
    for (const f of Array.from(list).slice(0, 10)) {
      if (f.size > 300_000) { setMsgs(m => [...m, { kind: 'error', text: f.name + ' is too large (max 300 KB). Use a text-based test case file.' }]); continue; }
      out.push({ name: f.name, text: await f.text() });
    }
    setFiles(x => [...x, ...out].slice(0, 10));
  };
  const sessionId = useRef('sf-' + Math.random().toString(36).slice(2, 10));
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadKey().then((k) => { setApiKey(k); if (!k) setShowSettings(true); }); }, []);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);
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
    if (!connected || !active || isWeb) { setShot(''); return; }
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
  }, [connected, serial, busy, active, isWeb]);

  const showReportsRef = useRef(false); showReportsRef.current = showReports;
  const callTool = (name: string, args: any) => fetch(`/api/device/tool/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial, ...args }) });
  const onScreenClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    callTool('tap', { x: Math.round((e.clientX - r.left) / r.width * dev.w), y: Math.round((e.clientY - r.top) / r.height * dev.h) });
  };
  const phoneBtn = (key: string) => callTool('key', { key });

  // ---------- chat ----------
  const send = useCallback(async (override?: string, alreadyShown?: boolean) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    if (!apiKey) { setShowSettings(true); return; }
    setInput('');
    if (!alreadyShown) setMsgs(m => [...m, { kind: 'user', text }]);
    if (!isWeb && (emu.phase === 'not_installed' || emu.phase === 'installing')) {
      setMsgs(m => [...m, { kind: 'info', text: emu.phase === 'installing' ? 'The emulator is still installing. Send again when it finishes.' : 'The emulator is not installed yet. Use the Install button on the phone, then send again.' }]);
      return;
    }
    if (!connected && !isWeb) {
      // Emulator is off: ask in chat instead of failing
      setMsgs(m => [...m, { kind: 'startPrompt', pending: text, state: emu.phase === 'booting' ? 'starting' : 'ask' }]);
      if (emu.phase === 'booting') setPending(text);
      return;
    }
    setBusy(true);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({
          sessionId: sessionId.current, apiKey, model, serial, mode,
          message: testMode && files.length ? text + '\n\n' + files.map(f => '--- Attached file: ' + f.name + ' ---\n' + f.text).join('\n\n') : text,
          ...(testMode ? { testMode: { title: text.split('\n')[0].slice(0, 80), attachments: files.map(f => ({ name: f.name })) } } : {})
        })
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
  }, [input, busy, apiKey, model, serial, mode, connected, emu.phase, testMode, files, isWeb]);

  useEffect(() => {
    if (pending && connected && !busy) {
      const t = pending; setPending(null);
      setMsgs(m => [...m, { kind: 'info', text: 'Emulator is ready. Running your request…' }]);
      send(t, true);
    }
  }, [pending, connected, busy, send]);

  useEffect(() => {
    if (!pending || connected || emu.phase === 'booting' || emu.busy) return;
    const t = setTimeout(() => {
      setPending(null);
      setMsgs(m => m.map(x => x.kind === 'startPrompt' && x.state === 'starting' ? { ...x, state: 'cancelled' } : x));
    }, 4000);
    return () => clearTimeout(t);
  }, [pending, connected, emu.phase, emu.busy]);

  const startFromChat = async (idx: number, text: string) => {
    setMsgs(m => m.map((x, i) => i === idx && x.kind === 'startPrompt' ? { ...x, state: 'starting' } : x));
    setPending(text);
    const ok = await startEmulator(emu);
    if (!ok) { setPending(null); setMsgs(m => m.map((x, i) => i === idx && x.kind === 'startPrompt' ? { ...x, state: 'ask' } : x)); }
  };
  const cancelStart = (idx: number) => { setPending(null); setMsgs(m => m.map((x, i) => i === idx && x.kind === 'startPrompt' ? { ...x, state: 'cancelled' } : x)); };

  const handleEvent = (ev: any) => {
    if (ev.type === 'text') setMsgs(m => [...m, { kind: 'agent', text: ev.text }]);
    else if (ev.type === 'tool_call') setMsgs(m => [...m, { kind: 'tool', id: ev.id, name: ev.name, input: ev.input, state: 'running' }]);
    else if (ev.type === 'tool_result') setMsgs(m => m.map(x => x.kind === 'tool' && x.id === ev.id ? { ...x, state: ev.ok ? 'ok' : 'error', summary: ev.summary } : x));
    else if (ev.type === 'approval') setMsgs(m => [...m, { kind: 'approval', id: ev.id, name: ev.name, input: ev.input }]);
    else if (ev.type === 'check') setMsgs(m => [...m, { kind: 'check', ...ev.check }]);
    else if (ev.type === 'report_ready') { setMsgs(m => [...m, { kind: 'report', runId: ev.runId, status: ev.status }]); if (showReportsRef.current) loadRuns(); }
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
    <div style={{ display: active ? 'flex' : 'none', gap: 16, flex: 1, minHeight: 440, maxHeight: 'calc(100vh - 300px)' }}>
      {/* ---------- left: chat ---------- */}
      <div style={{ ...card, flex: 1, minWidth: 0, display: chatHidden ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: border, flexWrap: 'wrap' }}>
          <select value={model} onChange={e => setModel(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border, width: 'auto', flex: '0 0 auto' }}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={mode} onChange={e => setMode(e.target.value as any)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border, width: 'auto', flex: '0 0 auto' }} title="Dangerous actions: shell, uninstall, clear data, install APK">
            <option value="ask">Ask before risky actions</option>
            <option value="auto">Auto (no prompts)</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginLeft: 'auto' }}>
            {fmt(tokens.input)} in · {fmt(tokens.output)} out{tokens.cached ? ` · ${fmt(tokens.cached)} cached` : ''}
          </span>
          <button onClick={() => setChatHidden(true)} title="Hide chat" style={iconBtn}><PanelLeftClose size={14} /></button>
          <button onClick={() => setTestMode(t => !t)} title="Test mode: AI works through your test cases and writes a report with screenshots"
            style={{ ...iconBtn, ...(testMode ? { background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' } : {}) }}><FlaskConical size={14} /> Test mode</button>
          <button onClick={() => setShowReports(v => !v)} title="Saved test reports" style={iconBtn}><FileText size={14} /></button>
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
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Web testing (Chromium) {web?.installed && <span style={{ color: '#16a34a' }}>· installed</span>}</div>
              {!web ? <div style={{ color: 'var(--text-muted, #64748b)' }}>Checking…</div> : web.isInstalling ? (
                <div style={{ color: 'var(--text-muted, #64748b)' }}>{web.stage || 'Installing…'}</div>
              ) : !web.installed ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => webPost('install')} style={primaryBtn}>Install Chromium</button>
                  <span style={{ color: 'var(--text-muted, #64748b)' }}>One-time download (~150 MB). Lets the agent test websites.{web.error ? ' ' + web.error : ''}</span>
                </div>
              ) : (
                <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={!web.headless} onChange={e => webPost('config', { headless: !e.target.checked })} />
                  <span>Show the browser window while the agent tests</span>
                </label>
              )}
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

        {showReports && (
          <div style={{ padding: 12, borderBottom: border, background: 'rgba(79,70,229,0.04)', fontSize: 12, maxHeight: 190, overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Test reports</div>
            {runs.length === 0 && <div style={{ color: 'var(--text-muted, #64748b)' }}>No reports yet. Turn on Test mode and send your test cases.</div>}
            {runs.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: border }}>
                <span style={{ fontWeight: 700, color: r.status === 'passed' ? '#16a34a' : r.status === 'failed' ? '#dc2626' : '#d97706' }}>{r.status.toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title} <span style={{ color: 'var(--text-muted, #64748b)' }}>· {r.pass}/{r.total} passed · {new Date(r.startedAt).toLocaleString()}</span></span>
                <a href={'/api/agent/reports/' + r.id + '/pdf'} download style={linkBtn}><Download size={11} /> PDF</a>
                <a href={'/api/agent/reports/' + r.id + '/docx'} download style={linkBtn}><Download size={11} /> DOCX</a>
              </div>
            ))}
          </div>
        )}

        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13, maxWidth: 340, lineHeight: 1.6 }}>
              {connected || isWeb ? 'Tell the agent what to test. For example:' : 'The emulator is off. Power it on from the phone on the right, or just send an instruction and I will ask.'}
              {(connected || isWeb) && <div style={{ marginTop: 8, fontStyle: 'italic' }}>{isWeb ? '"Open example.com, click Learn more and tell me the page title"' : '"Open Settings, search for Wi-Fi and tell me what you see"'}</div>}
            </div>
          )}
          {msgs.map((m, i) => <Bubble key={i} m={m} onAnswer={answer} onStart={() => m.kind === 'startPrompt' && startFromChat(i, m.pending)} onCancelStart={() => cancelStart(i)} />)}
          {busy && <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Agent is working…</div>}
        </div>

        {testMode && (
          <div style={{ padding: '8px 12px', borderTop: border, background: 'rgba(79,70,229,0.06)', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <FlaskConical size={13} color="#4f46e5" /><b style={{ color: '#4f46e5' }}>Test mode</b>
            <span style={{ color: 'var(--text-muted, #64748b)' }}>Write test cases below or attach files. A report (PDF/DOCX) with screenshots is made at the end.</span>
            {files.map((f, i) => <span key={i} style={{ background: 'var(--bg-card, #fff)', border, borderRadius: 6, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{f.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => setFiles(x => x.filter((_, j) => j !== i))} /></span>)}
            <button onClick={() => fileRef.current?.click()} style={{ ...iconBtn, padding: '2px 8px', fontSize: 11 }}><Paperclip size={12} /> Attach test cases</button>
            <input ref={fileRef} type="file" multiple accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.feature,.tsv" style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
        )}
        <div style={{ padding: 10, borderTop: border, display: 'flex', gap: 8 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={testMode ? "Test cases or instruction, e.g. TC-01: login with wrong password shows an error…" : "Instruction for the agent… (Enter to send, Shift+Enter for new line)"}
            style={{ flex: 1, resize: 'none', padding: '8px 10px', borderRadius: 10, border, fontSize: 13, fontFamily: 'inherit' }} />
          {busy
            ? <button onClick={stop} style={{ ...primaryBtn, background: '#dc2626' }}><Square size={14} /> Stop</button>
            : <button onClick={() => send()} disabled={!input.trim() && !(testMode && files.length)} style={primaryBtn}><Send size={14} /> Send</button>}
        </div>
      </div>

      {chatHidden && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setChatHidden(false)} title="Show chat" style={{ ...iconBtn, padding: '10px 8px' }}><PanelLeftOpen size={16} /></button>
          {busy && <span title="Agent is working" style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} />}
        </div>
      )}
      {/* ---------- right: phone / browser ---------- */}
      {isWeb && <WebPane active={active} serial={serial} busy={busy} />}
      <div style={{ display: isWeb ? 'none' : 'flex', width: chatHidden ? 340 : 290, margin: chatHidden ? '0 auto' : undefined, flexShrink: 0, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ background: '#0f172a', borderRadius: 34, padding: 10, boxShadow: '0 10px 30px rgba(15,23,42,0.35)', width: '100%', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {shot
            ? <img ref={imgRef} src={shot} onClick={onScreenClick} alt="Device screen" draggable={false}
                style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 24, cursor: 'pointer', display: 'block' }} />
            : connected
              ? <div style={{ color: '#64748b', fontSize: 12, padding: 20, textAlign: 'center' }}>Loading screen…</div>
              : <PowerPanel emu={emu} dark />}
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
const linkBtn: React.CSSProperties = { ...iconBtn, padding: '2px 8px', fontSize: 11, textDecoration: 'none' };
const primaryBtn: React.CSSProperties = { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

const CodeLine: React.FC<{ text: string; onCopy: () => void; done: boolean; multiline?: boolean }> = ({ text, onCopy, done, multiline }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
    <pre style={{ flex: 1, margin: 0, padding: '6px 8px', background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: 11, overflowX: 'auto', whiteSpace: multiline ? 'pre' : 'pre-wrap', wordBreak: 'break-all' }}>{text}</pre>
    <button onClick={onCopy} style={iconBtn}>{done ? <Check size={13} /> : <Copy size={13} />}</button>
  </div>
);

const Bubble: React.FC<{ m: Msg; onAnswer: (id: string, allow: boolean) => void; onStart: () => void; onCancelStart: () => void }> = ({ m, onAnswer, onStart, onCancelStart }) => {
  if (m.kind === 'startPrompt') return (
    <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: 12, fontSize: 13, alignSelf: 'flex-start', maxWidth: '92%' }}>
      <div style={{ fontWeight: 700, color: '#3730a3', marginBottom: 6 }}>The emulator is off.</div>
      {m.state === 'ask' && <>
        <div style={{ color: '#475569', marginBottom: 8 }}>Power it on and I will run your request as soon as it is ready (about 1–2 minutes).</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onStart} style={{ ...primaryBtn, padding: '6px 14px' }}><Power size={14} /> Power on &amp; continue</button>
          <button onClick={onCancelStart} style={{ ...iconBtn, padding: '6px 14px' }}>Not now</button>
        </div>
      </>}
      {m.state === 'starting' && <div style={{ color: '#475569' }}>Starting… I will continue automatically. <button onClick={onCancelStart} style={{ ...iconBtn, padding: '2px 8px', marginLeft: 6 }}>Cancel</button></div>}
      {m.state === 'cancelled' && <div style={{ color: '#64748b' }}>Cancelled. Power on the emulator from the phone panel, then send again.</div>}
    </div>
  );
  if (m.kind === 'user') return <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#4f46e5', color: '#fff', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.text}</div>;
  if (m.kind === 'agent') return <div style={{ alignSelf: 'flex-start', maxWidth: '92%', background: 'var(--bg-muted, #f1f5f9)', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>;
  if (m.kind === 'check') {
    const c = m.status === 'pass' ? '#16a34a' : m.status === 'fail' ? '#dc2626' : '#d97706';
    return <div style={{ border, borderLeft: '4px solid ' + c, borderRadius: 8, padding: '6px 10px', fontSize: 12.5, background: 'var(--bg-card, #fff)' }}>
      <b style={{ color: c }}>{m.status.toUpperCase()}</b> {m.id ? m.id + ' · ' : ''}{m.title}
      <div style={{ color: 'var(--text-muted, #64748b)', marginTop: 2 }}>{m.evidence}</div></div>;
  }
  if (m.kind === 'report') return (
    <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: 12, fontSize: 13, alignSelf: 'flex-start' }}>
      <div style={{ fontWeight: 700, color: '#3730a3', marginBottom: 8 }}>Test report ready: {m.status.toUpperCase()}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <a href={'/api/agent/reports/' + m.runId + '/pdf'} download style={{ ...primaryBtn, padding: '6px 14px', textDecoration: 'none' }}><Download size={14} /> PDF</a>
        <a href={'/api/agent/reports/' + m.runId + '/docx'} download style={{ ...primaryBtn, padding: '6px 14px', textDecoration: 'none' }}><Download size={14} /> DOCX</a>
      </div>
    </div>
  );
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
