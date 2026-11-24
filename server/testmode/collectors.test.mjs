import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'http';
import net from 'net';
import tls from 'tls';
import path from 'path';
import os from 'os';

const home = process.env.SF_EMULATOR_HOME || fs.mkdtempSync(path.join(os.tmpdir(), 'sf-col-'));
process.env.SF_EMULATOR_HOME = home;
const { setAdb } = await import('./adbref.js');
const { guard } = await import('./collectors/guard.js');
const { classify } = await import('./collectors/applog.js');
const np = await import('./collectors/netproxy.js');
const { analyzeApk } = await import('./collectors/apk.js');
const { analyze } = np;

// a phone that only remembers its proxy setting
function fakePhone({ rootAllowed = false, offline = false } = {}) {
  const st = { proxy: 'null', calls: [] };
  setAdb({ adbExe: 'adb', runAdb: async (args) => {
    const cmd = args.join(' '); st.calls.push(cmd);
    if (offline) return { success: false, output: 'error: device offline' };
    const put = /settings put global http_proxy (\S+)/.exec(cmd); if (put) { st.proxy = put[1]; return { success: true, output: '' }; }
    if (/settings delete global http_proxy/.test(cmd)) { st.proxy = 'null'; return { success: true, output: '' }; }
    if (/settings get global http_proxy/.test(cmd)) return { success: true, output: st.proxy + '\n' };
    if (/\sroot$/.test(cmd)) return { success: true, output: rootAllowed ? 'restarting adbd as root' : 'adbd cannot run as root in production builds' };
    return { success: true, output: '' };
  } });
  return st;
}
const stubRun = (id) => { fs.mkdirSync(path.join(home, 'reports', id), { recursive: true }); return { id, health: { events: [], samples: [] }, batches: [], steps: [], checks: [] }; };

test('a check that crashes or hangs is recorded in the coverage, never thrown', async () => {
  const run = stubRun('run-g1');
  assert.equal(await guard(run, 'crash', async () => { throw new Error('boom'); }), undefined);
  assert.equal(run.health.coverage.crash.status, 'error');
  await guard(run, 'perf', () => new Promise(() => {}), 60);
  assert.match(run.health.coverage.perf.note, /longer than/);
});

test('app log lines become the right findings', () => {
  const L = (lvl, tag, msg) => `11-23 12:00:00.000  1234  1234 ${lvl} ${tag}: ${msg}`;
  assert.equal(classify(L('E', 'ReactNativeJS', 'TypeError: undefined is not an object')).type, 'jserror');
  assert.equal(classify(L('E', 'ReactNativeJS', 'Network request failed')).type, 'api');
  assert.equal(classify(L('I', 'okhttp.OkHttpClient', '<-- 500 https://api.x.com/v1/students/12345 (200ms)')).type, 'api');
  assert.equal(classify(L('W', 'Choreographer', 'Skipped 120 frames!  The application may be doing too much work')).severity, 'major');
  assert.equal(classify(L('I', 'okhttp.OkHttpClient', '<-- 200 https://api.x.com/ok')), null);
});

test('real phone: traffic capture is off by default and the phone is not touched', async () => {
  const st = fakePhone(); const run = stubRun('run-r1');
  assert.equal(await np.startCapture({ run, serial: '192.168.12.151:5555' }), false);
  assert.equal(run.health.coverage.api.status, 'skipped');
  assert.ok(!st.calls.some(c => /http_proxy/.test(c)), 'no proxy setting was written');
});

test('emulator without root: capture still runs (names only), and the proxy is always removed afterwards', async () => {
  const st = fakePhone({ rootAllowed: false }); const run = stubRun('run-e1');
  assert.equal(await np.startCapture({ run, serial: 'emulator-5554' }), true);
  assert.match(st.proxy, /^10\.0\.2\.2:\d+$/);
  assert.equal(run.health.coverage.api.status, 'partial'); assert.match(run.health.coverage.api.note, /root/i);
  assert.ok(await np.stopCapture(run));
  assert.equal(st.proxy, 'null');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, 'netproxy', 'state.json'), 'utf8')), {});
});

