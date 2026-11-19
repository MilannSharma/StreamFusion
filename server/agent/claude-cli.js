// Chat engine #2: the user's installed Claude Code (signed in with their Claude account, no API key).
// It runs headless in the background (`claude -p ... --output-format stream-json`) with only the StreamFusion MCP tools,
// and its events are translated into the same events the in-app API agent emits, so the chat UI is identical.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEST_RULES } from './prompts.js';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MCP_SCRIPT = path.join(rootDir, 'server', 'mcp', 'streamfusion-mcp.mjs').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); // external node cannot read inside app.asar
export const INTERNAL_CLIENT = 'StreamFusion chat';
const PREFIX = 'mcp__streamfusion__';

// ---------- find / install Claude Code ----------
// A fresh install is not on this process's PATH yet, so also look in the installer's default folders.
let binCache = null;
export function claudeBin() {
  if (binCache && fs.existsSync(binCache)) return binCache;
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const dirs = [...String(process.env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin'), path.join(process.env.APPDATA || '', 'npm')].filter(Boolean);
  for (const d of dirs) {
    for (const n of process.platform === 'win32' ? [exe, 'claude.cmd'] : [exe]) { const p = path.join(d, n); try { if (fs.existsSync(p)) return (binCache = p); } catch (e) {} }
  }
  return null;
}
export const installState = { installing: false, stage: '', error: null };

const runCapture = (cmd, args, onData) => new Promise((resolve) => {
  let out = '';
  const c = spawn(cmd, args, { windowsHide: true });
  c.stdout.on('data', d => { out += d; onData?.(String(d)); }); c.stderr.on('data', d => { out += d; onData?.(String(d)); });
  c.on('error', (e) => resolve({ code: -1, out: out + e.message }));
  c.on('close', (code) => resolve({ code, out }));
});

// One click "Install Claude": downloads Anthropic's official installer script (claude.ai/install.ps1) and runs it for this user only.
// Falls back to npm when the script cannot run. Nothing needs admin rights.
export async function installClaude() {
  if (installState.installing || claudeBin()) return;
  if (process.platform !== 'win32') { installState.error = 'Automatic install is available on Windows. See claude.com/claude-code for other systems.'; return; }
  Object.assign(installState, { installing: true, stage: 'Downloading the Claude installer...', error: null });
  try {
    const dir = path.join(BASE, 'downloads');
    fs.mkdirSync(dir, { recursive: true });
    let ok = false, log = '';
    try {
      const res = await fetch('https://claude.ai/install.ps1');
      const body = res.ok ? await res.text() : '';
      if (!body || body.length > 2_000_000 || /<html/i.test(body.slice(0, 200))) throw new Error('unexpected installer response (HTTP ' + res.status + ')');
      const file = path.join(dir, 'claude-install.ps1');
      fs.writeFileSync(file, body);
      installState.stage = 'Installing Claude (about a minute)...';
      const r = await runCapture('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file]);
      log = r.out; ok = !!claudeBin();
      fs.rmSync(file, { force: true });
    } catch (e) { log = String(e.message || e); }
    if (!ok) { // fallback: npm
      installState.stage = 'Installing Claude with npm...';
      const r = await runCapture(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '-g', '@anthropic-ai/claude-code']);
      log += '\n' + r.out; ok = !!claudeBin();
    }
    for (let i = 0; i < 15 && !claudeBin(); i++) await new Promise(r => setTimeout(r, 1000));
    if (!claudeBin()) throw new Error(log.trim().split('\n').slice(-2).join(' ').slice(0, 240) || 'unknown error');
    installState.stage = '';
  } catch (e) {
    installState.error = 'Install failed: ' + String(e.message || e).slice(0, 260) + '. You can also install it yourself from claude.com/claude-code.';
  } finally { installState.installing = false; cache = { at: 0, v: null }; }
}

// ---------- install / sign-in state ----------
const run = (args, timeout = 15000) => new Promise((resolve) => {
  let out = '';
  let child;
  const bin = claudeBin(); if (!bin) return resolve({ code: -1, out: '', error: 'not-installed' }); try { child = spawn(bin, args, { windowsHide: true }); } catch (e) { return resolve({ code: -1, out: '', error: e.message }); }
  const t = setTimeout(() => { try { child.kill(); } catch (e) {} }, timeout);
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, error: e.code === 'ENOENT' ? 'not-installed' : e.message }); });
  child.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
});

