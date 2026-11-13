#!/usr/bin/env node
// CI mode: run saved or file-based tests without the AI (0 tokens) and exit 0 = all passed, 1 = failures, 2 = usage/setup error.
//   node server/cli/sf-run.mjs --file tests/login.yaml [--serial emulator-5554,emulator-5556] [--junit out.xml]
//   node server/cli/sf-run.mjs --project "My App" [--test "Login"] [--shard] [--serial a,b] [--junit out.xml]
// Logins: write {{env:NAME}} in the test file and set that environment variable in CI.
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined; };
let child = null;
const stop = () => { if (child && !opt('keep-server')) { try { child.kill(); } catch (e) {} child = null; } };
const bail = (c) => { stop(); process.exitCode = c; return c; }; // no process.exit(): it trips a libuv assertion on Windows while sockets close
async function main() {
if (opt('help') || opt('h') || !(opt('file') || opt('project'))) {
  console.log('Usage: sf-run (--file <yaml|json> | --project <name|id> [--test <name>]) [--serial a,b] [--shard] [--junit <file>] [--port N] [--keep-server]');
  return bail(opt('help') || opt('h') ? 0 : 2);
}
const PORT = Number(opt('port')) || Number(process.env.SF_PORT) || 3001;
const BASE = `http://127.0.0.1:${PORT}`;
const up = async () => { try { return (await fetch(BASE + '/api/mcp/live/status', { signal: AbortSignal.timeout(1500) })).ok; } catch (e) { return false; } };

if (!(await up())) {
  const env = { ...process.env, SF_PORT: String(PORT) }; delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { cwd: root, env, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise(r => setTimeout(r, 500));
  if (!(await up())) { console.error('StreamFusion server did not start.'); return bail(2); }
}
const post = async (url, body) => (await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

const serials = String(opt('serial') || '').split(',').map(s => s.trim()).filter(Boolean);
const logins = Object.entries(process.env).filter(([k]) => /^SF_LOGIN/.test(k)).map(([, v]) => v).join(' ');
let r;
try {
  if (opt('file')) {
    const f = String(opt('file'));
    if (!fs.existsSync(f)) { console.error('File not found: ' + f); stop(); return bail(2); }
    r = await post('/api/automation/adhoc/run', { source: fs.readFileSync(f, 'utf8'), serials, logins });
  } else {
    const list = (await (await fetch(BASE + '/api/projects')).json()).projects || [];
    const q = String(opt('project')).toLowerCase();
    const p = list.find(x => x.id === opt('project') || x.name.toLowerCase() === q);
    if (!p) { console.error('Project not found: ' + opt('project') + '. Known: ' + list.map(x => x.name).join(', ')); stop(); return bail(2); }
    let ids;
    if (opt('test')) {
      const tl = (await (await fetch(`${BASE}/api/automation/${p.id}/tests`)).json()).tests || [];
      const t = String(opt('test')).toLowerCase();
      ids = tl.filter(x => x.id === opt('test') || x.name.toLowerCase().includes(t)).map(x => x.id);
      if (!ids.length) { console.error('No test matches "' + opt('test') + '"'); stop(); return bail(2); }
    }
    r = await post(`/api/automation/${p.id}/run`, { ids, serials, shard: !!opt('shard'), logins, junit: true });
  }
} catch (e) { console.error('Run failed: ' + e.message); stop(); return bail(2); }
stop();
if (!r.success) { console.error(r.message || 'Run failed'); return bail(2); }

for (const t of r.results) {
  console.log(`\n${t.status === 'passed' ? 'PASS' : 'FAIL'}  ${t.test}  [${t.serial || '-'}]  ${(t.durationMs / 1000).toFixed(1)}s  (0 AI tokens)`);
  for (const c of t.checks || []) console.log(`   ${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '·'} ${c.id} ${c.title}${c.status !== 'pass' ? ' — ' + c.evidence : ''}`);
  if (t.error) console.log('   ' + t.error);
}
if (opt('junit') && r.junit) { fs.writeFileSync(String(opt('junit')), r.junit); console.log('\nJUnit report: ' + opt('junit')); }
console.log(`\n${r.passed ? 'ALL PASSED' : 'FAILED'}`);
return bail(r.passed ? 0 : 1);
}
await main();
