// Traffic capture for the test phone: a small local proxy the phone is pointed at while a test runs. It records every server call of the
// app (address, status, time, size, failures) whatever the test cases say. Safe by design:
//  * fail-open: if the app refuses our certificate (pinning) that host is simply passed through, so the app keeps working;
//  * only metadata is kept: never passwords, tokens, headers or bodies, and query values are dropped;
//  * the phone's proxy setting is ALWAYS put back (test end, error, server exit, next start), because a forgotten proxy = no internet.
import fs from 'fs';
import os from 'os';
import net from 'net';
import tls from 'tls';
import http from 'http';
import https from 'https';
import path from 'path';
import { addHealth, persist } from '../runs.js';
import { adb, sh, adbSync } from '../adbref.js';
import { cov } from './guard.js';
import { ensureCa, secureContextFor, installCaOnEmulator, NET_DIR } from './netca.js';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
const STATE = path.join(NET_DIR, 'state.json'), SETTINGS = path.join(BASE, 'settings.json');
const HOP = new Set(['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade']);
const SYSTEM_HOST = /(^|\.)(connectivitycheck\.gstatic\.com|clients\d?\.google\.com|android\.clients\.google\.com|time\.android\.com|ocsp\.[\w.]+|crl\.[\w.]+|play\.googleapis\.com|mtalk\.google\.com|gstatic\.com|googleusercontent\.com|ssl\.gstatic\.com)$/i;
const VENDOR = /(^|\.)(googleapis\.com|firebaseio\.com|crashlytics\.com|sentry\.io|branch\.io|appsflyer\.com|amplitude\.com|segment\.io|mixpanel\.com|onesignal\.com|bugsnag\.com|app-measurement\.com|facebook\.com|facebook\.net|doubleclick\.net|google-analytics\.com|googletagmanager\.com)$/i;

// ---------- settings: capturing on a REAL phone is opt-in (it changes that phone's network settings while the test runs) ----------
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
export const getSettings = () => ({ networkCaptureRealPhone: false, ...readJson(SETTINGS, {}) });
export function saveSettings(patch) { const s = { ...getSettings(), ...patch }; try { fs.mkdirSync(BASE, { recursive: true }); fs.writeFileSync(SETTINGS, JSON.stringify(s)); } catch (e) {} return s; }
const isEmulator = (serial) => /^emulator-/.test(String(serial || ''));

// ---------- state file: which phones currently have OUR proxy set (so a crash can be repaired on the next start) ----------
const readState = () => readJson(STATE, {});
const writeState = (st) => { try { fs.mkdirSync(NET_DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(st)); } catch (e) {} };
const markSet = (serial, hostport) => { const st = readState(); st[serial] = { hostport, t: Date.now() }; writeState(st); };
const markCleared = (serial) => { const st = readState(); delete st[serial]; writeState(st); };

export async function clearDeviceProxy(serial) {
  let ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    await sh(serial, 'settings put global http_proxy :0', 6000);
    await sh(serial, 'settings delete global http_proxy', 6000);
    const g = await sh(serial, 'settings get global http_proxy', 6000);
    ok = g.success && /^(null|:0)?\s*$/.test(String(g.output).trim());
    if (!ok) await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  if (ok) markCleared(serial);
  return ok;
}
// Called when the server starts: a proxy left behind by a crash would leave the phone without internet.
export async function repairStaleProxies() {
  const st = readState(); const out = [];
  for (const serial of Object.keys(st)) { try { const ok = await clearDeviceProxy(serial); out.push({ serial, ok }); } catch (e) { out.push({ serial, ok: false }); } }
  return out;
}
// Last resort on process exit (sync): never leave a phone pointing at a proxy that is gone.
let exitHooked = false;
function hookExit() {
  if (exitHooked) return; exitHooked = true;
  const fix = () => { for (const serial of Object.keys(readState())) { adbSync(serial, ['shell', 'settings put global http_proxy :0']); adbSync(serial, ['shell', 'settings delete global http_proxy']); } };
  process.on('exit', fix);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { fix(); if (process.listenerCount(sig) <= 1) process.exit(0); });
}

// ---------- the proxy ----------
const normPath = (u) => { let p = String(u || '/').split('?')[0].split('#')[0]; return p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}|\/\d{3,}|\/[0-9a-f]{20,}/gi, '/{id}').slice(0, 120) || '/'; };

