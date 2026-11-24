// Every automatic check runs inside guard(): it can time out or crash without ever stopping the test, and what happened is recorded
// in the report's "Detection coverage" table (so "nothing found" is never confused with "could not look").
import { setCoverage } from '../runs.js';

export const LABELS = {
  crash: 'Crash and "app not responding" log',
  perf: 'Frame drops and memory',
  layout: 'Screen layout and accessibility',
  applog: 'App error log (JavaScript, network, strict mode)',
  api: 'API traffic capture',
  apk: 'APK scan (API addresses, settings, secrets)',
  probe: 'API server reachability and certificate',
  web: 'Browser checks (console, network, page speed)',
  evidence: 'Screenshots per case'
};

export async function guard(run, name, fn, ms = 20000) {
  let timer;
  try {
    return await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('took longer than ' + Math.round(ms / 1000) + ' s')), ms); })]);
  } catch (e) {
    try { setCoverage(run, name, LABELS[name] || name, 'error', String(e.message || e).split('\n')[0]); } catch (x) {}
    return undefined;
  } finally { clearTimeout(timer); }
}

export const cov = (run, name, status, note) => { try { setCoverage(run, name, LABELS[name] || name, status, note); } catch (e) {} };
