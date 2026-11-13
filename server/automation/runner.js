// Zero-token replay of recorded / written test cases. No AI is involved: every step is a direct tool call.
import { createRun, saveShot, addCheck, addStep, finishRun, getRun, discardRun } from '../testmode/runs.js';
import * as recorder from './recorder.js';
import { resolveSecrets, loginTokens, describeStep } from './format.js';
import { baselineDir, clearCrashLog, crashScan } from './assertions.js';
import { getProject, writeProject } from '../projects/store.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isAssert = (t) => /assert/.test(t);

// returns { runId, status, checks, durationMs, serial }
export async function runTest({ tools, test, serial, projectId = null, logins = '', adb = null, retries = 1, stepTimeoutMs = 60000, onProgress, label = 'Replay (no AI)' }) {
  const target = test.target === 'phone' ? 'phone' : 'web';
  const tokens = loginTokens(logins);
  const t0 = Date.now();
  const run = createRun({ title: `${test.name} — replay`, model: label, serial: target === 'phone' ? serial : 'browser', instructions: `Automated replay of "${test.name}". ${test.steps.length} steps, 0 AI tokens.`, projectId });
  recorder.discard(run.id); // replays are never recorded again
  const call = async (name, args) => {
    if (name === 'wait') { await sleep(Math.min(Number(args?.ms) || 1000, 30000)); return { ok: true }; }
    const t = tools[name]; if (!t) return { ok: false, error: `Unknown tool ${name}` };
    const h = t.raw || t.handler;
    const resolved = resolveSecrets(args || {}, tokens);
    const left = /{{(env|login):([^}]+)}}/.exec(JSON.stringify(resolved));
    if (left) return { ok: false, error: `Missing secret ${left[2]}: set that environment variable (CI) or save the login in the project.` };
    const a = { ...resolved, ...(target === 'phone' ? { serial } : {}) };
    if (isAssert(name)) a.baselineDir = baselineDir(projectId);
    try { return await Promise.race([h(a), sleep(stepTimeoutMs).then(() => ({ ok: false, error: 'Step timed out' }))]); } catch (e) { return { ok: false, error: e.message }; }
  };
  const shot = async (tag) => {
    try { const sc = target === 'web' ? await call('web_screenshot', {}) : await call('screenshot', { maxDim: 700 }); if (sc.ok && sc.imageBase64) return saveShot(run, sc.imageBase64, tag); } catch (e) {}
    return null;
  };
  if (target === 'phone' && adb) await clearCrashLog(adb, serial);

  const hasMarkers = test.steps.some(s => s.check);
  let group = { notes: [], failed: [], asserts: 0, error: '' };
  let seq = 0;
  const close = async (title, id) => {
    const g = group; group = { notes: [], failed: [], asserts: 0, error: '' };
    const status = g.error ? 'fail' : g.failed.length ? 'fail' : g.asserts ? 'pass' : 'blocked';
    const evidence = g.error || (g.failed.length ? g.failed.join(' | ') : g.asserts ? g.notes.join(' | ') : 'No assertion was recorded for this case, so the replay cannot prove it. Run it once with the AI (Learn) to pin a pass criterion.');
    addCheck(run, { id, title, status, evidence, screenshot: await shot(status) });
    onProgress?.({ runId: run.id, check: { id, title, status } });
  };

  for (const s of test.steps) {
    if (s.plain) { group.error = group.error || `Step needs the AI first: "${s.plain}"`; continue; }
    if (s.check) { await close(s.check.title || 'Check', s.check.id || `TC-${String(++seq).padStart(2, '0')}`); continue; }
    if (group.error) continue; // an earlier step in this case broke: skip to the next check
    let r = await call(s.tool, s.args);
    for (let n = 0; n < retries && (r.ok === false || (isAssert(s.tool) && r.passed === false)); n++) { await sleep(1200); r = await call(s.tool, s.args); }
    addStep(run, { tool: s.tool, desc: describeStep(s), ok: r.ok !== false });
    if (r.ok === false) { group.error = `Step failed: ${describeStep(s)} — ${r.error || 'error'}`; continue; }
    if (isAssert(s.tool)) {
      group.asserts++;
      if (r.passed) group.notes.push(r.detail || describeStep(s)); else group.failed.push(r.detail || describeStep(s) + ' failed');
      if (!hasMarkers) await close(describeStep(s), `A-${String(++seq).padStart(2, '0')}`);
    }
  }
  if (hasMarkers && (group.asserts || group.error)) await close('Final checks', `TC-${String(++seq).padStart(2, '0')}`);
  if (!hasMarkers && group.error) await close('Test steps', `TC-${String(++seq).padStart(2, '0')}`);

  if (target === 'phone' && adb) { // automatic crash / ANR check
    try { const c = await crashScan(adb, serial); const bad = c.crashed || c.anr;
      addCheck(run, { id: 'AUTO-CRASH', title: 'No app crash or ANR during the run', status: bad ? 'fail' : 'pass', evidence: bad ? (c.crashed ? 'Crash: ' + c.lines.slice(0, 3).join(' | ') : c.anrLine) : 'No FATAL EXCEPTION or ANR in logcat.', screenshot: await shot(bad ? 'fail' : 'pass') }); } catch (e) {}
  }
  if (!run.checks.length) { discardRun(run); return { runId: null, status: 'blocked', checks: [], error: 'The test has no assertions, so it proves nothing. Add an "expect" step.', durationMs: Date.now() - t0, serial: target === 'phone' ? serial : 'browser', test: test.name }; }
  finishRun(run, `Replay without AI: ${run.checks.filter(c => c.status === 'pass').length}/${run.checks.length} checks passed. AI tokens used: 0.`, 'complete');
  const out = getRun(run.id);
  return { runId: run.id, status: out.status, checks: out.checks.map(c => ({ id: c.id, title: c.title, status: c.status, evidence: c.evidence })), durationMs: Date.now() - t0, serial: target === 'phone' ? serial : 'browser', test: test.name };
}