class Capture {
  constructor({ serial, mitm, allowIp, mitmPorts }) {
    this.mitmPorts = new Set(mitmPorts || [443]); this.serial = serial; this.mitm = mitm; this.allowIp = allowIp || null;
    this.flows = []; this.flushed = 0; this.passthrough = new Set(); this.rejected = new Map(); this.sockets = new Set();
    this.server = null; this.port = 0; this.closed = false; this.counts = { tunnel: 0, decrypted: 0, http: 0 };
  }
  record(f) { if (this.flows.length > 6000) { this.flows.splice(0, 500); this.flushed = Math.max(0, this.flushed - 500); } this.flows.push({ t: Date.now(), ...f }); }
  async start() {
    this.server = http.createServer((req, res) => this.plain(req, res));
    this.server.maxConnections = 600;
    this.server.on('connect', (req, sock, head) => this.connect(req, sock, head));
    this.server.on('clientError', (e, s) => { try { s.destroy(); } catch (x) {} });
    this.inner = http.createServer((req, res) => this.decrypted(req, res));
    this.inner.on('upgrade', (req, sock, head) => this.upgrade(req, sock, head));
    this.inner.on('clientError', (e, s) => { try { s.destroy(); } catch (x) {} });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, this.allowIp ? '0.0.0.0' : '127.0.0.1', () => { this.port = this.server.address().port; resolve(); }); });
    this.server.on('error', () => {});
  }
  allowed(sock) { if (!this.allowIp) return true; const a = String(sock.remoteAddress || '').replace('::ffff:', ''); return a === this.allowIp || a === '127.0.0.1' || a === '::1'; }
  track(sock) { this.sockets.add(sock); sock.on('close', () => this.sockets.delete(sock)); sock.on('error', () => {}); }

  // plain http://
  plain(req, res) {
    if (!this.allowed(req.socket)) { res.writeHead(403); return res.end(); }
    let u; try { u = new URL(req.url); } catch (e) { res.writeHead(400); return res.end(); }
    this.forward({ proto: 'http', host: u.hostname, port: +u.port || 80, path: u.pathname + u.search, mode: 'http' }, req, res);
  }
  // https inside our certificate
  decrypted(req, res) {
    const t = req.socket.__target || {};
    this.forward({ proto: 'https', host: t.host, port: t.port || 443, path: req.url, mode: 'decrypted' }, req, res);
  }
  forward({ proto, host, port, path: p, mode }, req, res) {
    const t0 = Date.now(), rec = { host, port, method: req.method, path: normPath(p), mode, status: 0, ms: 0, ttfb: 0, bytesIn: 0, bytesOut: 0, error: '' };
    let finished = false;
    const done = (err) => { if (finished) return; finished = true; rec.ms = Date.now() - t0; if (err) rec.error = err; this.counts[mode] = (this.counts[mode] || 0) + 1; this.record(rec); };
    const headers = {}; for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k.toLowerCase())) headers[k] = v;
    const mod = proto === 'https' ? https : http;
    const up = mod.request({ host, port, method: req.method, path: p, headers, timeout: 60000 }, (ur) => {
      rec.status = ur.statusCode; rec.ttfb = Date.now() - t0;
      const rh = {}; for (const [k, v] of Object.entries(ur.headers)) if (!HOP.has(k.toLowerCase())) rh[k] = v;
      res.writeHead(ur.statusCode, rh);
      ur.on('data', (d) => { rec.bytesIn += d.length; });
      ur.on('end', () => done()); ur.on('error', (e) => done(e.code || 'response-error'));
      ur.pipe(res);
    });
    up.on('timeout', () => { up.destroy(new Error('timeout')); });
    up.on('error', (e) => { const code = e.code || (e.message === 'timeout' ? 'ETIMEDOUT' : 'error'); done(code); try { if (!res.headersSent) { res.writeHead(code === 'ETIMEDOUT' ? 504 : 502); } res.end(); } catch (x) {} });
    req.on('data', (d) => { rec.bytesOut += d.length; });
    req.on('aborted', () => { up.destroy(); done('client-aborted'); });
    req.pipe(up);
  }
  // websocket / upgrade inside our certificate: pass the bytes through untouched
  upgrade(req, sock, head) {
    const t = sock.__target || {}, rec = { host: t.host, port: t.port || 443, method: 'WS', path: normPath(req.url), mode: 'decrypted', status: 101, ms: 0, ttfb: 0, bytesIn: 0, bytesOut: 0, error: '' };
    const t0 = Date.now(), up = tls.connect({ host: t.host, port: t.port || 443, servername: t.host }, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]; for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join('\r\n') + '\r\n\r\n'); if (head && head.length) up.write(head); up.pipe(sock); sock.pipe(up);
    });
    const end = (e) => { if (rec.ms) return; rec.ms = Date.now() - t0; if (e) rec.error = e; this.record(rec); try { up.destroy(); sock.destroy(); } catch (x) {} };
    up.on('error', (e) => end(e.code || 'error')); up.on('close', () => end()); sock.on('close', () => end()); sock.on('error', () => end());
  }
  // CONNECT host:443
  connect(req, client, head) {
    if (!this.allowed(client)) { client.destroy(); return; }
    this.track(client);
    const m = /^([^:]+|\[[^\]]+\]):(\d+)$/.exec(req.url || ''); if (!m) { client.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const host = m[1].replace(/^\[|\]$/g, ''), port = +m[2];
    if (this.mitm && this.mitmPorts.has(port) && !this.passthrough.has(host)) return this.mitmConnect(host, port, client, head);
    this.tunnel(host, port, client, head);
  }
  tunnel(host, port, client, head, extra = {}) {
    const t0 = Date.now(), rec = { host, port, method: 'CONNECT', path: '', mode: 'tunnel', status: 0, ms: 0, ttfb: 0, bytesIn: 0, bytesOut: 0, error: '', ...extra };
    let done = false; const end = (e) => { if (done) return; done = true; rec.ms = Date.now() - t0; if (e) rec.error = e; this.counts.tunnel++; this.record(rec); try { server.destroy(); client.destroy(); } catch (x) {} };
    const server = net.connect({ host, port, timeout: 15000 }, () => { rec.ttfb = Date.now() - t0; rec.status = 200; client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head && head.length) server.write(head); server.pipe(client); client.pipe(server); });
    this.track(server);
    server.on('data', (d) => { rec.bytesIn += d.length; }); client.on('data', (d) => { rec.bytesOut += d.length; });
    server.on('timeout', () => end('ETIMEDOUT')); server.on('error', (e) => { try { if (!rec.status) client.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (x) {} end(e.code || 'error'); });
    server.on('close', () => end()); client.on('close', () => end()); client.on('error', () => end());
  }
  mitmConnect(host, port, client, head) {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const sock = new tls.TLSSocket(client, { isServer: true, ALPNProtocols: ['http/1.1'], SNICallback: (sni, cb) => { try { cb(null, secureContextFor(sni || host)); } catch (e) { cb(e); } } });
    sock.__target = { host, port }; this.track(sock);
    let secure = false, flagged = false;
    sock.once('secure', () => { secure = true; this.inner.emit('connection', sock); });
    // the app did not accept our certificate (pinning, or the CA is not trusted): this host is passed through from now on
    const rejectedByApp = () => {
      if (secure || flagged) return; flagged = true;
      this.rejected.set(host, (this.rejected.get(host) || 0) + 1); this.passthrough.add(host);
      this.record({ host, port, method: 'CONNECT', path: '', mode: 'rejected', status: 0, ms: 0, ttfb: 0, bytesIn: 0, bytesOut: 0, error: 'tls-rejected-by-app' });
      try { sock.destroy(); } catch (x) {}
    };
    for (const x of [sock, client]) { x.on('error', rejectedByApp); x.on('close', rejectedByApp); x.on('end', rejectedByApp); }
    sock.on('tlsClientError', rejectedByApp);
  }
  async stop() {
    this.closed = true;
    try { this.server.close(); } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
    for (const s of this.sockets) { try { s.destroy(); } catch (e) {} }
  }
}

