import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Square, Trash2, KeyRound, Plug, Copy, Check, ShieldAlert, Power, FlaskConical, Paperclip, FileText, X, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { EmulatorApi } from './useEmulator';
import { PowerPanel, startEmulator } from './PowerControl';
import { WebPane } from './WebPane';
import { loadKey } from './secrets';
import { ConnectOptions, useClaudeStatus, resolveEngine, getEnginePref } from './ConnectOptions';

interface AgentPanelProps {
  emu: EmulatorApi;
  world?: 'phone' | 'web';
  active?: boolean;
  fill?: boolean; // full-page use: take the whole window height
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

const border = '1px solid var(--border-color, #e2e8f0)';
const card: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 12 };

export const AgentPanel: React.FC<AgentPanelProps> = ({ emu, world = 'phone', active = true, fill = false }) => {
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
  const [pref, setPref] = useState(getEnginePref());
  const [showConnect, setShowConnect] = useState(false);
  const { cli } = useClaudeStatus(active);
  const engine = resolveEngine(pref, cli, !!apiKey);
  useEffect(() => { const h = () => setPref(getEnginePref()); window.addEventListener('sf-engine-changed', h); return () => window.removeEventListener('sf-engine-changed', h); }, []);
  const [model, setModel] = useState(() => { try { return localStorage.getItem('sf_agent_model') || MODELS[0].id; } catch (e) { return MODELS[0].id; } });
  const [mode, setMode] = useState<'ask' | 'auto'>('ask');
  const [tokens, setTokens] = useState({ input: 0, output: 0, cached: 0 });
  const [pending, setPending] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(() => { try { return localStorage.getItem('sf_test_mode') === '1'; } catch (e) { return false; } });
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [showReports, setShowReports] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: any) => { if (e.detail?.world !== world) return; setInput(e.detail.text || ''); if (e.detail.testMode) setTestMode(true); };
    window.addEventListener('sf-prefill-chat', h);
    return () => window.removeEventListener('sf-prefill-chat', h);
  }, [world]);
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

  // External AI clients (Claude Code etc.) attached through MCP
  const [mcpLive, setMcpLive] = useState<{ connected: boolean; clients: string[]; recent: { name: string; ok: boolean; client?: string }[] }>({ connected: false, clients: [], recent: [] });
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/mcp/live/status')).json(); if (!stop) setMcpLive({ connected: !!j.connected, clients: j.clients || [], recent: j.recent || [] }); } catch (e) {} if (!stop) setTimeout(tick, 2000); };
    tick();
    return () => { stop = true; };
  }, [active]);
  useEffect(() => {
    const load = () => loadKey().then(setApiKey);
    load();
    window.addEventListener('sf-key-changed', load);
    return () => window.removeEventListener('sf-key-changed', load);
  }, []);
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
  // Touch input on the phone view: click = tap, mouse drag = swipe, two-finger trackpad / wheel scroll = scroll the app.
  const toDevice = (clientX: number, clientY: number) => {
    const r = imgRef.current!.getBoundingClientRect();
    const sc = Math.min(r.width / dev.w, r.height / dev.h);
    const ox = (r.width - dev.w * sc) / 2, oy = (r.height - dev.h * sc) / 2;
    return { x: Math.max(0, Math.min(dev.w, Math.round((clientX - r.left - ox) / sc))), y: Math.max(0, Math.min(dev.h, Math.round((clientY - r.top - oy) / sc))) };
  };
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    down.current = { ...toDevice(e.clientX, e.clientY), t: Date.now() };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    const d = down.current; down.current = null;
    if (!d || !imgRef.current) return;
    const p = toDevice(e.clientX, e.clientY);
    if (Math.hypot(p.x - d.x, p.y - d.y) < dev.w * 0.025) callTool('tap', { x: d.x, y: d.y });
    else callTool('swipe', { x1: d.x, y1: d.y, x2: p.x, y2: p.y, durationMs: Math.min(600, Math.max(120, Date.now() - d.t)) });
  };
  const wheelAcc = useRef({ dx: 0, dy: 0, timer: 0 as any, busy: false });
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !connected || isWeb) return;
    const flush = async () => {
      const w = wheelAcc.current;
      if (w.busy) { w.timer = setTimeout(flush, 80); return; }
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const kx = dev.w / Math.min(r.width, r.height * dev.w / dev.h), ky = kx;
      const dx = Math.max(-dev.w * 0.6, Math.min(dev.w * 0.6, w.dx * kx)), dy = Math.max(-dev.h * 0.5, Math.min(dev.h * 0.5, w.dy * ky));
      w.dx = 0; w.dy = 0;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      const cx = Math.round(dev.w / 2), cy = Math.round(dev.h / 2);
      w.busy = true;
      // wheel down = content moves up = finger moves up
      await callTool('swipe', { x1: Math.round(cx + dx / 2), y1: Math.round(cy + dy / 2), x2: Math.round(cx - dx / 2), y2: Math.round(cy - dy / 2), durationMs: 220 }).catch(() => {});
      w.busy = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const w = wheelAcc.current;
      const scale = e.deltaMode === 1 ? 16 : 1;
      w.dx += e.deltaX * scale; w.dy += e.deltaY * scale;
      clearTimeout(w.timer); w.timer = setTimeout(flush, 90);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(wheelAcc.current.timer); };
  }, [connected, isWeb, dev.w, dev.h, shot ? 1 : 0]);
  const phoneBtn = (key: string) => callTool('key', { key });

  // ---------- chat ----------
  const send = useCallback(async (override?: string, alreadyShown?: boolean) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    if (engine === 'none') {
      setMsgs(m => [...m, { kind: 'user', text }, mcpLive.connected
        ? { kind: 'info', text: 'Your connected AI (' + (mcpLive.clients[0] || 'MCP') + ') controls the ' + (isWeb ? 'browser' : 'phone') + ' directly, so give it the instruction in its own window. To chat here too, press Connect and sign in.' }
        : { kind: 'info', text: 'Not connected yet. Pick one of the three options below, then send again.' }]);
      setInput(''); setShowConnect(true);
      return;
    }
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
          sessionId: sessionId.current, engine, ...(engine === 'api' ? { apiKey } : {}), model, serial, mode,
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
  }, [input, busy, apiKey, engine, model, serial, mode, connected, emu.phase, testMode, files, isWeb, mcpLive]);

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
  const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  return (
    <div style={{ display: active ? 'flex' : 'none', gap: 16, flex: fill ? '0 0 auto' : 1, minHeight: 520, height: fill ? 'calc(100vh - 215px)' : 'calc(100vh - 238px)' }}>
      {/* ---------- left: chat ---------- */}
      <div style={{ ...card, flex: '0 0 clamp(340px, 40%, 560px)', minWidth: 0, display: chatHidden ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: border, flexWrap: 'wrap' }}>
          <select value={model} onChange={e => setModel(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border, width: 'auto', flex: '0 0 auto' }}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={mode} onChange={e => setMode(e.target.value as any)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border, width: 'auto', flex: '0 0 auto' }} title="Dangerous actions: shell, uninstall, clear data, install APK">
            <option value="ask">Ask first</option>
            <option value="auto">Auto</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginLeft: 'auto' }}>
            {engine === 'claude' ? 'Claude · signed in' : engine === 'api' ? `${fmt(tokens.input)} in · ${fmt(tokens.output)} out` : ''}
          </span>
          <button onClick={() => setChatHidden(true)} title="Hide chat" style={iconBtn}><PanelLeftClose size={14} /></button>
          <button onClick={() => setTestMode(t => !t)} title="Test mode: AI works through your test cases and writes a report with screenshots"
            style={{ ...iconBtn, ...(testMode ? { background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' } : {}) }}><FlaskConical size={14} /> Test mode</button>
          <button onClick={() => setShowReports(v => !v)} title="Saved test reports" style={iconBtn}><FileText size={14} /></button>
          <button onClick={() => setShowConnect(v => !v)} title="How the AI is connected" style={iconBtn}><Plug size={14} /></button>
          <button onClick={reset} title="New chat" style={iconBtn}><Trash2 size={14} /></button>
        </div>

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

        {showConnect && (
          <div style={{ padding: 12, borderTop: border, background: 'rgba(79,70,229,0.04)', maxHeight: '55%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><b style={{ fontSize: 13 }}>Connect the AI</b><button onClick={() => setShowConnect(false)} style={{ ...iconBtn, marginLeft: 'auto', padding: '2px 6px' }}><X size={12} /></button></div>
            <ConnectOptions hasKey={!!apiKey} onChanged={() => setShowConnect(false)} />
          </div>
        )}
        {mcpLive.connected && (
          <div style={{ padding: '8px 12px', borderTop: border, background: 'rgba(34,197,94,0.10)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} /> {mcpLive.clients.join(', ')} is controlling StreamFusion
            </div>
            {mcpLive.recent.length > 0 && <div style={{ color: 'var(--text-muted, #64748b)', fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11, lineHeight: 1.5 }}>
              {mcpLive.recent.slice(0, 5).map((r, i) => <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 1 - i * 0.15 }}><span style={{ color: r.ok ? '#16a34a' : '#dc2626' }}>{r.ok ? '✓' : '✗'}</span> {r.name}</div>)}
            </div>}
          </div>
        )}
        {engine === 'none' && !mcpLive.connected && !showConnect && (
          <div style={{ padding: '8px 12px', borderTop: border, background: '#fef2f2', color: '#b91c1c', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={14} /> <b>Agent not connected yet.</b>
            <button onClick={() => setShowConnect(true)} style={{ ...iconBtn, padding: '3px 12px', fontSize: 11.5, marginLeft: 'auto', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 700 }}><Plug size={12} /> Connect</button>
          </div>
        )}
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
      <div style={{ display: isWeb ? 'none' : 'flex', flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 12 }}>
        <div style={{ minHeight: 0, height: '100%', display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        {/* a real phone shape (about 6.5 inch, 9:19.5) that fills the available height */}
        <div style={{ background: '#0f172a', borderRadius: 40, padding: 10, boxShadow: '0 14px 40px rgba(15,23,42,0.4), inset 0 0 0 2px #1e293b', height: '100%', aspectRatio: '9 / 19.5', maxWidth: '100%', minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 30 }}>
          {shot
            ? <img ref={imgRef} src={shot} onPointerDown={onPointerDown} onPointerUp={onPointerUp} alt="Device screen" draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 30, cursor: 'pointer', display: 'block', touchAction: 'none', userSelect: 'none' }} />
            : connected
              ? <div style={{ color: '#64748b', fontSize: 12, padding: 20, textAlign: 'center' }}>Loading screen…</div>
              : <PowerPanel emu={emu} dark />}
          </div>
        </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }} title="Click = tap, drag = swipe, two-finger scroll = scroll">
          {[['Back', 'back'], ['Home', 'home'], ['Recents', 'recent']].map(([l, k]) => (
            <button key={k} onClick={() => phoneBtn(k)} disabled={!connected} style={{ ...iconBtn, padding: '7px 10px', fontSize: 11, justifyContent: 'center' }}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-main, #0f172a)' };
const linkBtn: React.CSSProperties = { ...iconBtn, padding: '2px 8px', fontSize: 11, textDecoration: 'none' };
const primaryBtn: React.CSSProperties = { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

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
