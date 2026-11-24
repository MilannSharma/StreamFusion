// Looks inside the installed app WITHOUT running it: which servers (APIs) it talks to, how it is configured, whether keys are hard-coded,
// and whether those servers answer and have a valid certificate. Nothing here needs a test case to mention any of it.
import fs from 'fs';
import os from 'os';
import path from 'path';
import tls from 'tls';
import https from 'https';
import { unzipSync } from 'fflate';
import { addHealth } from '../runs.js';
import { adb, sh } from '../adbref.js';
import { cov } from './guard.js';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
const CACHE = path.join(BASE, 'apk-cache');
const MAX_FILE = 48 * 1024 * 1024, MAX_APK = 400 * 1024 * 1024;

// hosts that are not "the app's API": documentation links, XML namespaces, vendors and well-known services
const NOISE = /(^|\.)(w3\.org|apache\.org|android\.com|schemas\.android\.com|xmlpull\.org|example\.com|example\.org|localhost|github\.com|githubusercontent\.com|npmjs\.org|npmjs\.com|reactjs\.org|reactnative\.dev|facebook\.com|fb\.com|mozilla\.org|creativecommons\.org|expo\.dev|expo\.io|kotlinlang\.org|jetbrains\.com|square\.github\.io|stackoverflow\.com|medium\.com|developer\.android\.com|goo\.gl|bit\.ly|unicode\.org|wikipedia\.org|google\.com|gstatic\.com|youtube\.com|twitter\.com|linkedin\.com|instagram\.com|apple\.com|microsoft\.com|openssl\.org|json-schema\.org|ietf\.org|rfc-editor\.org|whatwg\.org|oracle\.com|java\.com|sun\.com|eclipse\.org|slf4j\.org|qos\.ch|mit\.edu|adobe\.com|react\.dev|reactnavigation\.org|expo\.fyi|exp\.host|eascdn\.net|reactjs\.com|babeljs\.io|nodejs\.org|lodash\.com|momentjs\.com|npmjs\.org|yarnpkg\.com|webkit\.org|chromium\.org|ecma-international\.org|sentry-cdn\.com|jquery\.com|cloudflare\.com|fontawesome\.com|bootstrapcdn\.com|unpkg\.com|jsdelivr\.net|cdnjs\.com|polyfill\.io)$/i;
const TLD = new Set('com org net edu gov mil int info biz io co dev app me ai xyz tech online site cloud school store shop live pro in us uk au ca de fr es it nl be ch at se no dk fi pl ru ua cz pt br ar mx cl pe za ng ke eg ae sa pk bd lk np cn jp kr sg my id th vn ph hk tw nz ie il tr gr hu ro bg'.split(' '));
const validHost = (h) => { const parts = String(h).toLowerCase().split('.'); if (parts.length < 2 || parts.some(x => !x || x.length > 63 || !/^[a-z0-9-]+$/.test(x) || x.startsWith('-'))) return /^\d+\.\d+\.\d+\.\d+$/.test(h); const tld = parts[parts.length - 1]; if (!TLD.has(tld)) return false; return !/^www\.[a-z]{3,}$/.test(h) || parts.length > 2 ? true : false; };
const LIKELY = /^(api|backend|gateway|services?|app|apps|stage|staging|dev|prod|mobile|crm|auth|login|sso|rest|graphql|server|v\d)\b|[.-](api|stage|staging|prod|backend)\b/i;
const VENDOR = /(^|\.)(googleapis\.com|firebaseio\.com|firebase\.google\.com|firebaseinstallations\.googleapis\.com|crashlytics\.com|sentry\.io|branch\.io|appsflyer\.com|adjust\.com|amplitude\.com|segment\.io|mixpanel\.com|onesignal\.com|bugsnag\.com|datadoghq\.com|newrelic\.com|razorpay\.com|stripe\.com|paytm\.com|cashfree\.com|phonepe\.com|facebook\.net|graph\.facebook\.com|doubleclick\.net|googlesyndication\.com|app-measurement\.com|cloudfront\.net)$/i;
const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|localhost)/;
const norm = (p) => String(p).replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}|\/\d{3,}|\/[0-9a-f]{20,}/gi, '/{id}');