// ---------- which address does the phone use to reach this PC? ----------
function hostFor(serial) {
  if (isEmulator(serial)) return { host: '10.0.2.2', allowIp: null };
  const dev = /^(\d+\.\d+\.\d+)\.(\d+)(:\d+)?$/.exec(String(serial || ''));
  const nets = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal);
  if (dev) { const same = nets.find(n => n.address.startsWith(dev[1] + '.')); if (same) return { host: same.address, allowIp: dev[1] + '.' + dev[2] }; }
  return null; // USB phone or unknown network: the phone cannot reach the PC by itself
}

// ---------- analysis: calls -> findings ----------
function caseAt(run, t) { const w = (run.batches || []).filter(b => t >= b.t0 - 500 && t <= b.t1 + 4000).pop(); return w?.caseId || ''; }

export function analyze(run, cap) {
  const h = (run.health ||= { events: [], samples: [] }); const api = (h.api ||= { endpoints: {}, hosts: {}, total: 0, failed: 0, tunnelHosts: [], rejectedHosts: [] });
  const firstParty = new Set((h.static?.hosts || []).filter(x => !x.vendor).map(x => x.host.split(':')[0]));
  const recent = new Map();
  for (const f of cap.flows.slice(cap.flushed)) {
    api.total++;
    const key = `${f.method} ${f.host}${f.path}`, e = (api.endpoints[key] ||= { method: f.method, host: f.host, path: f.path, calls: 0, fail: 0, sumMs: 0, maxMs: 0, bytes: 0, statuses: {}, errors: {}, mode: f.mode });
    const failed = f.error ? !/^(client-aborted)$/.test(f.error) && !f.status : f.status >= 400;
    e.calls++; e.sumMs += f.ms; e.maxMs = Math.max(e.maxMs, f.ms); e.bytes += f.bytesIn; e.mode = f.mode;
    if (f.status) e.statuses[f.status] = (e.statuses[f.status] || 0) + 1; if (f.error) e.errors[f.error] = (e.errors[f.error] || 0) + 1;
    const hs = (api.hosts[f.host] ||= { calls: 0, fail: 0, mode: f.mode }); hs.calls++; hs.mode = f.mode; if (failed) { e.fail++; hs.fail++; api.failed++; }
    if (f.mode === 'rejected' && !api.rejectedHosts.includes(f.host)) api.rejectedHosts.push(f.host);
    if (f.mode === 'tunnel' && !api.tunnelHosts.includes(f.host)) api.tunnelHosts.push(f.host);
    if (SYSTEM_HOST.test(f.host) || f.mode === 'rejected') continue;
    const own = firstParty.has(f.host) || !VENDOR.test(f.host), cap2 = (s) => (own ? s : 'minor'), cid = caseAt(run, f.t), where = `${f.method} ${f.host}${f.path}`.slice(0, 110);
    const A = (severity, title, detail, k) => addHealth(run, { world: 'app', type: 'api', severity: cap2(severity), title, detail, caseId: cid, key: 'api|' + (k || title) });
    if (f.mode === 'http' && !/^(10\.|192\.168\.|127\.|localhost)/.test(f.host)) A('minor', `Plain http call (not secure): ${where}`, 'Anyone on the network can read this traffic. Use https.', 'http|' + f.host);
    if (f.status >= 500) A('major', `Server error ${f.status}: ${where}`, 'The server failed while answering the app.', `s|${f.status}|${where}`);
    else if (f.status === 401 || f.status === 403) A(f.status === 401 ? 'major' : 'minor', `${f.status === 401 ? 'Not logged in (401)' : 'Access refused (403)'}: ${where}`, f.status === 401 ? 'The login token was missing or expired.' : 'The user is not allowed to use this call.', `s|${f.status}|${where}`);
    else if (f.status === 404) A('minor', `Not found (404): ${where}`, 'The app calls an address the server does not have.', `s|404|${where}`);
    else if (f.status === 429) A('major', `Too many requests (429): ${where}`, 'The server is limiting the app.', `s|429|${where}`);
    else if (f.status >= 400) A('minor', `Request refused (${f.status}): ${where}`, 'The server did not accept the request.', `s|${f.status}|${where}`);
    else if (f.error && !f.status && f.error !== 'client-aborted') A('major', `Call failed (${f.error}): ${f.host}${f.path || ''}`.slice(0, 120), /ENOTFOUND/.test(f.error) ? 'The server name could not be found.' : /ETIMEDOUT/.test(f.error) ? 'The server did not answer in time.' : /ECONNREFUSED/.test(f.error) ? 'The server refused the connection.' : 'The connection broke before an answer came.', `e|${f.error}|${f.host}`);
    if (f.status && f.status < 400 && f.ms > 3000) A(f.ms > 8000 ? 'major' : 'minor', `Slow answer (${(f.ms / 1000).toFixed(1)} s): ${where}`, 'The screen waits this long for the server.', 'slow|' + where);
    if (f.bytesIn > 3 * 1024 * 1024 && f.mode !== 'tunnel') A('minor', `Very large answer (${(f.bytesIn / 1048576).toFixed(1)} MB): ${where}`, 'Big answers are slow on mobile data. Page or compress them.', 'big|' + where);
    const rk = f.method + ' ' + f.host + f.path; const arr = recent.get(rk) || []; arr.push(f.t); recent.set(rk, arr);
    if (f.method !== 'CONNECT' && arr.filter(t => f.t - t < 5000).length >= 6) addHealth(run, { world: 'app', type: 'rerender', severity: 'major', title: `Same call repeated ${arr.filter(t => f.t - t < 5000).length} times in 5 s: ${where}`, detail: 'A screen that keeps asking for the same data usually re-renders in a loop.', caseId: cid, key: 'loop|' + rk });
  }
  cap.flushed = cap.flows.length;
  persist(run);
}

