#!/usr/bin/env node
// M3-B: StreamFusion MCP server (stdio). Lets Claude Code / Claude Desktop / Cursor / any MCP client
// drive the Android emulator through the same tools the in-app agent uses.
// Requires the StreamFusion app (or `npm run dev:server`) to be running.
import readline from 'readline';

const BASE = process.env.SF_URL || `http://127.0.0.1:${process.env.SF_PORT || 3001}`;
const DEFAULT_SERIAL = process.env.SF_SERIAL || 'emulator-5554';

const EMULATOR_TOOLS = [
  { name: 'emulator_status', description: 'Is the StreamFusion Android emulator installed, running and booted? Call this first.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'emulator_start', description: 'Start the emulator (cold boot takes ~1-2 minutes; poll emulator_status until booted is true).', inputSchema: { type: 'object', properties: { headless: { type: 'boolean', description: 'No window' }, wipe: { type: 'boolean', description: 'Factory reset on start' } } } },
  { name: 'emulator_stop', description: 'Stop the emulator.', inputSchema: { type: 'object', properties: {} }, annotations: { destructiveHint: false } }
];

async function api(path, init) {
  const r = await fetch(BASE + path, init);
  return r.json();
}

async function listTools() {
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
  return [...EMULATOR_TOOLS, ...device];
}

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v) }] });

async function callTool(name, args = {}) {
  if (name === 'emulator_status') return text(await api('/api/emulator/status'));
  if (name === 'emulator_start') return text(await api('/api/emulator/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ headless: !!args.headless, wipe: !!args.wipe }) }));
  if (name === 'emulator_stop') return text(await api('/api/emulator/stop', { method: 'POST' }));

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
