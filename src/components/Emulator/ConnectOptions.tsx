import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LogIn, KeyRound, Plug, Check, Copy, Loader2, Download } from 'lucide-react';
import { openSettings } from './secrets';

export interface CliStatus { installed: boolean; loggedIn: boolean; email?: string | null; loading: boolean; installing?: boolean; stage?: string; error?: string | null }
export const installClaude = () => fetch('/api/agent/claude/install', { method: 'POST' }).catch(() => {});
export const startClaudeSignIn = async (): Promise<{ ok: boolean; message?: string }> => {
  try { const j = await (await fetch('/api/agent/claude/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json(); return { ok: !!j.success || /already/i.test(j.message || ''), message: j.message }; } catch (e) { return { ok: false, message: 'Could not reach StreamFusion.' }; }
};
export type Engine = 'claude' | 'api' | 'none';

const PREF = 'sf_engine';
export const getEnginePref = (): 'claude' | 'api' | '' => { try { return (localStorage.getItem(PREF) as any) || ''; } catch (e) { return ''; } };
export const setEnginePref = (v: 'claude' | 'api' | '') => { try { localStorage.setItem(PREF, v); } catch (e) {} window.dispatchEvent(new Event('sf-engine-changed')); };
// Signed-in Claude Code wins (no key to manage); an API key is used when the user picked it or Claude is not signed in.
export const resolveEngine = (pref: string, cli: CliStatus, hasKey: boolean): Engine =>
  pref === 'api' && hasKey ? 'api' : cli.loggedIn ? 'claude' : hasKey ? 'api' : 'none';

export function useClaudeStatus(active = true, fast = false) {
  const [cli, setCli] = useState<CliStatus>({ installed: true, loggedIn: false, loading: true });
  const refresh = useCallback(async (force = false) => {
    try { const j = await (await fetch('/api/agent/claude/status' + (force ? '?force=1' : ''))).json(); setCli({ installed: !!j.installed, loggedIn: !!j.loggedIn, email: j.email, loading: false, installing: !!j.installing, stage: j.stage || '', error: j.error || null }); } catch (e) { setCli(c => ({ ...c, loading: false })); }
  }, []);
  useEffect(() => {
    if (!active) return;
    const quick = fast || !!cli.installing;
    refresh(); const t = setInterval(() => refresh(quick), quick ? 1500 : 8000);
    return () => clearInterval(t);
  }, [active, fast, cli.installing, refresh]);
  return { cli, refresh };
}

const box: React.CSSProperties = { border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-card, #fff)' };
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted, #64748b)', lineHeight: 1.5 };
const title: React.CSSProperties = { fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 };

export const ConnectOptions: React.FC<{ hasKey: boolean; onChanged?: () => void }> = ({ hasKey, onChanged }) => {
  const [waiting, setWaiting] = useState(false);
  const { cli, refresh } = useClaudeStatus(true, waiting);
  const [msg, setMsg] = useState('');
  const [mcpState, setMcpState] = useState<'idle' | 'busy' | 'done' | 'fail'>('idle');
  const [copied, setCopied] = useState(false);
  const [cmd, setCmd] = useState('');
  const t0 = useRef(0);
  useEffect(() => { fetch('/api/mcp/config').then(r => r.json()).then(j => setCmd(j.claudeCode || '')).catch(() => {}); }, []);
  useEffect(() => { if (waiting && cli.loggedIn) { setWaiting(false); setMsg(''); setEnginePref('claude'); onChanged?.(); } }, [waiting, cli.loggedIn]);
  useEffect(() => { if (waiting && Date.now() - t0.current > 5 * 60 * 1000) setWaiting(false); });

  const signIn = async () => {
    setMsg('');
    const j = await startClaudeSignIn();
    if (j.ok) { t0.current = Date.now(); setWaiting(true); setMsg('A browser tab opened. Sign in with your Claude account there, then come back. This updates by itself.'); }
    else setMsg(j.message || 'Could not start sign-in.');
  };
  const signOut = async () => { await fetch('/api/agent/claude/logout', { method: 'POST' }); await refresh(true); onChanged?.(); };
  const addMcp = async () => {
    setMcpState('busy');
    try { const j = await (await fetch('/api/agent/claude/install-mcp', { method: 'POST' })).json(); setMcpState(j.success ? 'done' : 'fail'); } catch (e) { setMcpState('fail'); }
  };
  const installCmd = 'npm install -g @anthropic-ai/claude-code';
  const copy = (t: string) => { navigator.clipboard?.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={box}>
        <div style={title}><LogIn size={14} /> 1. Sign in with Claude <span style={{ ...muted, fontWeight: 500 }}>(easiest, no API key)</span></div>
        {!cli.installed ? (<>
          <div style={muted}>This uses Claude Code on this PC in the background. It is not installed yet. One click downloads and sets it up for you (about a minute, no admin needed).</div>
          <div><button className="btn-primary" disabled={!!cli.installing} onClick={() => installClaude()}>{cli.installing ? <><Loader2 size={14} style={{ animation: 'sf-spin 1s linear infinite' }} /> {cli.stage || 'Installing…'}</> : <><Download size={14} /> Install Claude</>}</button></div>
          {cli.error && <div style={{ ...muted, color: '#b91c1c' }}>{cli.error}</div>}
        </>) : cli.loggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#16a34a' }}>● Signed in{cli.email ? ' as ' + cli.email : ''}</span>
            <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => { setEnginePref('claude'); onChanged?.(); }}>Use this</button>
            <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={signOut}>Sign out</button>
          </div>
        ) : (<>
          <div style={muted}>Your Claude subscription runs the agent through the Claude Code already on this PC. You only sign in once.</div>
          <div><button className="btn-primary" disabled={waiting} onClick={signIn}>{waiting ? <><Loader2 size={14} style={{ animation: 'sf-spin 1s linear infinite' }} /> Waiting for sign-in…</> : <><LogIn size={14} /> Sign in with Claude</>}</button></div>
        </>)}
        {msg && <div style={{ ...muted, color: '#4338ca' }}>{msg}</div>}
        <style>{'@keyframes sf-spin{to{transform:rotate(360deg)}}'}</style>
      </div>

      <div style={box}>
        <div style={title}><KeyRound size={14} /> 2. Anthropic API key {hasKey && <span style={{ color: '#16a34a', fontSize: 12 }}>● saved</span>}</div>
        <div style={muted}>Pay-per-use key from console.anthropic.com. Stored encrypted on this PC.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => openSettings('ai')}><KeyRound size={14} /> {hasKey ? 'Change key' : 'Add API key'}</button>
          {hasKey && cli.loggedIn && <button className="btn-secondary" onClick={() => { setEnginePref('api'); onChanged?.(); }}>Use the key instead</button>}
        </div>
      </div>

      <div style={box}>
        <div style={title}><Plug size={14} /> 3. Connect Claude Code (MCP)</div>
        <div style={muted}>Work from your own terminal. Claude Code will start StreamFusion in the background and drive the emulator or browser itself. Just say: <i>"test my app in StreamFusion"</i>.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" disabled={!cli.installed || mcpState === 'busy'} onClick={addMcp}>{mcpState === 'busy' ? 'Adding…' : 'Add to Claude Code'}</button>
          {mcpState === 'done' && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>Added. Open a new Claude Code session.</span>}
          {mcpState === 'fail' && <span style={{ fontSize: 12, color: '#b91c1c' }}>Could not add. Use the command below.</span>}
          {!cli.installed && <span style={muted}>Install Claude Code first (step 1).</span>}
        </div>
        {cmd && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <code style={{ flex: 1, fontSize: 11, background: '#0f172a', color: '#e2e8f0', padding: '6px 8px', borderRadius: 8, userSelect: 'text', wordBreak: 'break-all' }}>{cmd}</code>
          <button className="btn-secondary" style={{ padding: '5px 8px' }} onClick={() => copy(cmd)}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
        </div>}
      </div>
    </div>
  );
};