// ---------- lifecycle ----------
const live = new Map(); // run.id -> { cap, serial, watch }
export const isCapturing = (run) => live.has(run?.id);

export async function startCapture({ run, serial }) {
  if (!run || !serial || live.has(run.id)) return false;
  try {
    const real = !isEmulator(serial);
    if (real && !getSettings().networkCaptureRealPhone) { cov(run, 'api', 'skipped', 'API traffic capture is off for real phones (it changes the phone\'s network setting while testing). Turn it on in Settings to see API calls. The app log and the APK scan still ran.'); return false; }
    const addr = hostFor(serial);
    if (!addr) { cov(run, 'api', 'unavailable', 'The phone is connected by cable or its address is unknown, so it cannot reach the PC for traffic capture. Connect it over Wi-Fi (same network as this PC) or use the emulator.'); return false; }
    hookExit();
    let mitm = false, why = '';
    if (!real) { const r = await installCaOnEmulator(serial); mitm = r.ok; why = r.ok ? '' : r.reason; } else why = 'A real phone does not trust the test certificate, so only the server names and failures are visible, not the contents.';
    if (mitm) ensureCa();
    const cap = new Capture({ serial, mitm, allowIp: addr.allowIp });
    await cap.start();
    const hp = `${addr.host}:${cap.port}`;
    markSet(serial, hp);
    const set = await sh(serial, `settings put global http_proxy ${hp}`, 8000);
    const get = await sh(serial, 'settings get global http_proxy', 6000);
    if (!set.success || !String(get.output).includes(String(cap.port))) { await cap.stop(); await clearDeviceProxy(serial); cov(run, 'api', 'unavailable', 'Could not set the proxy on the phone: ' + String(set.output || get.output).split('\n')[0].slice(0, 100)); return false; }
    const watch = setInterval(async () => { // the phone must keep pointing at us, and we must still be listening
      try { if (!cap.server.listening) { await stopCapture(run, 'proxy-stopped'); return; } const g = await sh(serial, 'settings get global http_proxy', 5000); if (g.success && !String(g.output).includes(String(cap.port))) { cov(run, 'api', 'partial', 'The phone\'s proxy setting was changed during the test, so part of the traffic was not captured.'); clearInterval(watch); } } catch (e) {}
    }, 12000);
    watch.unref?.();
    live.set(run.id, { cap, serial, watch, why, mitm });
    cov(run, 'api', mitm ? 'ok' : 'partial', mitm ? '' : why);
    return true;
  } catch (e) {
    try { await clearDeviceProxy(serial); } catch (x) {}
    cov(run, 'api', 'error', 'Traffic capture could not start: ' + String(e.message || e).split('\n')[0].slice(0, 100));
    return false;
  }
}