let cache = { at: 0, v: null };
export async function authStatus(force = false) {
  if (!force && cache.v && Date.now() - cache.at < 4000) return { ...cache.v, ...installState };
  const r = await run(['auth', 'status']);
  let v;
  if (r.error === 'not-installed') v = { installed: false, loggedIn: false };
  else {
    let j = {}; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch (e) {}
    v = { installed: true, loggedIn: !!j.loggedIn, method: j.authMethod || null, email: j.email || j.account?.email || null, provider: j.apiProvider || null };
  }
  cache = { at: Date.now(), v };
  return { ...v, ...installState };
}

// Opens the browser sign-in page. The UI polls authStatus until loggedIn flips.
let loginProc = null;
export function startLogin({ console: useConsole = false } = {}) {
  if (loginProc) return { started: false, reason: 'A sign-in is already open in your browser.' };
  const child = spawn(claudeBin() || 'claude', ['auth', 'login', useConsole ? '--console' : '--claudeai'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  loginProc = child;
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const done = () => { loginProc = null; cache = { at: 0, v: null }; };
  child.on('error', done); child.on('close', done);
  setTimeout(() => { try { child.kill(); } catch (e) {} }, 5 * 60 * 1000); // give up after 5 minutes
  return { started: true, get output() { return out; } };
}
export async function logout() { const r = await run(['auth', 'logout']); cache = { at: 0, v: null }; return r.code === 0; }

// One click "Add to Claude Code" (user scope, so it works from any folder)
export async function installMcp(port) {
  await run(['mcp', 'remove', 'streamfusion', '--scope', 'user'], 10000);
  const args = ['mcp', 'add', '--scope', 'user', 'streamfusion', ...(port && port !== 3001 ? ['-e', 'SF_PORT=' + port] : []), '--', 'node', MCP_SCRIPT];
  const r = await run(args, 20000);
  return { ok: r.code === 0, output: r.out.trim().slice(0, 400) };
}

// ---------- chat ----------
const sessions = new Map(); // our sessionId -> claude session uuid
export const resetCliSession = (id) => sessions.delete(id);

const CLI_SYSTEM = `You are StreamFusion's QA agent. You control a real Android device (usually the emulator) with the device tools and the user's own Chrome browser with the web_* tools, and carry out the user's testing instructions.
- Fewer calls is better (each one re-sends the whole conversation): put several known steps in ONE device_batch / web_batch call.
- Observe first: ui_tree for the phone, web_snapshot for the browser (both cheap). Use screenshots only when layout matters.
- After each meaningful action verify the result before moving on. If something fails, try one alternative, then report what you tried.
- Never use shell, uninstall_app, clear_data, install_apk or web_eval unless the user asked for it.
- If the user has not said what to test (a bare "start", "hi", "test"), do not touch anything: ask for the product, feature/module, URL or app, the test cases and any login.
- If the emulator is off, call emulator_start and wait with emulator_status until it is booted. The browser opens by itself on the first web_* call.
- Keep replies short. When testing, finish with PASS or FAIL per check and the evidence you saw.`;
const CLI_TEST = TEST_RULES.replace(/finish_report/g, 'report_finish') + ' A report run is already open, do not call report_begin.';

const short = (v, n = 110) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
function resultSummary(name, content, isErr) {
  let text = '';
  if (typeof content === 'string') text = content; else if (Array.isArray(content)) text = content.map(c => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : '')).join(' ');
  if (!isErr) { try { const j = JSON.parse(text); if (j && typeof j === 'object') { if (j.title || j.url) return short((j.status ? j.status + ' ' : '') + (j.title || j.url), 90); if (j.count !== undefined) return j.count + ' items'; const kv = Object.entries(j).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 4).map(([k, v]) => k + ': ' + v); if (kv.length) return short(kv.join(', '), 110); } } catch (e) {} }
  return text.trim() ? short(text.replace(/\s+/g, ' '), 110) : isErr ? 'error' : 'ok';
}

