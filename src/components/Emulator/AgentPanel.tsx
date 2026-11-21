import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, Square, Plus, Plug, ShieldAlert, Power, FlaskConical, FileText, X, Download, PanelLeftClose, PanelLeftOpen, History, MoreHorizontal, RotateCcw, User, Globe, Smartphone } from 'lucide-react';
import { Markdown, CopyBtn, ToolGroup, humanStep, HistoryPanel, ResumeBanner, type ChatSummary } from './ChatBits';
import type { EmulatorApi } from './useEmulator';
import { PowerPanel, startEmulator } from './PowerControl';
import { WebPane } from './WebPane';
import { loadKey, loadSecret, saveSecret, loginSecretName } from './secrets';
import { readBriefFiles } from './readFiles';
import { SaveAsTest } from '../Projects/AutomatedTests';
import { LiveScreen, canLiveStream } from './LiveScreen';
import { ConnectOptions, useClaudeStatus, resolveEngine, getEnginePref, installClaude, startClaudeSignIn } from './ConnectOptions';
import { Coach, type CoachGuide } from '../Tutorial/Coach';
import { TestBrief, StartBar, EMPTY_BRIEF, briefMissing, composeBrief, cleanLogin, stepOfMissing, STEPS, type Brief, type BriefFile } from './TestBrief';

interface AgentPanelProps {
  emu: EmulatorApi;
  world?: 'phone' | 'web';
  active?: boolean;
  fill?: boolean; // full-page use: take the whole window height
  deviceSerial?: string;
}

type Msg =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; text: string }
  | { kind: 'tool'; id: string; name: string; input: any; state: 'running' | 'ok' | 'error'; summary?: string }
  | { kind: 'approval'; id: string; name: string; input: any; answered?: 'allowed' | 'denied' }
  | { kind: 'startPrompt'; pending: string; state: 'ask' | 'starting' | 'cancelled' }
  | { kind: 'info'; text: string }
  | { kind: 'phase'; phase: string; text: string }
  | { kind: 'check'; id?: string; title: string; status: string; evidence: string; persona?: string }
  | { kind: 'report'; runId: string; status: string; projectId?: string; savedTo?: string }
  | { kind: 'error'; text: string };

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5 (best)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (recommended)' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (cheapest)' }
];