export function recordLastRun(projectId, testId, r) {
  const p = projectId && getProject(projectId); if (!p) return;
  const t = (p.tests || []).find(x => x.id === testId); if (!t) return;
  t.lastRun = { status: r.status, at: new Date().toISOString(), runId: r.runId, serial: r.serial };
  writeProject(p);
}

// Several tests on several devices. Browser tests run one after another (one Chrome); each phone runs its own queue, phones in parallel.
// shard=true: tests are split across the devices (faster); otherwise every test runs on every device (compatibility).
export async function runMany({ tools, tests, serials = [], shard = false, ...rest }) {
  const results = [];
  const webTests = tests.filter(t => t.target !== 'phone'), phoneTests = tests.filter(t => t.target === 'phone');
  const jobs = [];
  jobs.push((async () => { for (const t of webTests) { const r = await runTest({ ...rest, tools, test: t }); r.testId = t.id; results.push(r); } })());
  if (phoneTests.length) {
    if (!serials.length) results.push({ test: phoneTests.map(t => t.name).join(', '), status: 'blocked', checks: [], error: 'No device selected', serial: '' });
    else serials.forEach((serial, di) => jobs.push((async () => {
      const mine = shard ? phoneTests.filter((_, i) => i % serials.length === di) : phoneTests;
      for (const t of mine) { const r = await runTest({ ...rest, tools, test: t, serial }); r.testId = t.id; results.push(r); }
    })()));
  }
  await Promise.all(jobs);
  return results;
}

export function junit(results, suite = 'StreamFusion') {
  const esc = (s) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const cases = results.flatMap(r => (r.checks.length ? r.checks : [{ id: '-', title: r.error || 'no checks', status: 'blocked', evidence: r.error || '' }]).map(c => ({ ...c, cls: `${r.test} [${r.serial || '-'}]` })));
  const fails = cases.filter(c => c.status === 'fail').length, skipped = cases.filter(c => c.status === 'blocked').length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(suite)}" tests="${cases.length}" failures="${fails}" skipped="${skipped}">\n` +
    cases.map(c => `  <testcase classname="${esc(c.cls)}" name="${esc((c.id ? c.id + ' ' : '') + c.title)}">` + (c.status === 'fail' ? `<failure message="${esc(c.evidence).slice(0, 300)}"/>` : c.status === 'blocked' ? `<skipped message="${esc(c.evidence).slice(0, 300)}"/>` : '') + '</testcase>').join('\n') + '\n</testsuite>\n';
}