test('a phone that went offline: the failure is reported, nothing throws', async () => {
  fakePhone({ offline: true }); const run = stubRun('run-e2');
  assert.equal(await np.startCapture({ run, serial: 'emulator-5554' }), false);
  assert.ok(['unavailable', 'error'].includes(run.health.coverage.api.status));
});

test('a proxy left behind by a crash is removed on the next start', async () => {
  const st = fakePhone();
  fs.mkdirSync(path.join(home, 'netproxy'), { recursive: true });
  fs.writeFileSync(path.join(home, 'netproxy', 'state.json'), JSON.stringify({ 'emulator-5554': { hostport: '10.0.2.2:5555', t: 1 } }));
  st.proxy = '10.0.2.2:5555';
  const r = await np.repairStaleProxies();
  assert.equal(r[0].ok, true); assert.equal(st.proxy, 'null');
});

test('capture analysis: server errors, slow calls and call loops become findings; plain http works through the proxy', async () => {
  const origin = http.createServer((q, r) => { if (q.url.startsWith('/boom')) { r.writeHead(500); return r.end('x'); } if (q.url.startsWith('/auth')) { r.writeHead(401); return r.end(); } r.end('ok'); });
  await new Promise(r => origin.listen(0, '127.0.0.1', r));
  const cap = new np._Capture({ serial: 'x', mitm: false, allowIp: null }); await cap.start();
  const get = (p) => new Promise((resolve) => { const q = http.request({ host: '127.0.0.1', port: cap.port, path: `http://127.0.0.1:${origin.address().port}${p}`, headers: { Host: '127.0.0.1' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); q.on('error', () => resolve(0)); q.end(); });
  assert.equal(await get('/boom'), 500); assert.equal(await get('/auth'), 401);
  for (let i = 0; i < 7; i++) await get('/loop');
  const run = stubRun('run-a1'); analyze(run, cap);
  const titles = run.health.events.map(e => e.title).join(' | ');
  assert.match(titles, /Server error 500/); assert.match(titles, /Not logged in \(401\)/); assert.match(titles, /repeated/);
  assert.ok(run.health.api.endpoints[Object.keys(run.health.api.endpoints).find(k => k.includes('/boom'))].fail === 1);
  await cap.stop(); origin.close();
});

test('HTTPS the app refuses (pinning-like) is passed through the second time: the app keeps working', async () => {
  const ca = await import('./collectors/netca.js');
  const origin = tls.createServer({ ...ca.leafPems('localhost') }, (s) => { s.on('error', () => {}); s.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok'); });
  await new Promise(r => origin.listen(0, '127.0.0.1', r));
  const port = origin.address().port;
  const cap = new np._Capture({ serial: 'x', mitm: true, allowIp: null, mitmPorts: [port] }); await cap.start();
  const attempt = (trust) => new Promise((resolve) => {
    const s = net.connect(cap.port, '127.0.0.1', () => s.write(`CONNECT localhost:${port} HTTP/1.1\r\nHost: localhost\r\n\r\n`));
    s.once('data', () => { const t = tls.connect({ socket: s, servername: 'localhost', ...(trust ? { ca: ca.ensureCa().certPem } : {}) }, () => { resolve('connected'); t.destroy(); }); t.on('error', () => resolve('refused')); });
    s.on('error', () => resolve('refused'));
  });
  assert.equal(await attempt(false), 'refused'); // the client does not trust our certificate (like a pinned app)
  await new Promise(r => setTimeout(r, 150));
  assert.ok(cap.passthrough.has('localhost'), 'the host is now passed through');
  assert.ok(cap.flows.some(f => f.mode === 'rejected'), 'the rejection is recorded');
  const second = await attempt(true);
  assert.equal(second, 'connected'); // second time: a plain tunnel to the real server
  await new Promise(r => setTimeout(r, 150));
  assert.equal(cap.flows.filter(f => f.mode === 'tunnel').length >= 1, true);
  await cap.stop(); origin.close();
});

test('APK scan with a phone that cannot be read: reported as partial, never thrown', async () => {
  fakePhone({ offline: true }); const run = stubRun('run-k1');
  const r = await analyzeApk({ run, serial: 'emulator-5554', pkg: 'com.example.app' });
  assert.ok(r); assert.equal(r.scanned, false);
  assert.equal(run.health.coverage.apk.status, 'partial');
});
