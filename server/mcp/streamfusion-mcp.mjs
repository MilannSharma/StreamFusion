#!/usr/bin/env node
// M3-B: StreamFusion MCP server (stdio). Lets Claude Code / Claude Desktop / Cursor / any MCP client
// drive the Android emulator through the same tools the in-app agent uses.
// If StreamFusion is not running, this process starts its backend in the background by itself.
import readline from 'readline';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.SF_URL || `http://127.0.0.1:${process.env.SF_PORT || 3001}`;
const DEFAULT_SERIAL = process.env.SF_SERIAL || 'emulator-5554';

const EMULATOR_TOOLS = [
  { name: 'emulator_status', description: 'Is the StreamFusion Android emulator installed, running and booted? Call this first.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'emulator_start', description: 'Start the emulator (cold boot takes ~1-2 minutes; poll emulator_status until booted is true).', inputSchema: { type: 'object', properties: { headless: { type: 'boolean', description: 'No window' }, wipe: { type: 'boolean', description: 'Factory reset on start' } } } },
  { name: 'emulator_stop', description: 'Stop the emulator.', inputSchema: { type: 'object', properties: {} }, annotations: { destructiveHint: false } }
];

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = process.env.SF_PORT || 3001;
const isUp = async () => { try { return (await fetch(BASE + '/api/mcp/live/status', { signal: AbortSignal.timeout(1500) })).ok; } catch (e) { return false; } };
let starting = null;
// Claude Code says "test my app in StreamFusion" while the app is closed: start the backend (emulator, browser tools, reports) quietly.
function ensureServer() {
  return (starting ||= (async () => {
    if (await isUp()) return true;
    if (process.env.SF_URL) return false; // remote StreamFusion: nothing to start
    spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, SF_PORT: String(PORT) } }).unref();
    for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 500)); if (await isUp()) return true; }
    return false;
  })().finally(() => { setTimeout(() => { starting = null; }, 3000); }));
}
function openApp() {
  const electron = path.join(ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  if (fs.existsSync(electron)) { spawn(electron, [ROOT], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, SF_PORT: String(PORT) } }).unref(); return 'StreamFusion window opened.'; }
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', BASE], { detached: true, stdio: 'ignore' }).unref();
  return 'Opened StreamFusion in your browser at ' + BASE;
}

const APP_TOOLS = [
  { name: 'streamfusion_open_app', description: 'Show the StreamFusion window so the user can watch the emulator / browser live. Optional: everything also works with the window closed.', inputSchema: { type: 'object', properties: {} } },
  { name: 'report_begin', description: 'Start a test report (PDF/DOCX with screenshots). Call before testing, then report_check once per test case, then report_finish.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, instructions: { type: 'string', description: 'What is being tested' }, serial: { type: 'string' } }, required: ['title'] } },
  { name: 'report_check', description: 'Record the result of one test case. A screenshot of the current screen (browser or phone) is attached automatically, so make sure the result is visible first.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'e.g. TC-01' }, title: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'blocked'] }, evidence: { type: 'string', description: 'What you actually observed' }, world: { type: 'string', enum: ['web', 'phone'], description: 'Which screen to capture (default: the one you used last)' } }, required: ['title', 'status', 'evidence'] } },
  { name: 'report_finish', description: 'Finish the report. Returns download links for PDF and DOCX.', inputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } },
  { name: 'automation_list', description: 'List the saved automated tests of a project (recorded or written earlier). Check this first: a saved test can be replayed with automation_run at zero AI cost.', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project name or id (omit to list all projects)' } } } },
  { name: 'automation_run', description: 'Replay saved automated tests of a project WITHOUT any AI steps (no tokens). Returns pass/fail per check and a report id. Use instead of re-testing by hand when a saved test exists.', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project name or id' }, test: { type: 'string', description: 'Test name (part of it is enough). Omit to run all tests of the project.' }, serials: { type: 'array', items: { type: 'string' }, description: 'Phone serials for Android tests (default: ' + DEFAULT_SERIAL + ')' } }, required: ['project'] } }
];

let clientName = process.env.SF_CLIENT_NAME || 'MCP client';
async function api(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), 'x-sf-client': 'mcp', 'x-sf-client-name': clientName } });
  return r.json();
}
// Heartbeat while the client is attached, so StreamFusion can show "MCP connected".
let beat = null;
const ping = () => fetch(BASE + '/api/mcp/live/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: clientName }) }).catch(() => {});
const startBeat = () => { if (beat) return; ping(); beat = setInterval(ping, 8000); };

async function listTools() {
  await ensureServer();
  const j = await api('/api/device/tools');
  const device = j.tools.map((t) => {
    const props = { ...t.inputSchema.properties };
    props.serial = { type: 'string', description: `adb serial (default ${DEFAULT_SERIAL})` };
    return {
      name: t.name, description: t.description,
      inputSchema: { type: 'object', properties: props, required: t.inputSchema.required.filter((r) => r !== 'serial') },
      annotations: t.dangerous ? { destructiveHint: true } : undefined
    };
  });
  let web = [];
  try {
    const w = await api('/api/web/tools');
    web = w.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.dangerous ? { destructiveHint: true } : undefined }));
  } catch (e) { /* older server without web tools */ }
  return [...EMULATOR_TOOLS, ...APP_TOOLS, ...device, ...web];
}

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v) }] });