export function flushCapture(run) { const l = live.get(run?.id); if (l) { try { analyze(run, l.cap); } catch (e) { cov(run, 'api', 'error', 'Reading the captured traffic failed: ' + String(e.message).slice(0, 80)); } } }

export async function stopCapture(run, reason = '') {
  const l = live.get(run?.id); if (!l) return false;
  live.delete(run.id); clearInterval(l.watch);
  let restored = await clearDeviceProxy(l.serial); // first: give the phone its internet back
  try { await l.cap.stop(); } catch (e) {}
  try { analyze(run, l.cap); } catch (e) {}
  const api = run.health?.api;
  if (!restored) cov(run, 'api', 'error', `The phone's proxy could not be removed automatically. On the phone: Settings > Network > Wi-Fi > this network > Proxy = None (or run: adb shell settings put global http_proxy :0).`);
  else if (reason === 'proxy-stopped') cov(run, 'api', 'partial', 'The capture proxy stopped during the test; the phone was restored.');
  else if (!l.cap.flows.length) cov(run, 'api', 'partial', 'No traffic passed through the capture. The app may ignore the phone\'s proxy setting (for example Flutter or custom networking), use HTTP/3 (QUIC), or made no network calls.');
  else if (l.cap.rejected.size) cov(run, 'api', 'partial', `The app rejected our certificate for ${[...l.cap.rejected.keys()].slice(0, 4).join(', ')}${l.cap.rejected.size > 4 ? ' …' : ''} (certificate pinning). Those servers were passed through: their failures show as connection errors only, not as HTTP statuses.`);
  else if (api && api.tunnelHosts.length && !l.mitm) cov(run, 'api', 'partial', l.why || 'Only server names and connection failures are visible (contents are encrypted).');
  persist(run);
  return restored;
}

// exposed for tests
export const _Capture = Capture;