export async function runClaudeCli({ sessionId, message, serial, mode, model, testMode, dangerousNames = [], blockedNames = [], worldPrompt = '', emit, signal }) {
  const st = await authStatus();
  if (!st.installed) return emit({ type: 'error', message: 'Claude Code is not installed on this PC. Install it from claude.com/claude-code, then sign in here.' });
  if (!st.loggedIn) return emit({ type: 'error', message: 'Not signed in. Press Connect, then Sign in with Claude.' });

  fs.mkdirSync(BASE, { recursive: true });
  const cfgFile = path.join(BASE, 'claude-chat-mcp.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ mcpServers: { streamfusion: { command: process.execPath, args: [MCP_SCRIPT], env: { ...(process.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : {}), SF_PORT: String(process.env.SF_PORT || '3001'), SF_SERIAL: serial, SF_CLIENT_NAME: INTERNAL_CLIENT } } } }));

  const alias = /opus/.test(model || '') ? 'opus' : /haiku/.test(model || '') ? 'haiku' : 'sonnet';
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--mcp-config', cfgFile, '--strict-mcp-config', '--tools', '',
    '--allowedTools', PREFIX + '*', '--model', alias, '--append-system-prompt', CLI_SYSTEM + worldPrompt + (testMode ? CLI_TEST : '')];
  const denied = [...new Set([...(mode !== 'auto' ? dangerousNames : []), ...blockedNames])];
  if (denied.length) args.push('--disallowedTools', ...denied.map(n => PREFIX + n));
  const resume = sessions.get(sessionId);
  if (resume) args.push('--resume', resume);

  const child = spawn(claudeBin() || 'claude', args, { windowsHide: true, cwd: BASE, stdio: ['pipe', 'pipe', 'pipe'] });
  const onAbort = () => { try { child.kill(); } catch (e) {} };
  signal.addEventListener('abort', onAbort, { once: true });
  child.stdin.end(message);

  let errTail = '', gotResult = false, buf = '';
  const names = new Map(); // tool_use_id -> short name
  child.stderr.on('data', d => { errTail = (errTail + d).slice(-600); });
  const handle = (ev) => {
    if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) sessions.set(sessionId, ev.session_id);
    else if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        if (b.type === 'text' && b.text?.trim()) emit({ type: 'text', text: b.text });
        else if (b.type === 'tool_use') {
          const name = String(b.name).replace(PREFIX, '');
          names.set(b.id, name);
          emit({ type: 'tool_call', id: b.id, name, input: b.input || {} });
        }
      }
      const u = ev.message.usage; if (u) emit({ type: 'usage', input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens || 0 });
    } else if (ev.type === 'user' && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) if (b.type === 'tool_result') {
        const name = names.get(b.tool_use_id) || '';
        emit({ type: 'tool_result', id: b.tool_use_id, name, ok: !b.is_error, summary: resultSummary(name, b.content, !!b.is_error) });
      }
    } else if (ev.type === 'result') {
      gotResult = true;
      if (ev.session_id) sessions.set(sessionId, ev.session_id);
      if (ev.is_error) emit({ type: 'error', message: String(ev.result || ev.subtype || 'Claude reported an error').slice(0, 400) });
      else emit({ type: 'done', reason: 'complete' });
    }
  };
  child.stdout.on('data', (d) => {
    buf += d;
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) { try { handle(JSON.parse(line)); } catch (e) {} } }
  });
  await new Promise((resolve) => { child.on('close', resolve); child.on('error', (e) => { errTail = e.message; resolve(); }); });
  signal.removeEventListener('abort', onAbort);
  if (signal.aborted) return emit({ type: 'done', reason: 'stopped' });
  if (!gotResult) { sessions.delete(sessionId); emit({ type: 'error', message: 'Claude Code stopped unexpectedly. ' + errTail.trim().split('\n').slice(-2).join(' ') }); }
}