const DOING: Record<string, string> = {
  tap: 'Tapping', swipe: 'Swiping', type_text: 'Typing', screenshot: 'Taking a screenshot', ui_tree: 'Reading the screen', launch_app: 'Opening the app', key: 'Pressing a key',
  device_batch: 'Running a test case', web_batch: 'Running a test case', web_navigate: 'Opening a page', web_click: 'Clicking', web_click_at: 'Clicking', web_fill: 'Filling a field',
  web_snapshot: 'Reading the page', web_screenshot: 'Taking a screenshot', web_assert_text: 'Checking the text', assert_text: 'Checking the text', web_assert_url: 'Checking the address',
  assert_no_crash: 'Checking for crashes', report_check: 'Saving the result', finish_report: 'Writing the report', wake_screen: 'Waking the phone', logcat: 'Reading the logs', web_console: 'Reading browser errors', web_network: 'Reading network calls'
};
const liveLine = (msgs: Msg[], busy: boolean): string => {
  const last = msgs[msgs.length - 1];
  const run = [...msgs].reverse().find(m => m.kind === 'tool' && m.state === 'running') as any;
  if (run) { const t = String(run.input?.url || run.input?.text || run.input?.package || '').replace(/^https?:\/\//, '').slice(0, 40); return (DOING[run.name] || run.name.replace(/_/g, ' ')) + (t ? ' · ' + t : '') + '…'; }
  if (last?.kind === 'check') return (last.id ? last.id + ' · ' : '') + last.status.toUpperCase() + ' · ' + last.title;
  if (last?.kind === 'approval' && !last.answered) return 'Waiting for your approval';
  if (last?.kind === 'report') return 'Report ready · ' + last.status.toUpperCase();
  if (last?.kind === 'error') return 'Stopped: ' + last.text.slice(0, 60);
  if (busy) { const a = [...msgs].reverse().find(m => m.kind === 'agent') as any; return a ? String(a.text).replace(/[#*`|>]/g, '').trim().split('\n')[0].slice(0, 70) : 'Thinking…'; }
  return 'Idle. Open the chat to continue';
};

const border = '1px solid var(--border-color, #e2e8f0)';
const card: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 12 };

export const AgentPanel: React.FC<AgentPanelProps> = ({ emu, world = 'phone', active = true, fill = false, deviceSerial }) => {
  const isWeb = world === 'web';
  const serial = deviceSerial || emu.status.serial || 'emulator-5554';
  const connected = deviceSerial ? true : emu.phase === 'running'; // a real phone chosen on the Emulator page is always "on"
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
  const [model, setModel] = useState(() => { try { return localStorage.getItem('sf_agent_model') || MODELS[1].id; } catch (e) { return MODELS[1].id; } }); // Sonnet by default: about 5x cheaper than Opus and good enough for test execution
  const [mode, setMode] = useState<'ask' | 'auto'>('ask');
  const [tokens, setTokens] = useState({ input: 0, output: 0, cached: 0 });
  const [progress, setProgress] = useState<{ done: number; total: number; pass: number; fail: number; blocked: number } | null>(null); // live "case 7 of 145" counter
  const [phaseNow, setPhaseNow] = useState<'app' | 'browser'>('app');
  const [pending, setPending] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(() => { try { return localStorage.getItem('sf_test_mode') === '1'; } catch (e) { return false; } });
  const [files, setFiles] = useState<BriefFile[]>([]);
  const briefKey = 'sf_brief_' + world;
  const [brief, setBriefState] = useState<Brief>(() => { try { return { ...EMPTY_BRIEF, ...JSON.parse(localStorage.getItem(briefKey) || '{}'), login: '' }; } catch (e) { return EMPTY_BRIEF; } });
  const setBrief = (b: Brief) => { setBriefState(b); try { localStorage.setItem(briefKey, JSON.stringify({ ...b, login: '' })); } catch (e) {} }; // logins are never stored
  const runPidRef = useRef('');
  const curProjectRef = useRef<string>(''); // the project of this chat: the reports panel shows only its reports
  const runIdRef = useRef<string | null>(null); // the report run of this chat
  const testRunRef = useRef<{ title: string; summary: string; projectId: string; logins?: string } | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectData, setProjectData] = useState<any>(null);
  const loadProjects = () => fetch('/api/projects').then(r => r.json()).then(j => setProjects(j.projects || [])).catch(() => {});
  const loadProject = async (id: string) => { try { const j = await (await fetch('/api/projects/' + id)).json(); if (j.success) { setProjectData(j.project); return j.project; } } catch (e) {} return null; };
  const [showReports, setShowReports] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // ---------- chat history: every chat is saved to disk; an interrupted test can be resumed ----------
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [interrupted, setInterrupted] = useState(false);
  const testInfoRef = useRef<{ title: string; summary: string; projectId: string; full: string; target: string } | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  const tokensRef = useRef({ input: 0, output: 0, cached: 0 });
  const lastSentRef = useRef('');
  const prefilledRef = useRef(false);
  const loadChats = () => fetch('/api/agent/chats?world=' + world).then(r => r.json()).then(j => setChats(j.chats || [])).catch(() => {});
  useEffect(() => { if (showHistory) loadChats(); }, [showHistory]);
  useEffect(() => {
    const h = (e: any) => {
      if (e.detail?.world !== world) return;
      prefilledRef.current = true;
      (window as any).__sfPrefill = null;
      if (e.detail.brief) setBrief({ ...EMPTY_BRIEF, ...e.detail.brief }); else setInput(e.detail.text || '');
      if (e.detail.files) setFiles(e.detail.files);
      if (e.detail.projectId) { setProjectId(e.detail.projectId); loadProject(e.detail.projectId); }
      if (e.detail.testMode) { setTestMode(true); setMsgs([]); }
    };
    window.addEventListener('sf-prefill-chat', h);
    const pending = (window as any).__sfPrefill; // opened from the Projects page before this panel was mounted
    if (active && pending?.world === world) h({ detail: { world, ...pending.detail } });
    return () => window.removeEventListener('sf-prefill-chat', h);
  }, [world, active]);
  useEffect(() => { try { localStorage.setItem('sf_test_mode', testMode ? '1' : '0'); } catch (e) {} }, [testMode]);
  curProjectRef.current = projectId || runPidRef.current || testInfoRef.current?.projectId || '';
  const loadRuns = () => fetch('/api/agent/reports' + (curProjectRef.current ? '?projectId=' + encodeURIComponent(curProjectRef.current) : '')).then(r => r.json()).then(j => setRuns(j.runs || [])).catch(() => {});
  useEffect(() => { if (showReports) loadRuns(); }, [showReports, projectId]);
  const addFiles = async (list: FileList | null, kind: 'cases' | 'docs' = 'cases') => {
    if (!list) return;
    const out = await readBriefFiles(list, kind, (text) => setMsgs(m => [...m, { kind: 'error', text }]));
    setFiles(x => [...x, ...out].slice(0, 12));
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
  const stickRef = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const onListScroll = () => { const el = listRef.current; if (!el) return; const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140; stickRef.current = near; setShowLatest(!near); };
  const toLatest = () => { const el = listRef.current; if (el) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); stickRef.current = true; setShowLatest(false); } };
  useEffect(() => { const el = listRef.current; if (el && stickRef.current) el.scrollTop = el.scrollHeight; }, [msgs]);
  useEffect(() => { try { localStorage.setItem('sf_agent_model', model); } catch (e) {} }, [model]);

  // ---------- live phone screen (polls a downscaled screenshot; click = tap) ----------
  const [shot, setShot] = useState('');
  const [dev, setDev] = useState({ w: 1080, h: 2400 });
  const [devName, setDevName] = useState('');
  const imgRef = useRef<any>(null); // the <img> (screenshot fallback) or the <canvas> (live stream)
  const [live, setLive] = useState<'try' | 'on' | 'off'>(canLiveStream() ? 'try' : 'off');
  useEffect(() => { setLive(canLiveStream() ? 'try' : 'off'); }, [serial]);

  const [wakeNote, setWakeNote] = useState('');
  useEffect(() => { // a sleeping phone sends no picture at all: turn it on first
    if (!connected || isWeb) return;
    let dead = false;
    fetch('/api/device/tool/wake_screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial }) })
      .then(r => r.json()).then(j => { if (!dead) setWakeNote(j.ok && j.locked ? 'The phone is locked. Unlock it to see its screen.' : ''); }).catch(() => {});
    return () => { dead = true; };
  }, [connected, serial, isWeb]);

  // The live stream waits for the real screen size (otherwise it starts, then restarts when the size arrives = the phone appears late)
  const [devKnown, setDevKnown] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!connected) { setDevKnown(false); return; }
    let dead = false;
    const giveUp = setTimeout(() => { if (!dead) setDevKnown(true); }, 2500); // never block the picture on a slow answer
    fetch('/api/device/tool/device_info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial }) })
      .then(r => r.json()).then(j => { if (!dead && j.ok && j.screen) setDev({ w: j.screen.w, h: j.screen.h }); if (!dead && j.ok) setDevName([j.model, j.androidVersion || j.release ? 'Android ' + (j.androidVersion || j.release) : ''].filter(Boolean).join(' · ')); }).catch(() => {})
      .finally(() => { if (!dead) setDevKnown(true); });
    return () => { dead = true; clearTimeout(giveUp); };
  }, [connected, serial, refreshKey]);
  const refreshScreen = () => { setShot(''); setSlow(false); setDevKnown(false); setLive(canLiveStream() ? 'try' : 'off'); setRefreshKey(k => k + 1); };
  useEffect(() => { // "taking longer than usual" hint while there is still no picture
    setSlow(false);
    if (!connected || isWeb || shot || live === 'on') return;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [connected, isWeb, shot ? 1 : 0, live, refreshKey]);

  useEffect(() => {
    if (!connected || !active || isWeb || live === 'on') { if (!connected || !active || isWeb) setShot(''); return; } // a playing live stream replaces screenshot polling; while it is still starting, a screenshot is shown so the phone never looks empty
    let stop = false; let last = ''; let first = true;
    (async () => {
      while (!stop) {
        try {
          // the very first picture is small so it arrives fast; sharp ones follow
          const r = await fetch(`/api/device/screenshot.png?serial=${encodeURIComponent(serial)}&maxDim=${first ? 480 : 900}&t=${Date.now()}`);
          if (r.ok) { const u = URL.createObjectURL(await r.blob()); setShot(u); if (last) URL.revokeObjectURL(last); last = u; first = false; }
        } catch (e) {}
        await new Promise(r => setTimeout(r, first ? 300 : busy ? 700 : 1500));
      }
      if (last) URL.revokeObjectURL(last);
    })();
    return () => { stop = true; };
  }, [connected, serial, busy, active, isWeb, live, refreshKey]);

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
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    down.current = { ...toDevice(e.clientX, e.clientY), t: Date.now() };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
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
  }, [connected, isWeb, dev.w, dev.h, shot ? 1 : 0, live]);
  const phoneBtn = (key: string) => callTool('key', { key });

  // ---------- chat ----------
  const send = useCallback(async (override?: string, alreadyShown?: boolean) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    // A bare "start" / "hi" tells the AI nothing: open the test brief instead of guessing (also saves tokens)
    if (!testMode && !msgs.some(m => m.kind === 'user') && (/^(start|begin|go|run|test|testing|start test(ing)?|let'?s (go|start|test)|hi+|hello|hey|ok(ay)?|yes|ready)[.! ]*$/i.test(text) || (text.split(/\s+/).length <= 2 && !/[./:]/.test(text)))) {
      setInput(''); setTestMode(true);
      setMsgs(m => [...m, { kind: 'info', text: 'To start testing I need a few details first: product, feature/module, ' + (isWeb ? 'URL' : 'app') + ', test cases and any login. Fill the test brief and press Start test.' }]);
      return;
    }
    if (engine === 'none') {
      setMsgs(m => [...m, { kind: 'user', text }, mcpLive.connected
        ? { kind: 'info', text: 'Your connected AI (' + (mcpLive.clients[0] || 'MCP') + ') controls the ' + (isWeb ? 'browser' : 'phone') + ' directly, so give it the instruction in its own window. To chat here too, press Connect and sign in.' }
        : { kind: 'info', text: 'Not connected yet. Pick one of the three options below, then send again.' }]);
      setInput(''); setShowConnect(true);
      return;
    }
    setInput('');
    if (!alreadyShown) setMsgs(m => [...m, { kind: 'user', text }]);
    if (!isWeb && !deviceSerial && emu.phase === 'installing') {
      setMsgs(m => [...m, { kind: 'info', text: 'The emulator is still installing or repairing itself. Send again when it finishes.' }]);
      return;
    }
    if (!connected && !isWeb) {
      // Emulator is off: ask in chat instead of failing
      setMsgs(m => [...m, { kind: 'startPrompt', pending: text, state: emu.phase === 'booting' ? 'starting' : 'ask' }]);
      if (emu.phase === 'booting') setPending(text);
      return;
    }
    let tm = testRunRef.current; testRunRef.current = null;
    // Every message of a test chat (a "continue" after a stop or a block, an answer to the AI) goes on with the same report.
    if (!tm && testInfoRef.current) { const t = testInfoRef.current; const logins = t.projectId ? await loadSecret(loginSecretName(t.projectId)).catch(() => '') : ''; tm = { title: t.title, summary: t.summary, projectId: t.projectId, logins }; }
    if (tm) runPidRef.current = tm.projectId || '';
    lastSentRef.current = text;
    setInterrupted(false);
    setBusy(true);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({
          sessionId: sessionId.current, world, engine, ...(engine === 'api' ? { apiKey } : {}), model, serial, mode,
          message: text,
          ...(tm ? { testMode: { title: tm.title, summary: tm.summary, projectId: tm.projectId, logins: tm.logins, attachments: files.map(f => ({ name: f.name })) } } : {})
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
    } finally {
      setBusy(false); abortRef.current = null;
      // A stop (or a dropped connection) closes the stream before the server says "report ready": show the saved report anyway.
      const rid = runIdRef.current;
      if (rid) setTimeout(async () => {
        try {
          if (msgsRef.current.some(m => m.kind === 'report' && m.runId === rid)) return;
          const r = ((await (await fetch('/api/agent/reports')).json()).runs || []).find((x: any) => x.id === rid);
          if (r && r.total > 0 && r.status !== 'running') setMsgs(m => m.some(x => x.kind === 'report' && x.runId === rid) ? m : [...m, { kind: 'report', runId: rid, status: r.status, projectId: runPidRef.current }]);
        } catch (e) {}
      }, 1500);
    }
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
    else if (ev.type === 'check') setMsgs(m => { const i = ev.check.id ? m.findIndex(x => x.kind === 'check' && x.id === ev.check.id) : -1; return i >= 0 ? m.map((x, k) => k === i ? { kind: 'check', ...ev.check } : x) : [...m, { kind: 'check', ...ev.check }]; }); // a corrected case replaces the earlier one
    else if (ev.type === 'progress') setProgress({ done: ev.done, total: ev.total, pass: ev.pass, fail: ev.fail, blocked: ev.blocked });
    else if (ev.type === 'phase') { setPhaseNow(ev.phase === 'browser' ? 'browser' : 'app'); setMsgs(m => [...m, { kind: 'phase', phase: ev.phase, text: ev.text }]); }
    else if (ev.type === 'run_started') { runIdRef.current = ev.runId || null; setPhaseNow('app'); }
    else if (ev.type === 'report_ready') { setMsgs(m => [...m.filter(x => !(x.kind === 'report' && x.runId === ev.runId)), { kind: 'report', runId: ev.runId, status: ev.status, projectId: runPidRef.current, savedTo: ev.savedTo }]); if (showReportsRef.current) loadRuns(); }
    else if (ev.type === 'no_report') setMsgs(m => [...m, { kind: 'info', text: 'No test case was executed, so no report was created.' }]);
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
  const persist = (status: 'running' | 'idle', id = sessionId.current) => {
    const ms = msgsRef.current; const first: any = ms.find(m => m.kind === 'user'); if (!first) return;
    const title = testInfoRef.current?.title ? 'Test: ' + testInfoRef.current.title : String(first.text).split('\n')[0].slice(0, 80);
    return fetch('/api/agent/chats/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ world, status, title, model, tokens: tokensRef.current, test: testInfoRef.current, msgs: ms }) }).catch(() => {});
  };
  msgsRef.current = msgs; tokensRef.current = tokens;
  useEffect(() => { // autosave (a chat marked "running" that is not live any more is what we call interrupted)
    const t = setTimeout(() => { persist(busy || interrupted ? 'running' : 'idle'); }, busy ? 700 : 150);
    return () => clearTimeout(t);
  }, [msgs, busy, interrupted]);
  const reset = () => {
    persist('idle'); // the old chat stays in History
    stop();
    fetch('/api/agent/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId.current }) });
    sessionId.current = 'sf-' + Math.random().toString(36).slice(2, 10);
    testRunRef.current = null; testInfoRef.current = null; setStep(0); setShowErrors(false); setInterrupted(false); setShowHistory(false); setMsgs([]); setProgress(null); setPhaseNow('app'); setTokens({ input: 0, output: 0, cached: 0 });
  };
  const loadChat = async (id: string) => {
    if (id === sessionId.current) { setShowHistory(false); return; }
    try {
      const j = await (await fetch('/api/agent/chats/' + id)).json(); if (!j.success) return;
      const c = j.chat;
      if (busy) { persist('running'); stop(); } else persist(interrupted ? 'running' : 'idle'); // switching away from a live test leaves it resumable
      sessionId.current = c.id; testRunRef.current = null; testInfoRef.current = c.test || null;
      const fixed: Msg[] = (c.msgs || []).map((m: Msg) => m.kind === 'tool' && m.state === 'running' ? { ...m, state: 'error', summary: 'interrupted' } : m.kind === 'startPrompt' ? { ...m, state: 'cancelled' } : m.kind === 'approval' && !m.answered ? { ...m, answered: 'denied' } : m);
      setMsgs(fixed); setTokens(c.tokens || { input: 0, output: 0, cached: 0 });
      setInterrupted(c.status === 'running'); setShowHistory(false);
    } catch (e) {}
  };
  const renameChat = async (id: string, title: string) => { await fetch('/api/agent/chats/' + id + '/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).catch(() => {}); loadChats(); };
  const continueChat = async (id: string, wasInterrupted: boolean) => { await loadChat(id); if (wasInterrupted) setTimeout(() => resumeTest(), 150); };
  const deleteChat = async (id: string) => { await fetch('/api/agent/chats/' + id, { method: 'DELETE' }).catch(() => {}); if (id === sessionId.current) reset(); loadChats(); };
  useEffect(() => { // on start, bring back the last chat exactly as it was
    fetch('/api/agent/chats?world=' + world).then(r => r.json()).then(j => {
      const last = (j.chats || [])[0];
      if (last && !prefilledRef.current && !msgsRef.current.length && Date.now() - last.updatedAt < 14 * 86400000) loadChat(last.id);
    }).catch(() => {});
  }, []);
  const resumeTest = async () => {
    if (busy) return;
    const ms = msgsRef.current; const t = testInfoRef.current;
    const done = ms.filter(m => m.kind === 'check') as any[];
    const doneTxt = done.map(c => '- ' + (c.id ? c.id + ' ' : '') + c.title + ': ' + String(c.status).toUpperCase()).join('\n');
    let full: string;
    if (t) {
      full = t.full + '\n\n---\nRESUME: this test run was interrupted (the app closed or the connection dropped). These cases were ALREADY executed and recorded, do not repeat them:\n' + (doneTxt || '(none yet)') + '\n\nContinue with the remaining test cases only and record every result as usual.';
      const logins = t.projectId ? await loadSecret(loginSecretName(t.projectId)).catch(() => '') : '';
      testRunRef.current = { title: t.title + ' (resumed)', summary: t.summary, projectId: t.projectId, logins };
    } else {
      const lastUser: any = [...ms].reverse().find(m => m.kind === 'user');
      full = 'The previous run was interrupted. Continue the task from where it stopped; do not redo finished steps. The task was: ' + (lastUser?.text || '');
    }
    setMsgs(m => [...m, { kind: 'info', text: 'Resuming' + (done.length ? ' after ' + done.length + ' finished case' + (done.length > 1 ? 's' : '') : '') + '…' }, { kind: 'user', text: 'Resume' + (t ? ': ' + t.title : '') }]);
    setInterrupted(false);
    send(full, true);
  };
  const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  // ---------- Test mode: nothing starts until the brief is filled ----------
  const hasSentAny = msgs.some(m => m.kind === 'user');
  const formMode = testMode && !hasSentAny;
  const missing = briefMissing(brief, files, isWeb);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const stepMissing = missing.filter(l => stepOfMissing(l) === step);
  const goNext = () => { if (stepMissing.length) { setShowErrors(true); return; } setShowErrors(false); setStep(x => Math.min(STEPS.length - 1, x + 1)); };
  const tryStart = () => { if (missing.length) { setShowErrors(true); setStep(Math.min(...missing.map(stepOfMissing))); return; } startTest(); };
  useEffect(() => { if (formMode && active) loadProjects(); }, [formMode, active]);
  const pickProject = async (id: string) => {
    setProjectId(id);
    if (!id) { setProjectData(null); setBrief(EMPTY_BRIEF); setFiles([]); return; }
    const p = await loadProject(id); if (!p) return;
    const only = p.modules.length === 1 ? p.modules[0] : null;
    setBrief({ persona: brief.persona, product: p.name, module: only?.name || '', target: (isWeb ? p.targets.web : p.targets.app) || '', login: await loadSecret(loginSecretName(id)), notes: p.notes || '', cases: only?.cases || '' });
    setFiles([...p.docs.map((d: any) => ({ ...d, kind: 'docs' as const })), ...(only?.files || []).map((d: any) => ({ ...d, kind: 'cases' as const }))]);
  };
  const onModule = (name: string) => {
    const m = projectData?.modules?.find((x: any) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (!m) return;
    setBrief({ ...brief, module: m.name, cases: m.cases || '' });
    setFiles(x => [...x.filter(f => f.kind === 'docs'), ...(m.files || []).map((d: any) => ({ ...d, kind: 'cases' as const }))]);
  };
  // saved files of the chosen project / module: tick the ones this test should use
  const savedDocs: { name: string; text: string }[] = projectData?.docs || [];
  const savedCaseFiles: { name: string; text: string }[] = (projectData?.modules || []).find((m: any) => m.name.toLowerCase() === brief.module.trim().toLowerCase())?.files || [];
  const toggleFile = (name: string, kind: 'cases' | 'docs', on: boolean) => {
    if (!on) { setFiles(x => x.filter(f => !(f.name === name && f.kind === kind))); return; }
    const src = (kind === 'docs' ? savedDocs : savedCaseFiles).find(d => d.name === name);
    if (src) setFiles(x => [...x.filter(f => !(f.name === name && f.kind === kind)), { ...src, kind }]);
  };
  const saveContext = async (text: string) => { if (!projectId) return; await fetch('/api/projects/' + projectId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: text }) }).catch(() => {}); await loadProject(projectId); };
  const startTest = async () => {
    if (missing.length) return;
    // save (or create) the project first: brief, cases and documents are kept for next time; the login goes to the encrypted store
    let pid = projectId, history = '', context = '';
    try {
      const j = await (await fetch('/api/projects/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, world: isWeb ? 'web' : 'phone', brief: { ...brief, login: undefined }, files }) })).json();
      if (j.success) { pid = j.projectId; history = j.history || ''; context = j.context || ''; setProjectId(pid); setProjectData(j.project); if (cleanLogin(brief.login)) saveSecret(loginSecretName(pid), cleanLogin(brief.login)); else if (projectId) { /* keep the saved login */ } }
    } catch (e) {}
    const c = composeBrief(brief, files, isWeb, history, context);
    testRunRef.current = { title: c.title, summary: c.summary, projectId: pid, logins: cleanLogin(brief.login) };
    testInfoRef.current = { title: c.title, summary: c.summary, projectId: pid, full: c.full, target: brief.target.trim() }; // saved with the chat so an interrupted test can resume (login is never saved)
    setMsgs(m => [...m, { kind: 'user', text: 'Test: ' + c.title + '\n' + brief.target.trim() }]);
    send(c.full, true);
  };

  // ---------- avatar guides: what to do next, until the task is done ----------
  const [webSt, setWebSt] = useState<any>(null);
  useEffect(() => {
    if (!isWeb || !active) return;
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/web/status')).json(); if (!stop) setWebSt(j); } catch (e) {} if (!stop) setTimeout(tick, 2500); };
    tick();
    return () => { stop = true; };
  }, [isWeb, active]);
  const hasSent = msgs.some(m => m.kind === 'user');
  const ready = engine !== 'none' || mcpLive.connected;
  const reveal = () => { setChatHidden(false); setShowHistory(false); setShowSettings(false); };
  const askStep = { title: 'Tell the agent what to test', mood: 'listening' as const, target: 'chat-input', onEnter: reveal, done: hasSent,
    body: <>Type it in the chat on the left, for example <i>{isWeb ? '"Open example.com and check the heading"' : '"Open Settings and tell me the Android version"'}</i>. For a proper test with a PDF/DOCX report, turn on <b>Test mode</b> and fill the test brief.</> };
  const guides: CoachGuide[] = [
    { id: 'ai', label: '1. Connect the AI', hint: 'One-time setup so the AI can work for you', enabled: !cli.loading, doneTitle: 'AI connected', doneBody: 'Now type what you want to test in the chat and press Enter.',
      steps: [
        { title: 'Get Claude on this PC', mood: 'working', target: 'connect', onEnter: reveal, done: cli.installed || ready,
          body: 'The AI agent runs through Claude Code in the background. Press Install and wait about a minute. It downloads and sets itself up, no admin needed.',
          action: { label: cli.installing ? (cli.stage || 'Installing…') : 'Install Claude', onClick: () => installClaude(), busy: !!cli.installing }, error: cli.error,
          note: <>Prefer an API key or your own terminal? <a href="#" onClick={e => { e.preventDefault(); setShowConnect(true); }}>See the other options</a>.</> },
        { title: 'Sign in with your Claude account', mood: 'listening', target: 'connect', onEnter: reveal, done: cli.loggedIn || ready,
          body: 'A browser tab opens. Sign in there and come back. This card moves on by itself.',
          action: { label: 'Sign in with Claude', onClick: () => { startClaudeSignIn(); } },
          note: <>Or <a href="#" onClick={e => { e.preventDefault(); setShowConnect(true); }}>use an API key / MCP</a> instead.</> }
      ] },
    isWeb
      ? { id: 'web', label: '2. Set up the browser', hint: 'Install and open Chrome, log in if needed', enabled: webSt !== null, doneTitle: 'First web test is running', doneBody: 'Results show in the chat. Open the report icon for PDF/DOCX reports with screenshots.',
          steps: [
            { title: 'Get a browser', mood: 'working', target: 'web-install', onEnter: reveal, done: !!webSt?.installed, body: 'Web testing drives your own Google Chrome. I could not find Chrome or Edge, so I can download Chrome for you.',
              action: { label: webSt?.isInstalling ? (webSt.stage || 'Installing…') : 'Install Chrome', onClick: () => fetch('/api/web/install', { method: 'POST' }), busy: !!webSt?.isInstalling }, error: webSt?.error },
            { title: 'Open the browser', mood: 'happy', target: 'web-url', onEnter: reveal, done: !!webSt?.open, body: 'Press Open Chrome. Your own Chrome opens in its own window and shows up here too.',
              action: { label: 'Open Chrome', onClick: async () => { await fetch('/api/web/tool/web_navigate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://www.google.com' }) }); } } },
            { title: 'Log in if your site needs it', mood: 'thinking', target: 'web-url', onEnter: reveal, body: 'If your site has a login or a bot check, do it yourself once in the Chrome window. It is remembered, so the agent can continue without you.' },
            askStep
          ] }
      : { id: 'emu', label: '2. Set up the phone', hint: 'Install and power on the Android emulator', enabled: emu.reachable !== false, doneTitle: 'Emulator ready', doneBody: 'Results show in the chat. Open the report icon for PDF/DOCX reports with screenshots.',
          steps: [
            { title: 'Install the emulator', mood: 'working', target: 'emu-install', onEnter: reveal, done: emu.phase !== 'not_installed' && emu.phase !== 'installing', body: 'One-time download of the Android emulator (about 5 GB). It is only installed because you opened this page.' + (emu.phase === 'installing' ? ' ' + Math.round(emu.status.installProgress || 0) + '% ' + (emu.status.installStage || '') : ''),
              action: { label: emu.phase === 'installing' ? 'Installing…' : 'Install emulator', onClick: () => emu.install(), busy: emu.phase === 'installing' || emu.busy }, error: emu.status.installError },
            { title: 'Power on the phone', mood: 'happy', target: 'emu-power', onEnter: reveal, done: connected, body: 'The first start takes 1 to 2 minutes, later starts are much faster.',
              action: { label: emu.phase === 'booting' ? 'Starting…' : 'Power on', onClick: () => { startEmulator(emu); }, busy: emu.phase === 'booting' || emu.busy } },
            askStep
          ] }
  ];


  const howTo: CoachGuide = { id: 'howto', tourOnly: true, label: '3. How to run a test', hint: 'From your test cases to a PDF report, in 5 steps', doneTitle: 'Done', doneBody: '',
    steps: [
      { title: 'Turn on Test mode', mood: 'happy', target: 'test-mode', onEnter: () => { reveal(); setTestMode(false); }, body: <>Press the <b>Test mode</b> button at the top of the chat. A form called <i>New test</i> opens.</>, action: { label: 'Turn on Test mode', onClick: () => { setTestMode(true); } } },
      { title: 'Say what you are testing', mood: 'listening', target: 'form-steps', onEnter: () => { reveal(); setTestMode(true); setStep(0); }, body: <>Pick or type the <b>project name</b>, the <b>feature</b> (for example Login) and the {isWeb ? <b>website address</b> : <b>app</b>}. Then press <b>Next</b> at the bottom of the form.</> },
      { title: 'Write or upload test cases', mood: 'thinking', target: 'cases-box', onEnter: () => { reveal(); setTestMode(true); setStep(1); }, body: <>Write each test case like <i>"Wrong password shows an error"</i> with the steps, or press <b>Upload file</b> to add a Word or text file. No technical words needed.</> },
      { title: 'Press Start and watch', mood: 'working', target: 'start-test', onEnter: () => { reveal(); setTestMode(true); setStep(2); }, body: <>The AI does the steps for you. You see it live {isWeb ? 'in the browser' : 'on the phone'}. A green or red line appears for each test case.</> },
      { title: 'Get your report, or continue later', mood: 'celebrate', target: 'history', onEnter: reveal, body: <>When it ends you get a <b>PDF/DOCX report</b> with screenshots. If the app closes in the middle, open <b>History</b> and press <b>Resume test</b>. Nothing is lost.</> }
    ] };

  return (
    <div style={{ display: active ? 'flex' : 'none', gap: 0, flex: 1, minHeight: 0, position: 'relative' }}>
      {/* ---------- left: chat ---------- */}
      <div style={{ flex: '0 0 clamp(400px, 42%, 720px)', minWidth: 0, display: chatHidden ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: border, background: 'var(--bg-card, transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '10px 12px 8px', position: 'relative' }}>
          <button data-guide="history" onClick={() => setShowHistory(v => !v)} title="Chat history" style={{ ...ghostBtn, ...(showHistory ? { background: 'rgba(120,120,128,0.14)', color: 'var(--text-main, #0f172a)' } : {}) }}><History size={15} /> History</button>
          <button data-guide="new-chat" onClick={reset} title="Start a new chat (the old one stays in History)" style={ghostBtn}><Plus size={15} /> New</button>
          <span style={{ flex: 1, textAlign: 'right', fontSize: 11, color: 'var(--text-muted, #64748b)', paddingRight: 6 }}>
            {engine !== 'none' && (tokens.input || tokens.output) ? `${fmt(tokens.input)} in · ${fmt(tokens.output)} out` : ''}
          </span>
          <button data-guide="test-mode" onClick={() => setTestMode(t => !t)} title="Test mode: the AI works through your test cases and writes a report with screenshots"
            style={{ ...ghostBtn, fontWeight: 600, ...(testMode ? { background: 'rgba(79,70,229,0.12)', color: '#4f46e5' } : {}) }}><FlaskConical size={15} /> Test mode</button>
          <button data-guide="connect" onClick={() => setShowSettings(v => !v)} title="More" style={{ ...ghostBtn, position: 'relative', padding: '6px 7px' }}><MoreHorizontal size={17} />{engine === 'claude' && <span style={{ position: 'absolute', top: 4, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />}</button>
          {showSettings && <>
            <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
            <div style={{ position: 'absolute', right: 12, top: 'calc(100% - 2px)', zIndex: 20, ...card, padding: 6, width: 264, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column', fontSize: 13 }}>
              <button onClick={() => { setShowReports(v => !v); setShowSettings(false); }} style={menuItem}><FileText size={15} /> Saved reports</button>
              <button onClick={() => { setShowConnect(v => !v); setShowSettings(false); }} style={menuItem}><Plug size={15} /> Connect the AI{engine === 'claude' && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#16a34a' }}>● Claude Code</span>}</button>
              <div style={{ height: 1, background: 'rgba(120,120,128,0.18)', margin: '4px 6px' }} />
              <label style={{ ...menuItem, flexDirection: 'column', alignItems: 'stretch', gap: 4, cursor: 'default' }}><span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>AI model</span>
                <select value={model} onChange={e => setModel(e.target.value)} style={menuSelect}>
                  {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select></label>
              <label style={{ ...menuItem, flexDirection: 'column', alignItems: 'stretch', gap: 4, cursor: 'default' }}><span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>Risky actions (shell, uninstall, clear data)</span>
                <select value={mode} onChange={e => setMode(e.target.value as any)} style={menuSelect}>
                  <option value="ask">Ask me first (safer)</option>
                  <option value="auto">Do it automatically</option>
                </select></label>
              <div style={{ height: 1, background: 'rgba(120,120,128,0.18)', margin: '4px 6px' }} />
              <button onClick={() => { setChatHidden(true); setShowSettings(false); }} style={menuItem}><PanelLeftClose size={15} /> Hide chat</button>
            </div>
          </>}
        </div>

        {showHistory && <HistoryPanel chats={curProjectRef.current ? chats.filter(c => !c.projectId || c.projectId === curProjectRef.current || c.id === sessionId.current) : chats} currentId={sessionId.current} liveId={busy ? sessionId.current : null} onOpen={loadChat} onContinue={continueChat} onRename={renameChat} onDelete={deleteChat} onNew={reset} onClose={() => setShowHistory(false)} />}
        {(() => {
          const cks = msgs.filter(m => m.kind === 'check') as any[]; if (!cks.length && !(busy && testInfoRef.current)) return null;
          const p = cks.filter(c => c.status === 'pass').length, f = cks.filter(c => c.status === 'fail').length, o = cks.length - p - f;
          const tl = [...msgs].reverse().find(m => m.kind === 'tool') as any;
          const roleNow = [...cks].reverse().find(c => c.persona)?.persona || brief.persona.trim();
          const roleAuto = !brief.persona.trim();
          return <div style={{ padding: '6px 16px 8px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', color: 'var(--text-muted, #64748b)' }}>
            {busy && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706' }} />}
            <b style={{ color: 'var(--text-main, #0f172a)' }}>{busy ? 'Testing' : 'Results'}</b>
            {(() => { const tot = Math.max(progress?.total || 0, cks.length), dn = cks.length; return tot > 0 ? <span title={`${dn} of ${tot} test cases done`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <b style={{ color: 'var(--text-main, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>{dn}/{tot} done</b>{busy && dn < tot && <span style={{ color: '#d97706', fontWeight: 600 }}>· testing case {dn + 1}</span>}<b style={{ display: 'none' }} />
              <span style={{ width: 90, height: 6, borderRadius: 3, background: 'rgba(120,120,128,0.2)', overflow: 'hidden', display: 'inline-flex' }}>
                <span style={{ width: (p / tot * 100) + '%', background: '#16a34a', transition: 'width .4s' }} /><span style={{ width: (f / tot * 100) + '%', background: '#dc2626', transition: 'width .4s' }} /><span style={{ width: (o / tot * 100) + '%', background: '#d97706', transition: 'width .4s' }} />
              </span></span> : null; })()}
            <span style={{ color: '#16a34a', fontWeight: 700 }}>{p} pass</span><span style={{ color: f ? '#dc2626' : undefined, fontWeight: 700 }}>{f} fail</span><span style={{ color: o ? '#d97706' : undefined, fontWeight: o ? 700 : 400 }}>{o} blocked</span>
            {busy && phaseNow === 'browser' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(14,165,233,0.12)', color: '#0284c7', borderRadius: 999, padding: '1px 9px', fontWeight: 600 }}><Globe size={11} /> Browser check</span>}
            {(roleNow || roleAuto) && <span title={roleAuto ? 'Role picked automatically by the AI from your brief' : 'Role you chose in the test brief'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(79,70,229,0.08)', color: '#4f46e5', borderRadius: 999, padding: '1px 9px', fontWeight: 600 }}><User size={11} /> {roleNow ? roleNow : 'Auto'}{roleAuto && roleNow ? ' (auto)' : ''}</span>}
            {busy && tl && <span style={{ marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>{tl.name}</span>}
          </div>;
        })()}

        {showReports && (
          <div style={{ padding: '10px 16px', borderTop: border, borderBottom: border, fontSize: 12, maxHeight: 190, overflowY: 'auto' }}>
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

        {showHistory ? null : formMode ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 18px 14px' }}><TestBrief serial={isWeb ? undefined : (connected ? serial : undefined)} projects={projects} projectId={projectId} onPickProject={pickProject} modules={(projectData?.modules || []).map((m: any) => m.name)} onModule={onModule} isWeb={isWeb} brief={brief} setBrief={setBrief} files={files} addFiles={addFiles} removeFile={i => setFiles(x => x.filter((_, j) => j !== i))} step={step} setStep={n => { setStep(n); setShowErrors(false); }} showErrors={showErrors} projectContext={projectData?.context || ''} projectMemory={projectData?.contextData} onSaveContext={saveContext} savedDocs={savedDocs} savedCaseFiles={savedCaseFiles} toggleFile={toggleFile} /></div>
        ) : (
        <div ref={listRef} onScroll={onListScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13, maxWidth: 340, lineHeight: 1.6 }}>
              {connected || isWeb ? 'Tell the agent what to test. For example:' : 'The emulator is off. Power it on from the phone on the right, or just send an instruction and I will ask.'}
              {(connected || isWeb) && <div style={{ marginTop: 8, fontStyle: 'italic' }}>{isWeb ? '"Open example.com, click Learn more and tell me the page title"' : '"Open Settings, search for Wi-Fi and tell me what you see"'}</div>}
            </div>
          )}
          {(() => {
            const out: React.ReactNode[] = []; let i = 0;
            const lastErr = msgs.map(m => m.kind).lastIndexOf('error');
            while (i < msgs.length) {
              const m = msgs[i];
              if (m.kind === 'tool') { const g: any[] = []; const s = i; while (i < msgs.length && msgs[i].kind === 'tool') g.push(msgs[i++]); out.push(<ToolGroup key={'g' + s} tools={g} />); continue; }
              const idx = i;
              out.push(<Bubble key={i} m={m} onAnswer={answer} onStart={() => m.kind === 'startPrompt' && startFromChat(idx, m.pending)} onCancelStart={() => cancelStart(idx)}
                onQuick={t => send(t)} onRetry={idx === lastErr && lastSentRef.current && !busy ? () => send(lastSentRef.current, true) : undefined} />);
              i++;
            }
            return out;
          })()}
          {busy && (() => { const rt: any = [...msgs].reverse().find(x => x.kind === 'tool' && x.state === 'running'); return <div style={{ fontSize: 12.5, color: 'var(--text-muted, #64748b)' }}>{rt ? humanStep(rt.name, rt.input) : 'Working'}…</div>; })()}
        </div>
        )}
        {showLatest && !formMode && !showHistory && <button onClick={toLatest} style={{ alignSelf: 'center', marginTop: -44, marginBottom: 14, zIndex: 5, border, background: 'var(--bg-card, #fff)', color: 'var(--text-main, #0f172a)', borderRadius: 999, padding: '5px 12px', fontSize: 12, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><ArrowDown size={13} /> Latest</button>}

        {!showHistory && showConnect && (
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
        {!showHistory && interrupted && !busy && !formMode && <ResumeBanner done={msgs.filter(m => m.kind === 'check').length} onResume={resumeTest} onDismiss={() => setInterrupted(false)} />}
        {showHistory ? null : formMode ? <StartBar step={step} onBack={() => { setShowErrors(false); setStep(x => Math.max(0, x - 1)); }} onNext={goNext} onStart={tryStart} hint={showErrors && (step === STEPS.length - 1 ? missing : stepMissing).length ? 'Needs ' + (step === STEPS.length - 1 ? missing : stepMissing).join(', ') : step === STEPS.length - 1 ? (missing.length ? 'Not complete yet' : 'Ready') : 'Step ' + (step + 1) + ' of ' + STEPS.length} hintBad={showErrors && (step === STEPS.length - 1 ? missing : stepMissing).length > 0} /> : (
        <div style={{ padding: '6px 14px 14px' }}>
          <div style={{ border, borderRadius: 18, background: 'var(--bg-card, #fff)', padding: '10px 10px 8px 14px', display: 'flex', alignItems: 'flex-end', gap: 8, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
            <textarea data-guide="chat-input" value={input} onChange={e => setInput(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Tell the agent what to test…"
              style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', color: 'var(--text-main, #0f172a)', padding: 0 }} />
            {busy
              ? <button onClick={stop} title="Stop" style={{ ...sendBtn, background: '#dc2626' }}><Square size={13} fill="currentColor" /></button>
              : <button onClick={() => send()} disabled={!input.trim()} title="Send (Enter)" style={{ ...sendBtn, opacity: input.trim() ? 1 : 0.35 }}><ArrowUp size={16} /></button>}
          </div>
        </div>
        )}
      </div>

      {chatHidden && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: '12px 8px' }}>
          <button onClick={() => setChatHidden(false)} title="Show chat" style={{ ...iconBtn, padding: '10px 8px' }}><PanelLeftOpen size={16} /></button>
        </div>
      )}
      {chatHidden && (() => {
        const line = liveLine(msgs, busy);
        const cks = msgs.filter(m => m.kind === 'check') as any[];
        const p = cks.filter(c => c.status === 'pass').length, f = cks.filter(c => c.status === 'fail').length;
        return (
          <div onClick={() => setChatHidden(false)} title="Open the chat" style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 30, maxWidth: 'min(560px, 86%)', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', background: 'rgba(24,24,32,0.88)', color: '#f1f5f9', backdropFilter: 'blur(10px)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12.5 }}>
            <style>{'@keyframes sfIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@keyframes sfBlink{50%{opacity:.35}}'}</style>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: busy ? '#f59e0b' : '#22c55e', animation: busy ? 'sfBlink 1.1s ease-in-out infinite' : 'none' }} />
            <span key={line} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', animation: 'sfIn .25s ease-out', minWidth: 0 }}>{line}</span>
            {cks.length > 0 && <span style={{ flexShrink: 0, opacity: 0.95, fontWeight: 700 }}>{cks.length}/{Math.max(progress?.total || 0, cks.length)} · <span style={{ color: '#4ade80' }}>{p}</span> / <span style={{ color: f ? '#f87171' : '#94a3b8' }}>{f}</span></span>}
            <PanelLeftOpen size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
          </div>
        );
      })()}
      {/* ---------- right: phone / browser ---------- */}
      {isWeb && <WebPane active={active} serial={serial} busy={busy} />}
      <div style={{ display: isWeb ? 'none' : 'flex', flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 12, padding: '16px 20px' }}>
        <div style={{ minHeight: 0, height: '100%', display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        {/* premium phone: titanium frame, black bezel, dynamic island, side buttons (all sizes scale with the phone width) */}
        <div style={{ height: '100%', maxHeight: 1100, alignSelf: 'center', aspectRatio: '9 / 19.5', maxWidth: '100%', minWidth: 0, minHeight: 0, position: 'relative', containerType: 'inline-size' as any, filter: 'drop-shadow(0 22px 34px rgba(15,23,42,0.32))' }}>
          {[[16, 6], [25, 11], [38, 11]].map(([top, h], i) => <span key={'l' + i} style={{ position: 'absolute', left: '-0.9cqw', top: top + '%', width: '1.2cqw', height: h + '%', maxHeight: '11%', borderRadius: '0.6cqw 0 0 0.6cqw', background: 'linear-gradient(90deg,#8d8f94,#c9cbd0 60%,#9a9ca1)' } as any} />)}
          <span style={{ position: 'absolute', right: '-0.9cqw', top: '30%', width: '1.2cqw', height: '14%', borderRadius: '0 0.6cqw 0.6cqw 0', background: 'linear-gradient(270deg,#8d8f94,#c9cbd0 60%,#9a9ca1)' } as any} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '17cqw', background: 'linear-gradient(145deg,#e4e5e8 0%,#9b9da3 22%,#d9dadd 48%,#85878d 74%,#c4c5c9 100%)', padding: '1cqw', boxSizing: 'border-box' } as any}>
            <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '16cqw', background: '#050506', padding: '1.7cqw', boxSizing: 'border-box', boxShadow: 'inset 0 0 0 0.35cqw #1a1a1c' } as any}>
              <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '14.3cqw', overflow: 'hidden', background: '#0b1020', display: 'flex', alignItems: 'center', justifyContent: 'center' } as any}>
          {connected && active && !isWeb && live !== 'off' && (
            <LiveScreen key={serial + ':' + refreshKey} paused={!devKnown} serial={serial} w={dev.w} h={dev.h} canvasRef={imgRef} onPlaying={() => setLive('on')} onFail={() => setLive('off')} onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ position: 'absolute', inset: 0, opacity: live === 'on' ? 1 : 0 }} />
          )}
          {live === 'on' ? null : shot
            ? <img ref={imgRef} src={shot} onPointerDown={onPointerDown} onPointerUp={onPointerUp} alt="Device screen" draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer', display: 'block', touchAction: 'none', userSelect: 'none' }} />
            : connected
              ? <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, padding: 20, textAlign: 'center' }}>
                  <style>{'@keyframes sfspin{to{transform:rotate(360deg)}}'}</style>
                  <span style={{ width: 26, height: 26, border: '3px solid rgba(148,163,184,0.3)', borderTopColor: '#818cf8', borderRadius: '50%', animation: 'sfspin 0.9s linear infinite' }} />
                  <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{wakeNote ? 'Phone is locked' : devKnown ? 'Waiting for the first picture…' : 'Connecting to the phone…'}</div>
                  <div>{wakeNote || (slow ? 'This is taking longer than usual. Press Refresh, or check the phone is awake and USB debugging is allowed.' : 'This usually takes a few seconds.')}</div>
                  <button onClick={refreshScreen} style={{ ...iconBtn, padding: '6px 14px', fontSize: 12, marginTop: 2 }}><RotateCcw size={12} /> Refresh</button>
                </div>
              : <PowerPanel emu={emu} dark />}
                {connected && (live === 'on' || shot) && <span style={{ position: 'absolute', bottom: '3.5cqw', left: '50%', transform: 'translateX(-50%)', maxWidth: '86%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none', fontSize: '3.2cqw', color: '#e2e8f0', background: 'rgba(15,23,42,0.62)', padding: '0.8cqw 2.6cqw', borderRadius: '4cqw' } as any}>● {live === 'on' ? 'Live' : 'Snapshots'}{devName ? ' · ' + devName : ''}</span>}
                <span style={{ position: 'absolute', top: '2.2cqw', left: '50%', transform: 'translateX(-50%)', width: '25cqw', height: '7.2cqw', borderRadius: '4cqw', background: '#000', pointerEvents: 'none', boxShadow: '0 0 0 0.2cqw #0c0c0e' } as any}><i style={{ position: 'absolute', right: '2.2cqw', top: '50%', transform: 'translateY(-50%)', width: '3.4cqw', height: '3.4cqw', borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%,#2b3a67,#0a0d18 70%)' }} /></span>
              </div>
            </div>
          </div>
        </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }} title="Click = tap, drag = swipe, two-finger scroll = scroll">
          {[['Back', 'back'], ['Home', 'home'], ['Recents', 'recent']].map(([l, k]) => (
            <button key={k} onClick={() => phoneBtn(k)} disabled={!connected} style={{ ...iconBtn, padding: '7px 10px', fontSize: 11, justifyContent: 'center' }}>{l}</button>
          ))}
          <button data-guide="refresh" onClick={refreshScreen} disabled={!connected} title="Reload the phone screen if it is stuck or blank" style={{ ...iconBtn, padding: '7px 10px', fontSize: 11, justifyContent: 'center' }}><RotateCcw size={11} /> Refresh</button>
        </div>
      </div>
      <Coach guides={[...guides, howTo]} active={active} />
    </div>
  );
};

const iconBtn: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-main, #0f172a)' };
const linkBtn: React.CSSProperties = { ...iconBtn, padding: '2px 8px', fontSize: 11, textDecoration: 'none' };
const ghostBtn: React.CSSProperties = { background: 'transparent', border: 'none', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-muted, #64748b)', fontFamily: 'inherit' };
const menuItem: React.CSSProperties = { background: 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-main, #0f172a)', fontFamily: 'inherit', textAlign: 'left', width: '100%' };
const menuSelect: React.CSSProperties = { fontSize: 12.5, padding: '6px 8px', borderRadius: 8, border, background: 'var(--bg-card, #fff)', color: 'var(--text-main, #0f172a)' };
const sendBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
const primaryBtn: React.CSSProperties = { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

const Bubble: React.FC<{ m: Msg; onAnswer: (id: string, allow: boolean) => void; onStart: () => void; onCancelStart: () => void; onQuick: (t: string) => void; onRetry?: () => void }> = ({ m, onAnswer, onStart, onCancelStart, onQuick, onRetry }) => {
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
  if (m.kind === 'user') return <div style={{ alignSelf: 'flex-end', maxWidth: '86%', background: 'rgba(120,120,128,0.13)', color: 'var(--text-main, #0f172a)', padding: '9px 14px', borderRadius: 18, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>;
  if (m.kind === 'agent') return <div style={{ alignSelf: 'stretch', fontSize: 13.5, lineHeight: 1.65, position: 'relative', wordBreak: 'break-word', color: 'var(--text-main, #0f172a)' }}><Markdown text={m.text} /><div style={{ marginTop: 2 }}><CopyBtn text={m.text} /></div></div>;
  if (m.kind === 'check') {
    const c = m.status === 'pass' ? '#16a34a' : m.status === 'fail' ? '#dc2626' : '#d97706';
    return <div style={{ borderRadius: 12, padding: '8px 12px', fontSize: 13, background: 'rgba(120,120,128,0.07)', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{m.id ? m.id + ' · ' : ''}{m.title}</span>
        {m.persona && <span style={{ fontSize: 11, color: '#4f46e5', background: 'rgba(79,70,229,0.08)', borderRadius: 999, padding: '0 8px' }}>{m.persona}</span>}
        <b style={{ color: c, fontSize: 11 }}>{m.status.toUpperCase()}</b>
      </div>
      {m.evidence && <div style={{ color: 'var(--text-muted, #64748b)', fontSize: 12.5, paddingLeft: 16 }}><Markdown text={m.evidence} /></div>}</div>;
  }
  if (m.kind === 'report' && m.status === 'no-checks') return null;
  if (m.kind === 'report') {
    const rc = m.status === 'passed' ? '#16a34a' : m.status === 'failed' ? '#dc2626' : '#d97706';
    return (
    <div style={{ borderRadius: 14, padding: '12px 14px', fontSize: 13, background: 'rgba(120,120,128,0.07)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc }} />
        <b style={{ flex: 1, minWidth: 0 }}>Test report ready <span style={{ color: rc }}>· {m.status.toUpperCase()}</span></b>
        <a href={'/api/agent/reports/' + m.runId + '/pdf'} download style={{ ...primaryBtn, padding: '6px 12px', textDecoration: 'none', fontSize: 12.5 }}><Download size={13} /> PDF</a>
        <a href={'/api/agent/reports/' + m.runId + '/docx'} download style={{ ...iconBtn, padding: '6px 12px', textDecoration: 'none', fontSize: 12.5 }}><Download size={13} /> DOCX</a>
      </div>
      {m.savedTo && <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', wordBreak: 'break-all' }}>Also saved in {m.savedTo}</div>}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => onQuick('Re-run only the test cases that failed or were blocked in the last run, and record the results.')} style={{ ...ghostBtn, padding: '2px 0', color: '#4f46e5' }}><RotateCcw size={12} /> Re-run failed</button>
        <button onClick={() => onQuick('Run all the test cases again from the start and record the results.')} style={{ ...ghostBtn, padding: '2px 0', color: '#4f46e5' }}>Run all again</button>
        <SaveAsTest runId={m.runId} projectId={m.projectId} />
      </div>
    </div>);
  }
  if (m.kind === 'phase') {
    const b = m.phase === 'browser';
    return <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 700, color: b ? '#0284c7' : '#4f46e5', margin: '4px 0' }}>
      <span style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.25 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: b ? 'rgba(14,165,233,0.12)' : 'rgba(79,70,229,0.1)', borderRadius: 999, padding: '3px 12px' }}>{b ? <Globe size={13} /> : <Smartphone size={13} />}{m.text}{b ? ' (in the background)' : ''}</span>
      <span style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.25 }} />
    </div>;
  }
  if (m.kind === 'info') return <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted, #64748b)', textAlign: 'center' }}>{m.text}</div>;
  if (m.kind === 'error') return <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 10, fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1 }}>{m.text}</span>{onRetry && <button onClick={onRetry} style={{ ...iconBtn, fontSize: 11.5, color: '#b91c1c' }}><RotateCcw size={12} /> Retry</button>}</div>;
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
