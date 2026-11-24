// Reads the app's own log (logcat, only the app's process) for errors it reports by itself: JavaScript errors, failed network calls,
// strict-mode problems, blocked permissions, memory trouble, a blocked UI thread. Works on any phone, with no setup.
import { addHealth } from '../runs.js';
import { sh } from '../adbref.js';
import { cov } from './guard.js';

const seen = new WeakMap(); // run -> Set of lines already reported
const clip = (s, n) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

// One log line -> a finding (or null). Order matters: the most specific rule first.
export function classify(line) {
  const m = /^\S+\s+\S+\s+\d+\s+\d+\s+([VDIWEF])\s+([^:]+?)\s*:\s*(.*)$/.exec(line);
  if (!m) return null;
  const [, lvl, tagRaw, msg] = m, tag = tagRaw.trim();
  const low = lvl === 'V' || lvl === 'D' || lvl === 'I';
  let r;
  if ((r = /<-- (\d{3}) (https?:\/\/\S+)/.exec(msg)) && +r[1] >= 400) return { type: 'api', severity: +r[1] >= 500 ? 'major' : 'minor', title: `App got HTTP ${r[1]} from ${urlShort(r[2])}`, detail: 'Reported in the app log (OkHttp).', key: `log-http|${r[1]}|${urlShort(r[2])}` };
  if ((r = /(SocketTimeoutException|UnknownHostException|ConnectException|SSLHandshakeException|SSLPeerUnverifiedException|ConnectionShutdownException|Software caused connection abort|Network request failed|Failed to connect to)([^\n]{0,120})/.exec(msg))) return { type: 'api', severity: 'major', title: `Network call failed: ${r[1]}${clip(r[2], 70)}`, detail: `${tag}: ${clip(msg, 200)}`, key: `log-net|${r[1]}|${clip(r[2], 40)}` };
  if (/ReactNativeJS/.test(tag) && !low && /(TypeError|ReferenceError|SyntaxError|undefined is not|null is not|Unhandled|Possible Unhandled Promise|Invariant Violation|Error:)/.test(msg)) return { type: 'jserror', severity: /Unhandled|TypeError|ReferenceError|Invariant/.test(msg) ? 'major' : 'minor', title: 'JavaScript error: ' + clip(msg, 140), detail: 'From the React Native log.', key: 'js|' + clip(msg, 90) };
  if (/ReactNativeJS/.test(tag) && lvl === 'W' && /(Warning:|VirtualizedList|Each child|key" prop|Maximum update depth|re-render|Cannot update a component)/i.test(msg)) return { type: /Maximum update|re-render|Cannot update a component/i.test(msg) ? 'rerender' : 'jserror', severity: /Maximum update|re-render|Cannot update a component/i.test(msg) ? 'major' : 'minor', title: 'React warning: ' + clip(msg, 140), detail: 'From the React Native log.', key: 'jsw|' + clip(msg, 90) };
  if (/Choreographer/.test(tag) && (r = /Skipped (\d+) frames/.exec(msg)) && +r[1] >= 30) return { type: 'performance', severity: +r[1] >= 100 ? 'major' : 'minor', title: `Screen froze: the app skipped ${r[1]} frames (about ${(+r[1] * 16 / 1000).toFixed(1)} s)`, detail: 'The UI thread was busy doing too much work.', key: 'skip|' + (+r[1] >= 100 ? 'big' : 'mid') };
  if (/StrictMode/.test(tag) || /StrictMode policy violation/.test(msg)) return { type: 'strictmode', severity: 'minor', title: 'Strict-mode violation: ' + clip(msg, 130), detail: 'Disk or network work on the main thread, or a leaked resource.', key: 'strict|' + clip(msg, 80) };
  if (/OutOfMemoryError|Out of memory|low memory|lowmemorykiller/i.test(msg) && !low) return { type: 'memory', severity: 'major', title: 'Memory problem: ' + clip(msg, 130), detail: `${tag}`, key: 'mem|' + clip(msg, 60) };
  if (/(Permission Denial|SecurityException|permission denied|Permission denied|Missing permission)/.test(msg) && !low) return { type: 'permission', severity: 'minor', title: 'Permission problem: ' + clip(msg, 130), detail: `${tag}`, key: 'perm|' + clip(msg, 80) };
  if (/(Slow operation|Slow Looper|Long monitor contention|Slow dispatch|Binder transaction.*took|Slow delivery)/i.test(msg)) return { type: 'performance', severity: 'minor', title: 'Slow work on the main thread: ' + clip(msg, 130), detail: tag, key: 'slow|' + clip(msg, 60) };
  if ((lvl === 'E' || lvl === 'F') && /(Exception|Error)\b/.test(msg) && !/^(Choreographer|chatty|libc|DEBUG)/.test(tag)) return { type: 'apperror', severity: 'minor', title: `${tag}: ${clip(msg, 130)}`, detail: 'Error logged by the app.', key: 'err|' + tag + '|' + clip(msg, 60) };
  return null;
}
const urlShort = (u) => { try { const x = new URL(u); return x.host + x.pathname.replace(/\/[0-9a-f-]{8,}|\/\d{3,}/gi, '/{id}').slice(0, 70); } catch (e) { return clip(u, 80); } };

export async function scanAppLog({ run, serial, pkg, caseId }) {
  if (!run || !serial || !pkg || !/^[\w.]+$/.test(pkg)) { cov(run, 'applog', 'partial', 'The app package is not known yet, so its log could not be filtered.'); return 0; }
  const p = await sh(serial, `pidof -s ${pkg}`, 6000);
  const pid = /(\d{2,})/.exec(p.output || '')?.[1];
  if (!pid) { cov(run, 'applog', 'partial', 'The app was not running when its log was read (it may have closed).'); return 0; }
  const r = await sh(serial, `logcat -d -v threadtime --pid=${pid} -t 1200`, 15000);
  if (!r.success) { cov(run, 'applog', 'error', 'Could not read the log: ' + clip(r.output, 120)); return 0; }
  let set = seen.get(run); if (!set) seen.set(run, (set = new Set()));
  let added = 0;
  for (const line of String(r.output || '').split(/\r?\n/)) {
    if (added >= 12) break;
    const f = classify(line); if (!f) continue;
    const k = f.key; if (set.has(k)) continue; set.add(k);
    if (addHealth(run, { world: 'app', ...f, caseId })) added++;
  }
  cov(run, 'applog', 'ok', '');
  return added;
}