async function callTool(name, args = {}) {
  await ensureServer();
  if (name === 'streamfusion_open_app') return text(openApp());
  if (name.startsWith('report_')) {
    const r = await api('/api/agent/report/' + name.slice(7), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial: DEFAULT_SERIAL, client: clientName, ...args }) });
    return { ...text(r), ...(r.ok ? {} : { isError: true }) };
  }
  if (name === 'automation_list' || name === 'automation_run') {
    const list = (await api('/api/projects')).projects || [];
    if (name === 'automation_list' && !args.project) return text(list.map(p => ({ id: p.id, name: p.name, tests: p.tests || 0 })));
    const q = String(args.project || '').toLowerCase();
    const p = list.find(x => x.id === args.project || x.name.toLowerCase() === q) || list.find(x => x.name.toLowerCase().includes(q));
    if (!p) return { ...text({ ok: false, error: 'Project not found. Known: ' + list.map(x => x.name).join(', ') }), isError: true };
    const tests = (await api('/api/automation/' + p.id + '/tests')).tests || [];
    if (name === 'automation_list') return text({ project: p.name, tests: tests.map(t => ({ id: t.id, name: t.name, target: t.target, steps: t.steps, needsAi: t.needsAi, lastRun: t.lastRun && t.lastRun.status })) });
    const tq = String(args.test || '').toLowerCase();
    const ids = args.test ? tests.filter(t => t.id === args.test || t.name.toLowerCase().includes(tq)).map(t => t.id) : undefined;
    if (args.test && !ids.length) return { ...text({ ok: false, error: 'No test matches. Available: ' + tests.map(t => t.name).join(', ') }), isError: true };
    const r = await api('/api/automation/' + p.id + '/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, serials: args.serials && args.serials.length ? args.serials : [DEFAULT_SERIAL] }) });
    return { ...text(r.success ? { passed: r.passed, aiTokens: 0, results: r.results } : r), ...(r.success && r.passed ? {} : { isError: true }) };
  }
  if (name === 'emulator_status') return text(await api('/api/emulator/status'));
  if (name === 'emulator_start') return text(await api('/api/emulator/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ headless: !!args.headless, wipe: !!args.wipe }) }));
  if (name === 'emulator_stop') return text(await api('/api/emulator/stop', { method: 'POST' }));

  if (name.startsWith('web_')) {
    const w = await api('/api/web/tool/' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (name === 'web_screenshot' && w.ok) return { content: [{ type: 'image', data: w.imageBase64, mimeType: w.mime }, { type: 'text', text: 'Page ' + w.url }] };
    const { imageBase64: _i, ...wr } = w;
    return { ...text(wr), ...(w.ok ? {} : { isError: true }) };
  }
  const r = await api(`/api/device/tool/${encodeURIComponent(name)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial: DEFAULT_SERIAL, ...args })
  });
  if (name === 'screenshot' && r.ok) {
    return { content: [
      { type: 'image', data: r.imageBase64, mimeType: r.mime },
      { type: 'text', text: `Image ${r.imageWidth}x${r.imageHeight}; device ${r.deviceWidth}x${r.deviceHeight}. Multiply image coords by ${(r.deviceWidth / r.imageWidth).toFixed(2)} for device pixels.` }
    ] };
  }
  const { imageBase64, ...rest } = r;
  return { ...text(rest), ...(r.ok ? {} : { isError: true }) };
}

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      if (!process.env.SF_CLIENT_NAME) clientName = String(params?.clientInfo?.name || 'MCP client').slice(0, 40);
      ensureServer().then(startBeat);
      return { protocolVersion: params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'streamfusion', version: '1.0.0' } };
    case 'ping': return {};
    case 'tools/list': return { tools: await listTools() };
    case 'tools/call': return await callTool(params?.name, params?.arguments);
    default:
      if (id === undefined) return undefined; // notification: no reply
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  try {
    const result = await handle(msg);
    if (msg.id !== undefined && result !== undefined) send({ jsonrpc: '2.0', id: msg.id, result });
  } catch (e) {
    if (msg.id === undefined) return;
    const unreachable = e.cause?.code === 'ECONNREFUSED' || /fetch failed/.test(e.message);
    send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32000, message: unreachable ? `StreamFusion is not running at ${BASE}. Open the StreamFusion app first.` : e.message } });
  }
});

// The client went away: tell StreamFusion and stop (the heartbeat timer would otherwise keep this process alive).
let closing = false;
const bye = () => {
  if (closing) return; closing = true;
  clearInterval(beat);
  fetch(BASE + '/api/mcp/live/bye', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: clientName }) }).catch(() => {}).finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
};
process.stdin.on('end', bye);
process.stdin.on('close', bye);