const SECRETS = [
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, name: 'Private key', severity: 'critical' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, name: 'AWS access key', severity: 'major' },
  { re: /\bsk_live_[0-9a-zA-Z]{16,}\b/g, name: 'Stripe live secret key', severity: 'critical' },
  { re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, name: 'Slack token', severity: 'major' },
  { re: /\bghp_[0-9A-Za-z]{30,}\b/g, name: 'GitHub token', severity: 'critical' },
  { re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g, name: 'Hard-coded login token (JWT)', severity: 'major' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, name: 'Google API key (check that it is restricted)', severity: 'minor' }
];
const mask = (v) => v.slice(0, 6) + '…' + v.slice(-2); // a secret is never printed in full

const parseDump = (t) => {
  const g = (re) => (re.exec(t) || [])[1] || '';
  const flags = g(/\n\s*flags=\[([^\]]*)\]/) + ' ' + g(/\n\s*privateFlags=\[([^\]]*)\]/);
  const granted = [...t.matchAll(/\n\s+([\w.]+(?:permission|PERMISSION)[\w.]*): granted=(true|false)/g)].map(m => m[1]);
  const requested = [...(/requested permissions:\n((?:\s{4,}[\w.]+(?::[^\n]*)?\n)+)/.exec(t)?.[1] || '').matchAll(/([\w.]+)/g)].map(m => m[1]).filter(x => x.includes('.'));
  return {
    versionName: g(/versionName=(\S+)/), versionCode: g(/versionCode=(\d+)/), targetSdk: +g(/targetSdk=(\d+)/) || 0, minSdk: +g(/minSdk=(\d+)/) || 0,
    debuggable: /\bDEBUGGABLE\b/.test(flags), allowBackup: /\bALLOW_BACKUP\b/.test(flags), cleartext: /\bUSES_CLEARTEXT_TRAFFIC\b/.test(flags),
    permissions: [...new Set(requested.length ? requested : granted)].slice(0, 80)
  };
};
const SENSITIVE = { 'READ_SMS': 'read SMS', 'RECEIVE_SMS': 'receive SMS', 'READ_CALL_LOG': 'call log', 'READ_CONTACTS': 'contacts', 'RECORD_AUDIO': 'microphone', 'ACCESS_BACKGROUND_LOCATION': 'location in the background', 'READ_PHONE_STATE': 'phone state / IMEI', 'SYSTEM_ALERT_WINDOW': 'draw over other apps', 'MANAGE_EXTERNAL_STORAGE': 'all files on the phone', 'REQUEST_INSTALL_PACKAGES': 'install other apps' };

function scanBuffer(name, buf, out) {
  const s = Buffer.from(buf.buffer, buf.byteOffset, buf.length).toString('latin1');
  for (const m of s.matchAll(/https?:\/\/[A-Za-z0-9._~:\/?#@!$&*+,;=%\-\[\]]{4,200}/g)) {
    let u = m[0].replace(/[.,;:!?)\]]+$/, '');
    let url; try { url = new URL(u); } catch (e) { continue; }
    if (!validHost(url.hostname)) continue;
    if (NOISE.test(url.hostname) || /[{}<>$]/.test(url.hostname)) continue;
    const k = url.protocol + '//' + url.host + norm(url.pathname.replace(/\/$/, ''));
    out.urls.set(k, (out.urls.get(k) || 0) + 1);
  }
  for (const m of s.matchAll(/\/(?:api|v\d{1,2}|rest|graphql|auth|oauth)\/[\w\-./{}:]{2,90}/g)) { if (out.paths.size < 300) out.paths.add(norm(m[0])); }
  for (const sec of SECRETS) for (const m of s.matchAll(sec.re)) { const key = sec.name + '|' + m[0].slice(0, 12); if (!out.secrets.has(key)) out.secrets.set(key, { name: sec.name, severity: sec.severity, sample: sec.name.startsWith('Private') ? '(private key block)' : mask(m[0]), file: name }); }
  if (/CertificatePinner|network_security_config|pin-set/.test(s) || s.includes('p\0i\0n\0-\0s\0e\0t')) out.pinning = true;
}

async function pullApk(serial, pkg) {
  const r = await sh(serial, `pm path ${pkg}`, 8000);
  const base = (String(r.output || '').split(/\r?\n/).map(l => l.replace(/^package:/, '').trim()).filter(l => /base\.apk$/.test(l))[0]) || (/package:(\S+\.apk)/.exec(r.output || '') || [])[1];
  if (!base) return { error: 'The app is not installed, or its file path could not be read.' };
  fs.mkdirSync(CACHE, { recursive: true });
  const local = path.join(CACHE, `tmp-${pkg}-${process.pid}.apk`);
  const p = await adb(serial, ['pull', base, local], 180000);
  if (!p.success || !fs.existsSync(local)) return { error: 'Could not copy the APK from the phone: ' + String(p.output || '').split('\n')[0].slice(0, 100) };
  return { local };
}

