// Automatic health checks while a test runs: crashes and ANRs, slowness, memory, console errors, failed requests, page metrics,
// accessibility and layout problems. They cost no AI tokens: the server reads logcat / dumpsys / the page itself after each batch.
import { activeRun } from './evidence.js';
import { addHealth, addSample } from './runs.js';
import { webProbe } from '../web/tools.js';
import { afterBatchCollectors } from './collectors/index.js';
import { guard, cov } from './collectors/guard.js';

const num = (s) => { const n = parseFloat(String(s || '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const seenDev = new WeakMap(); // per run: screen size, density, "log cleared"

async function sh(TOOLS, serial, command) { try { const r = await TOOLS.shell.handler({ serial, command }); return r.ok ? String(r.output || '') : ''; } catch (e) { return ''; } }

async function deviceFacts(TOOLS, run, serial) {
  let d = seenDev.get(run);
  if (!d) {
    d = { w: 0, h: 0, density: 160, cleared: false };
    seenDev.set(run, d);
    const size = /(\d+)x(\d+)/.exec(await sh(TOOLS, serial, 'wm size')); if (size) { d.w = +size[1]; d.h = +size[2]; }
    const den = /(\d+)/.exec(await sh(TOOLS, serial, 'wm density')); if (den) d.density = +den[1];
  }
  return d;
}

// Before the first batch of a run: start with an empty crash log so old crashes are not blamed on this test.
export async function prepareApp(TOOLS, serial) {
  const run = activeRun(); if (!run) return;
  const d = await deviceFacts(TOOLS, run, serial);
  if (!d.cleared) { d.cleared = true; await sh(TOOLS, serial, 'logcat -c'); }
}

export async function afterAppBatch({ TOOLS, serial, caseId, observe, raw, slow }) {
  const run = activeRun(); if (!run) return;
  const d = await deviceFacts(TOOLS, run, serial);
  const pkg = observe?.app || '';
  try {
    const c = await TOOLS.assert_no_crash.handler({ serial });
    cov(run, 'crash', c.ok ? 'ok' : 'error', c.ok ? '' : String(c.error || 'The crash log could not be read.').slice(0, 100));
    if (c.ok && c.passed === false) { const anr = /ANR/.test(c.detail || ''); addHealth(run, { world: 'app', type: anr ? 'anr' : 'crash', severity: 'critical', title: anr ? 'App not responding (ANR)' : 'App crashed', detail: String(c.detail || '').slice(0, 400), caseId, key: 'crash|' + String(c.detail || '').slice(0, 120) }); }
  } catch (e) { cov(run, 'crash', 'error', 'The crash log could not be read: ' + String(e.message || e).slice(0, 80)); }
  let jank = null, frames = 0, pss = 0;
  if (pkg && /^[\w.]+$/.test(pkg)) {
    const g = await sh(TOOLS, serial, `dumpsys gfxinfo ${pkg}`);
    const tf = /Total frames rendered:\s*(\d+)/.exec(g), jf = /Janky frames:\s*(\d+)\s*\(([\d.]+)%\)/.exec(g);
    if (tf && jf) { frames = +tf[1]; jank = num(jf[2]); }
    await sh(TOOLS, serial, `dumpsys gfxinfo ${pkg} reset`);
    const m = await sh(TOOLS, serial, `dumpsys meminfo ${pkg}`);
    const tp = /TOTAL(?: PSS)?:?\s+(\d+)/.exec(m); if (tp) pss = Math.round(+tp[1] / 1024);
    if (frames >= 30 && jank >= 25) addHealth(run, { world: 'app', type: 'performance', severity: jank >= 50 ? 'major' : 'minor', title: `Janky scrolling / animation (${Math.round(jank)}% of frames slow)`, detail: `${frames} frames were drawn while this case ran; ${Math.round(jank)}% missed the 16 ms frame time.`, caseId });
  }
  addSample(run, { world: 'app', caseId, screen: pkg, jankPct: jank, frames, pssMb: pss || undefined });
  await afterBatchCollectors({ run, serial, pkg, caseId }).catch(() => {});
  for (const s of slow || []) addHealth(run, { world: 'app', type: 'performance', severity: s.ms > 8000 ? 'major' : 'minor', title: `Slow response: ${s.label} took ${(s.ms / 1000).toFixed(1)} s`, detail: 'The screen needed this long to answer a normal action.', caseId, key: 'slow|' + s.label });
  // layout and accessibility checks on the screen showing now
  const els = (raw || []).filter(e => Array.isArray(e.bounds));
  cov(run, 'layout', els.length && d.w ? 'ok' : 'partial', els.length && d.w ? '' : 'The screen elements or the screen size could not be read (video or animation on screen can block it).');
  if (els.length && d.w) {
    const dp = (px) => px * 160 / d.density, name = (e) => e.text || e.desc || e.id || e.cls;
    const off = els.filter(e => e.bounds[2] > d.w + 4 || e.bounds[0] < -4);
    if (off.length) addHealth(run, { world: 'app', type: 'ui', severity: 'minor', title: 'Content runs off the screen edge', detail: off.slice(0, 3).map(name).join(', '), caseId, key: 'off|' + pkg + name(off[0]) });
    const tiny = els.filter(e => e.clickable && e.bounds[2] > e.bounds[0] && Math.min(dp(e.bounds[2] - e.bounds[0]), dp(e.bounds[3] - e.bounds[1])) < 36);
    if (tiny.length) addHealth(run, { world: 'app', type: 'accessibility', severity: 'minor', title: `Tappable item(s) smaller than the recommended 48 dp: ${tiny.slice(0, 3).map(name).join(', ')}`, detail: `${tiny.length} item(s) on this screen.`, caseId, key: 'tiny|' + pkg + name(tiny[0]) });
    const unl = els.filter(e => e.clickable && !e.text && !e.desc && !/EditText/.test(e.cls || ''));
    if (unl.length) addHealth(run, { world: 'app', type: 'accessibility', severity: 'minor', title: `${unl.length} tappable item(s) without a label for screen readers`, detail: 'Buttons or icons that have no text or description.', caseId, key: 'nolabel|' + pkg + unl.length });
  }
}

export async function afterWebBatch({ caseId, since }) {
  const run = activeRun(); if (!run) return;
  let p; try { p = await webProbe(since); } catch (e) { cov(run, 'web', 'error', 'The browser could not be inspected: ' + String(e.message || e).slice(0, 80)); return; }
  if (!p) { cov(run, 'web', 'partial', 'The browser page was not available when the checks ran.'); return; }
  cov(run, 'web', p.metrics ? 'ok' : 'partial', p.metrics ? '' : 'Page speed numbers could not be read (page busy or closed).');
  for (const c of p.console) {
    const rerender = /Maximum update depth|Too many re-renders|Cannot update a component|Each child in a list|should have a unique "key"/i.test(c.text);
    addHealth(run, { world: 'web', type: rerender ? 'rerender' : 'console', severity: c.type === 'pageerror' || rerender ? 'major' : 'minor', title: (rerender ? 'Re-render warning: ' : c.type === 'pageerror' ? 'Page error: ' : 'Console error: ') + c.text.slice(0, 140), detail: 'On ' + (c.page || ''), caseId, key: 'c|' + c.text.slice(0, 100) });
  }
  for (const n of p.network) addHealth(run, { world: 'web', type: 'network', severity: n.status === 0 || n.status >= 500 ? 'major' : 'minor', title: `${n.method} ${n.url.replace(/^https?:\/\//, '').slice(0, 90)} → ${n.status || n.failure || 'failed'}`, detail: n.status ? 'The server answered with an error.' : 'The request failed before an answer came.', caseId, key: 'n|' + n.method + n.url + n.status });
  const m = p.metrics;
  if (m) {
    addSample(run, { world: 'web', caseId, screen: m.url, ttfb: m.ttfb, fcp: m.fcp, lcp: m.lcp, cls: m.cls, longTaskMs: m.longTaskMs, domNodes: m.domNodes, heapMb: m.heapMb, loadMs: m.load });
    const at = ' on ' + (m.url || '').replace(/^https?:\/\//, '').slice(0, 60), k = (t) => t + '|' + m.url;
    if (m.lcp > 2500) addHealth(run, { world: 'web', type: 'performance', severity: m.lcp > 4000 ? 'major' : 'minor', title: `Slow main content (LCP ${(m.lcp / 1000).toFixed(1)} s)${at}`, detail: 'Good is under 2.5 s.', caseId, key: k('lcp') });
    if (m.cls > 0.1) addHealth(run, { world: 'web', type: 'ui', severity: m.cls > 0.25 ? 'major' : 'minor', title: `Layout jumps while loading (CLS ${m.cls.toFixed(2)})${at}`, detail: 'Good is under 0.1.', caseId, key: k('cls') });
    if (m.ttfb > 1800) addHealth(run, { world: 'web', type: 'performance', severity: 'minor', title: `Slow server response (${(m.ttfb / 1000).toFixed(1)} s)${at}`, detail: 'The first byte took long to arrive.', caseId, key: k('ttfb') });
    if (m.longTaskMs > 600) addHealth(run, { world: 'web', type: 'performance', severity: 'minor', title: `Page freezes: ${Math.round(m.longTaskMs)} ms of long scripts${at}`, detail: 'Long JavaScript tasks block taps and typing.', caseId, key: k('lt') });
    if (m.domNodes > 3000) addHealth(run, { world: 'web', type: 'rerender', severity: 'minor', title: `Very large page (${m.domNodes} elements)${at}`, detail: 'Big pages re-render slowly.', caseId, key: k('dom') });
    const a = m.audit || {};
    if (a.imgNoAlt) addHealth(run, { world: 'web', type: 'accessibility', severity: 'minor', title: `${a.imgNoAlt} image(s) without alt text${at}`, detail: '', caseId, key: k('alt') });
    if (a.inputNoLabel) addHealth(run, { world: 'web', type: 'accessibility', severity: 'minor', title: `${a.inputNoLabel} field(s) without a label${at}`, detail: '', caseId, key: k('lbl') });
    if (a.btnNoName) addHealth(run, { world: 'web', type: 'accessibility', severity: 'minor', title: `${a.btnNoName} button/link(s) without a name${at}`, detail: '', caseId, key: k('btn') });
    if (a.overflowX) addHealth(run, { world: 'web', type: 'ui', severity: 'minor', title: `Page scrolls sideways (content wider than the screen)${at}`, detail: '', caseId, key: k('ox') });
    if (a.tinyTargets) addHealth(run, { world: 'web', type: 'accessibility', severity: 'cosmetic', title: `${a.tinyTargets} tap target(s) smaller than 24 px${at}`, detail: '', caseId, key: k('tiny') });
  }
}