function probeHost(host, ms = 7000) {
  return new Promise((resolve) => {
    const out = { host, status: 0, ms: 0, error: '', certDays: null, certOk: true, certReason: '' };
    const t0 = Date.now(); let done = false;
    const end = () => { if (!done) { done = true; out.ms = Date.now() - t0; resolve(out); } };
    const req = https.request({ host, port: 443, method: 'HEAD', path: '/', timeout: ms, headers: { 'User-Agent': 'StreamFusion-check/1', Accept: '*/*' }, rejectUnauthorized: false }, (res) => {
      out.status = res.statusCode; try { const c = res.socket.getPeerCertificate(); if (c && c.valid_to) out.certDays = Math.round((new Date(c.valid_to).getTime() - Date.now()) / 86400000); out.certOk = !!res.socket.authorized; out.certReason = res.socket.authorizationError ? String(res.socket.authorizationError) : ''; } catch (e) {}
      res.resume(); end();
    });
    req.on('timeout', () => { out.error = 'no answer in ' + Math.round(ms / 1000) + ' s'; req.destroy(); end(); });
    req.on('error', (e) => { out.error = e.code || String(e.message).slice(0, 60); end(); });
    req.end();
  });
}

export async function analyzeApk({ run, serial, pkg }) {
  if (!run || !pkg) return null;
  const st = (run.health ||= { events: [], samples: [] }).static;
  if (st && st.pkg === pkg) return st;
  const dump = parseDump(String((await sh(serial, `dumpsys package ${pkg}`, 15000)).output || ''));
  const result = { pkg, ...dump, urls: [], hosts: [], paths: [], secrets: [], pinning: false, probes: [], scanned: false, t: Date.now() };
  const cacheFile = path.join(CACHE, `${pkg}-${dump.versionCode || 'x'}.json`);
  let scan = null;
  try { scan = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) {}
  if (!scan) {
    const got = await pullApk(serial, pkg);
    if (got.error) cov(run, 'apk', 'partial', got.error + ' Settings and permissions were still checked.');
    else {
      try {
        if (fs.statSync(got.local).size > MAX_APK) throw new Error('The APK is larger than 400 MB.');
        const files = unzipSync(new Uint8Array(fs.readFileSync(got.local)), { filter: (f) => f.originalSize <= MAX_FILE && /^(classes\d*\.dex|assets\/|res\/raw\/|res\/xml\/network_security_config\.xml|AndroidManifest\.xml)/.test(f.name) && !/\.(png|jpe?g|webp|gif|ttf|otf|mp3|mp4|ogg|wav|svg)$/i.test(f.name) });
        const out = { urls: new Map(), paths: new Set(), secrets: new Map(), pinning: false };
        for (const [name, data] of Object.entries(files)) scanBuffer(name, data, out);
        scan = { urls: [...out.urls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 150), paths: [...out.paths].slice(0, 150), secrets: [...out.secrets.values()].slice(0, 20), pinning: out.pinning, files: Object.keys(files).length };
        try { fs.writeFileSync(cacheFile, JSON.stringify(scan)); } catch (e) {}
      } catch (e) { cov(run, 'apk', 'partial', 'Could not read inside the APK (' + String(e.message).slice(0, 80) + '). Settings and permissions were still checked.'); }
      finally { try { fs.unlinkSync(got.local); } catch (e) {} }
    }
  }
  if (scan) {
    result.scanned = true; result.pinning = !!scan.pinning; result.paths = scan.paths; result.secrets = scan.secrets;
    result.urls = scan.urls.map(([u, n]) => ({ url: u, count: n }));
    const hosts = new Map();
    for (const { url, count } of result.urls) { try { const h = new URL(url).host; const o = hosts.get(h) || { host: h, count: 0, https: url.startsWith('https'), vendor: VENDOR.test(h.split(':')[0]), likely: LIKELY.test(h) || /\/(api|v\d+|graphql|rest)\b/.test(new URL(url).pathname), paths: [] }; o.count += count; if (/\/(api|v\d+|graphql|rest)\b/.test(url)) o.likely = true; if (o.paths.length < 6) o.paths.push(new URL(url).pathname); hosts.set(h, o); } catch (e) {} }
    result.hosts = [...hosts.values()].sort((a, b) => (a.vendor - b.vendor) || (b.likely - a.likely) || b.count - a.count).slice(0, 40);
    if (!result.hosts.length) cov(run, 'apk', 'partial', 'No server addresses were found inside the APK (they may be built at run time or kept in the server configuration).');
    else cov(run, 'apk', 'ok', '');
  }

  // findings from the settings
  const A = (type, severity, title, detail, key) => addHealth(run, { world: 'app', type, severity, title, detail, key: key || 'apk|' + title.slice(0, 60) });
  if (dump.debuggable) A('security', 'major', 'The installed app is a debug build (debuggable)', 'Anyone can attach a debugger and read its data. Fine for a test build, never for the store release.');
  if (dump.allowBackup) A('security', 'minor', 'App data can be copied out with a backup (allowBackup)', 'Set android:allowBackup="false" if the app keeps sensitive data.');
  if (dump.cleartext) A('security', 'minor', 'The app allows plain http (cleartext traffic)', 'Data sent over http can be read on the network.');
  if (dump.targetSdk && dump.targetSdk < 33) A('security', 'minor', `The app targets an old Android version (API ${dump.targetSdk})`, 'The store requires recent target versions, and old targets miss newer security rules.');
  for (const perm of dump.permissions) { const k = Object.keys(SENSITIVE).find(x => perm.endsWith('.' + x)); if (k) A('security', 'minor', `The app asks for the "${SENSITIVE[k]}" permission`, 'Keep it only if a feature really needs it.', 'perm|' + k); }
  for (const s of result.secrets) A('security', s.severity, `${s.name} found inside the APK (${s.sample})`, `Found in ${s.file}. Anything in the APK can be read by anyone who downloads it. Move secrets to the server.`, 'sec|' + s.name + s.sample);
  for (const h of result.hosts.filter(h => !h.https && !h.vendor && !PRIVATE.test(h.host) && h.likely)) A('security', 'minor', `The APK contains a plain http address: ${h.host}`, 'Use https for every server.', 'http|' + h.host);

  // do the app's own servers answer? (HEAD / only; nothing is changed on any server)
  const cand = result.hosts.filter(h => !h.vendor && h.https && !PRIVATE.test(h.host.split(':')[0]) && !/:\d+$/.test(h.host));
  const own = [...cand.filter(h => h.likely).slice(0, 8), ...cand.filter(h => !h.likely).slice(0, 3)];
  if (own.length) {
    const queue = [...own]; const workers = Array.from({ length: 4 }, async () => { while (queue.length) { const h = queue.shift(); result.probes.push(await probeHost(h.host.split(':')[0])); } });
    await Promise.all(workers);
    for (const p of result.probes) {
      if (p.error && /ENOTFOUND|EAI_AGAIN/.test(p.error)) A('api', 'minor', `Server name not found from this PC: ${p.host}`, 'It may be a private/VPN address, or the app points to a server that no longer exists.', 'pr|' + p.host);
      else if (p.error) A('api', 'major', `Server did not answer: ${p.host} (${p.error})`, 'Checked with a plain request to the address found in the APK.', 'pr|' + p.host);
      else if (p.status >= 500) A('api', 'major', `Server error ${p.status} at ${p.host}`, 'The server answered with an error when asked for its home address.', 'pr|' + p.host);
      if (p.certDays != null && p.certDays < 0) A('security', 'critical', `Certificate EXPIRED ${-p.certDays} days ago: ${p.host}`, 'Apps and browsers will refuse to connect.', 'cert|' + p.host);
      else if (p.certDays != null && p.certDays < 15) A('security', 'minor', `Certificate expires in ${p.certDays} days: ${p.host}`, 'Renew it before it expires.', 'cert|' + p.host);
      if (p.certOk === false && p.certReason && p.certDays != null && p.certDays >= 0 && own.find(h => h.host === p.host)?.likely) A('security', 'major', `Certificate problem at ${p.host}: ${p.certReason}`, 'The app may fail to connect on strict devices.', 'certbad|' + p.host);
    }
    cov(run, 'probe', result.probes.some(p => p.error) ? 'partial' : 'ok', result.probes.some(p => p.error) ? 'Some servers did not answer from this PC (see the API section).' : '');
  } else cov(run, 'probe', 'skipped', 'No public server address of the app was found to check.');
  run.health.static = result;
  return result;
}
