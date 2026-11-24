// Full test report (DOCX + PDF): verdict and metrics, scope and personas, defects, per-case steps / expected / actual with screenshots,
// coverage (what was NOT tested) and improvement suggestions.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ShadingType, PageBreak, BorderStyle, AlignmentType, Footer } from 'docx';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shotPath } from './runs.js';

// ---------- branding ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const logo = (() => { for (const rel of ['../../public/StreamFusion-128.png', '../../dist/StreamFusion-128.png']) { try { return fs.readFileSync(path.join(here, rel)); } catch (e) {} } return null; })();
const BRAND = '4F46E5';

// Product / feature / app are written into the brief as "Product: ...", "Feature / module: ...", "App (name or package): ..."
export function appInfo(run) {
  const t = String(run.instructions || ''), g = (re) => (t.match(re)?.[1] || '').trim();
  const cases = (t.match(/^\s*(?:TC[-\s]?\d+|\d+[.)])/gim) || []).length;
  return {
    product: g(/^Product:\s*(.+)$/im) || String(run.title || '').split(' - ')[0],
    module: g(/^Feature \/ module:\s*(.+)$/im) || String(run.title || '').split(' - ').slice(1).join(' - '),
    target: g(/^(?:App \(name or package\)|URL\(s\)):\s*(.+)$/im),
    isWeb: /^URL\(s\):/im.test(t), cases
  };
}


const COLORS = { pass: '16A34A', fail: 'DC2626', blocked: 'D97706', info: '64748B' };
const SEV_COLOR = { critical: '991B1B', major: 'DC2626', minor: 'D97706', cosmetic: '64748B' };
const SEV_ORDER = ['critical', 'major', 'minor', 'cosmetic'];
const SEV_HELP = { critical: 'blocks the feature or loses data', major: 'feature works wrongly', minor: 'small problem, workaround exists', cosmetic: 'looks wrong only' };
const cap = (s) => String(s || '').replace(/^./, c => c.toUpperCase());

const png = (run, rel) => { const p = rel && shotPath(run.id, rel); if (!p) return null; try { return fs.readFileSync(p); } catch (e) { return null; } };
const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const fmtDur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`; };

// ---------- numbers shared by DOCX and PDF ----------
export function analyze(run) {
  const checks = run.checks || [], rep = run.report || {};
  const n = (s) => checks.filter(c => c.status === s).length;
  const pass = n('pass'), fail = n('fail'), blocked = n('blocked'), total = checks.length;
  const t0 = new Date(run.startedAt).getTime(), t1 = new Date(run.finishedAt || Date.now()).getTime();
  const group = (key, fallback) => {
    const m = new Map();
    for (const c of checks) { const k = (c[key] || fallback).trim() || fallback; const g = m.get(k) || { name: k, pass: 0, fail: 0, blocked: 0, total: 0 }; g[c.status] = (g[c.status] || 0) + 1; g.total++; m.set(k, g); }
    return [...m.values()];
  };
  // every failed / blocked check is a defect; the AI can also list problems it saw while a case still passed (rep.defects)
  const defects = [
    ...checks.map((c, i) => ({ c, i })).filter(({ c }) => c.status !== 'pass').map(({ c, i }) => ({
      from: 'check', checkIndex: i, ref: c.id || 'TC-' + (i + 1), title: c.title, severity: c.severity || (c.status === 'fail' ? 'major' : 'minor'), category: c.category || 'functional',
      location: c.location || c.module || '', steps: c.steps || [], expected: c.expected || '', actual: c.actual || c.evidence || '', screenshot: c.screenshot, status: c.status, persona: c.persona || ''
    })),
    ...(rep.defects || []).map((d, i) => ({ from: 'observed', ref: 'OBS-' + (i + 1), ...d, severity: SEV_ORDER.includes(d.severity) ? d.severity : 'minor', status: 'observed' }))
  ].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  // automatic health findings (crashes, slowness, console errors ...) collected while the test ran, plus what the AI saw on screen
  const info = appInfo(run);
  const worldOf = (k) => (/^browser$/i.test(k.surface || '') ? 'web' : k.surface ? 'app' : info.isWeb ? 'web' : 'app');
  const idxOf = new Map(checks.map((k, i) => [k, i]));
  const health = [...(run.health?.events || []).map(e => ({ world: e.world, type: e.type, severity: e.severity || 'minor', title: e.title, detail: e.detail || '', caseId: e.caseId || '', auto: true })),
    ...checks.flatMap(k => (k.findings || []).map(f => ({ world: worldOf(k), type: f.type, severity: f.severity || 'minor', title: f.title, detail: '', caseId: k.id || 'TC-' + (idxOf.get(k) + 1), auto: false })))];
  for (const h of health.filter(h => h.type === 'crash' || h.type === 'anr')) defects.push({ from: 'health', ref: 'AUTO-' + (defects.filter(d => d.from === 'health').length + 1), title: h.title, severity: 'critical', category: 'functional', location: h.caseId ? 'During ' + h.caseId : '', steps: [], expected: 'No crash', actual: h.detail || h.title, status: 'observed' });
  defects.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const STATUS = { ok: 'Done', partial: 'Partly done', unavailable: 'Could not run', error: 'Failed', skipped: 'Skipped' };
  const covRows = Object.entries(run.health?.coverage || {}).map(([k, v]) => ({ key: k, label: v.label || k, status: v.status, text: STATUS[v.status] || v.status, note: v.note || '' }));
  const noShot = checks.filter(k => !(k.screenshots || []).length && !k.screenshot);
  if (checks.length) covRows.push({ key: 'evidence', label: 'Screenshots per case', status: noShot.length ? (noShot.length === checks.length ? 'error' : 'partial') : 'ok', text: noShot.length ? (noShot.length === checks.length ? 'Failed' : 'Partly done') : 'Done', note: noShot.length ? `${noShot.length} of ${checks.length} case(s) have no screenshot (${noShot.slice(0, 4).map(k => k.id || k.title).join(', ')}). The AI may have reported them without running a step group.` : '' });
  if (!run.health) covRows.push({ key: 'none', label: 'Automatic health checks', status: 'unavailable', text: 'Could not run', note: 'This report was made before the automatic checks existed, or no step group ran. Crash, speed and API checks are missing.' });
  const coverageGaps = covRows.filter(r => r.status !== 'ok');
  const measured = { app: !!(run.health?.samples || []).some(x => x.world === 'app'), web: !!(run.health?.samples || []).some(x => x.world === 'web') };
  const bySeverity = SEV_ORDER.map(s => ({ name: s, count: defects.filter(d => d.severity === s).length }));
  const planned = run.total || 0;
  const verdict = !total ? 'NO RESULTS' : (run.status === 'aborted' || planned > total) ? 'INCOMPLETE' : bySeverity[0].count ? 'FAIL: CRITICAL ISSUES' : fail ? 'FAIL' : blocked ? 'PASS WITH BLOCKED CASES' : 'PASS';
  // issues reported in earlier runs of this project: fixed now, still failing, or not tested this time
  const kk = (c) => String(c.id || c.title || '').toLowerCase().trim();
  const sameT = (a, b) => { const x = String(a || '').toLowerCase().trim(), y = String(b || '').toLowerCase().trim(); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
  const earlier = (run.priorIssues || []).map(i => {
    const c = checks.find(c => kk(c) === i.key || sameT(c.title, i.title) || (i.key && sameT(c.id, String(i.key).replace(/^obs:/, ''))));
    return { ...i, now: !c ? 'Not re-tested in this run' : c.status === 'pass' ? 'Fixed (passed now)' : c.status === 'fail' ? 'Still failing' : 'Still blocked' };
  });
  const steps = run.steps || [];
  return {
    earlier, health, measured, worldOf, info, covRows, coverageGaps,
    pass, fail, blocked, total, planned, passRate: total ? Math.round(pass / total * 100) : 0, durationMs: t1 - t0, avgMs: total ? Math.round((t1 - t0) / total) : 0,
    actions: steps.length, failedActions: steps.filter(s => !s.ok).length, defects, bySeverity, verdict,
    byModule: group('module', 'General'), byPersona: group('persona', 'General user'), byCategory: group('category', 'functional'),
    personas: rep.personas || [], coverage: rep.coverage || { tested: [], notTested: [] }, suggestions: rep.suggestions || [], risks: rep.risks || []
  };
}

// One test case is always written in this order: code - title, Description, Steps (as tested), Output, Result, then
// "How to fix" when it failed or was blocked, or "Suggestions" when it passed. Each entry: [label, text, key]; the screenshot goes after Output.
export function caseFields(k) {
  const n = (l) => (l || []).map((x, j) => `${j + 1}. ${x}`).join('\n');
  const failed = k.status !== 'pass';
  const output = [k.expected && 'Expected: ' + k.expected, 'Actual: ' + (k.actual || k.evidence || 'not recorded'), (k.issues || []).length && 'Issues while testing:\n' + k.issues.map(x => '- ' + x).join('\n')].filter(Boolean).join('\n');
  const fix = k.suggestion || (failed ? 'No fix was suggested. Check the Actual result above against the Expected result.' : '');
  return [
    ['Description', k.description || k.title || '', 'desc'], ['Steps', n(k.steps) || 'Steps were not recorded for this case.', 'steps'],
    ['Output', output, 'output'], ['Result', k.status.toUpperCase() + (k.remark ? ' - ' + k.remark : ''), 'result'],
    [failed ? 'How to fix' : 'Suggestions', fix, failed ? 'fix' : 'sugg']
  ].filter(f => f[1]);
}
const caseMeta = (k) => [k.surface && 'Tested on: ' + k.surface, k.module && 'Feature: ' + k.module, k.persona && 'User: ' + k.persona, k.category && 'Type: ' + k.category, k.severity && k.status !== 'pass' && 'Severity: ' + k.severity, k.location && 'Where: ' + k.location].filter(Boolean).join('  ·  ');

export function appRows(run, a) {
  const i = appInfo(run), dev = run.deviceInfo;
  const feats = (a.coverage.tested.length ? a.coverage.tested : a.byModule.map(m => m.name));
  return [
    ['Project / product', i.product || '-'], ['Feature / module under test', i.module || a.byModule.map(m => m.name).join(', ') || '-'],
    [i.isWeb ? 'Website (URL)' : 'App (name / package)', i.target || '-'], ['Platform', i.isWeb ? 'Web browser' : 'Android'],
    ['Device', i.isWeb ? '-' : `${run.serial}${dev?.model ? ' (' + dev.model + (dev.androidVersion ? ', Android ' + dev.androidVersion : '') + ')' : ''}`],
    ['Features / pages covered', feats.join(', ') || '-'], ['Roles tested', (a.personas.length ? a.personas.map(x => x.name) : a.byPersona.map(x => x.name)).join(', ') || '-'],
    ['Documents used', run.attachments?.length ? run.attachments.map(x => x.name || x).join(', ') : 'None'], ['Report ID', run.id]
  ];
}

// ---------- the report as a list of blocks: both DOCX and PDF draw the same blocks ----------
const WORLD_NAME = { app: 'App', web: 'Web (background browser)' };
const SEV_RANK = (s) => SEV_ORDER.indexOf(s);

// The screenshots of a case: the frames captured while it ran (2-3), or the single old-style screenshot.
function evidenceOf(run, k) {
  const list = (k.screenshots && k.screenshots.length ? k.screenshots : k.screenshot ? [{ file: k.screenshot, note: '', world: '' }] : []);
  return list.map(x => { const b = png(run, x.file); if (!b) return null; try { const { w, h } = pngSize(b); return { b, w, h, world: x.world, note: x.note }; } catch (e) { return null; } }).filter(Boolean);
}
const capOf = (e) => [e.world === 'web' ? 'Browser' : e.world ? 'App' : '', e.note].filter(Boolean).join(' · ');

// the servers the app talks to: those found in the APK, those seen in traffic, and what the reachability check said
function apiHosts(run) {
  const h = run.health || {}, out = new Map();
  for (const x of h.static?.hosts || []) if (!x.vendor) out.set(x.host, { host: x.host, from: 'APK', calls: 0, fail: 0, probe: '-' });
  for (const [host, v] of Object.entries(h.api?.hosts || {})) { if (/^(connectivitycheck|clients\d?\.google|android\.clients|time\.android|play\.googleapis|mtalk\.google|ssl\.gstatic)/.test(host)) continue; const o = out.get(host) || { host, from: '', calls: 0, fail: 0, probe: '-' }; o.from = o.from ? 'APK + traffic' : 'Traffic'; o.calls = v.calls; o.fail = v.fail; out.set(host, o); }
  for (const pr of h.static?.probes || []) { const o = out.get(pr.host) || out.get(pr.host + ':443'); if (o) o.probe = pr.error ? 'No answer (' + pr.error + ')' : `${pr.status}${pr.certDays != null ? ', certificate ' + (pr.certDays < 0 ? 'EXPIRED' : pr.certDays + ' days left') : ''}`; }
  return [...out.values()].sort((a, b) => b.fail - a.fail || b.calls - a.calls).slice(0, 20);
}
const apiEndpoints = (run) => Object.values(run.health?.api?.endpoints || {}).filter(e => e.method !== 'CONNECT' || e.fail).sort((a, b) => b.fail - a.fail || b.calls - a.calls).slice(0, 15);

function buildModel(run, a) {
  const M = [], h1 = (text) => M.push({ t: 'h1', text }), h2 = (text) => M.push({ t: 'h2', text }), p = (text, o = {}) => M.push({ t: 'p', text, o }), table = (headers, rows, widths) => M.push({ t: 'table', headers, rows, widths });
  const st = (s) => ({ text: cap(s), color: COLORS[s] || SEV_COLOR[s] || COLORS.info });
  const info = a.info, both = new Set(run.checks.map(a.worldOf));
  let n = 0; const sec = (title) => h1(`${++n}. ${title}`);

  sec('Result at a glance');
  M.push({ t: 'verdict', text: a.verdict });
  if (a.total) M.push({ t: 'bar' });
  const byWorld = ['app', 'web'].filter(w => both.has(w)).map(w => { const c = run.checks.filter(k => a.worldOf(k) === w); return [WORLD_NAME[w], `${c.length} cases: ${c.filter(k => k.status === 'pass').length} pass / ${c.filter(k => k.status === 'fail').length} fail / ${c.filter(k => k.status === 'blocked').length} blocked`]; });
  table(['Measure', 'Value'], [
    ['Test cases run', String(a.total)], ['Passed / Failed / Blocked', `${a.pass} / ${a.fail} / ${a.blocked}`], ['Pass rate', a.passRate + '%'],
    ...(both.size > 1 ? byWorld : []),
    ['Defects found', `${a.defects.length} (${a.bySeverity.filter(s => s.count).map(s => s.count + ' ' + s.name).join(', ') || 'none'})`],
    ['Automatic health findings', `${a.health.length} (crashes ${a.health.filter(h => h.type === 'crash' || h.type === 'anr').length}, performance ${a.health.filter(h => h.type === 'performance').length}, UI/UX ${a.health.filter(h => h.type === 'ui' || h.type === 'ux').length})`],
    ...(a.coverageGaps.length ? [['Checks that could not fully run', `${a.coverageGaps.length}: ${a.coverageGaps.map(g => g.label).slice(0, 3).join('; ')}${a.coverageGaps.length > 3 ? ' ...' : ''} (see Detection coverage)`]] : []),
    ['Total time / average per case', `${fmtDur(a.durationMs)} / ${fmtDur(a.avgMs)}`], ['Actions performed', `${a.actions}${a.failedActions ? ` (${a.failedActions} failed)` : ''}`],
    ...(both.has('app') ? [['Tested on', `${run.serial}${run.deviceInfo?.model ? ' (' + run.deviceInfo.model + (run.deviceInfo.androidVersion ? ', Android ' + run.deviceInfo.androidVersion : '') + ')' : ''}`]] : []), ['Tested by', run.model]
  ], [38, 62]);

  sec('Summary'); p(run.summary || 'No summary was written.');
  const top = a.defects.slice(0, 5);
  if (top.length) { p('Most important findings', { bold: true }); top.forEach(d => p(`• [${cap(d.severity)}] ${d.title}${d.location ? ' (' + d.location + ')' : ''}`)); }

  sec('Scope and approach'); p('Application under test', { bold: true });
  table(['Item', 'Details'], appRows(run, a), [30, 70]);
  p('Brief', { bold: true }); p(run.instructions ? String(run.instructions).slice(0, 1500) : 'No brief was recorded.', { size: 9 });
  if (run.attachments?.length) p('Documents used: ' + run.attachments.join(', '), { size: 9, mute: true });
  const personas = a.personas.length ? a.personas : a.byPersona.map(x => ({ name: x.name, notes: '' }));
  p('Tested from the point of view of:', { bold: true });
  table(['User / role', 'What this user wants', 'Cases', 'Pass'], personas.map(x => { const g = a.byPersona.find(y => y.name === x.name); return [x.name, x.goal || x.notes || '', g ? String(g.total) : '0', g ? `${g.pass}/${g.total}` : '-']; }), [24, 46, 12, 18]);

  sec('Defects');
  if (!a.defects.length) p('No defects were found in the cases that were run.');
  else {
    p('Severity: ' + SEV_ORDER.map(s => `${cap(s)} = ${SEV_HELP[s]}`).join('; ') + '.', { size: 8.5, mute: true });
    table(['Ref', 'Severity', 'Where (page / button)', 'Problem', 'Expected → Actual'], a.defects.map(d => [d.ref, st(d.severity), d.location || '-', d.title, [d.expected && 'Expected: ' + d.expected, d.actual && 'Actual: ' + d.actual].filter(Boolean).join('\n') || '-']), [8, 11, 20, 26, 35]);
  }
  if (a.earlier.length) {
    sec('Earlier issues (reported in previous runs)');
    p('These were found in earlier test runs of this project. The table shows what happened to each one in this run.', { size: 8.5, mute: true });
    table(['Issue', 'Feature', 'Severity', 'First seen', 'Status now'], a.earlier.map(e => [e.title, e.feature || '', cap(e.severity || ''), e.since || '', e.now]), [38, 18, 11, 13, 20]);
  }

  // ----- Part A (app) and Part B (web): each has its own results, health sections and evidence -----
  const parts = ['app', 'web'].filter(w => both.has(w) || a.health.some(h => h.world === w) || a.measured[w]);
  parts.forEach((w, pi) => {
    const cases = run.checks.map((k, i) => ({ k, i })).filter(x => a.worldOf(x.k) === w);
    const items = a.health.filter(h => h.world === w);
    const letter = 'AB'[pi];
    sec(`Part ${letter}: ${WORLD_NAME[w]} testing`);
    if (w === 'web' && both.has('app')) p('These cases ran in a hidden browser in the background while the app was tested (for example to check on the website what was done in the app).', { size: 9, mute: true });
    h2(`${letter}.1 Results`);
    if (cases.length) table(['#', 'Check', 'Feature', 'User', 'Result'], cases.map(({ k, i }) => [k.id || String(i + 1), k.title, k.module || '', k.persona || '', st(k.status)]), [8, 42, 20, 16, 14]);
    else p('No test case was reported for this part.', { mute: true });

    const sect = (num, title, types, checkedText, covKeys = []) => {
      h2(`${letter}.${num} ${title}`);
      const f = items.filter(h => types.includes(h.type)).sort((x, y) => SEV_RANK(x.severity) - SEV_RANK(y.severity));
      if (f.length) table(['Severity', 'Finding', 'Case', 'Detail'], f.map(h => [st(h.severity), h.title, h.caseId || '-', h.detail || (h.auto ? '' : 'Seen by the tester on screen')]), [11, 46, 11, 32]);
      const bad = covKeys.map(k => a.covRows.find(r => r.key === k)).filter(r => r && r.status !== 'ok');
      if (f.length) { if (bad.length) p('Only partly checked: ' + bad.map(r => r.note || r.text).join(' '), { size: 8.5, mute: true }); return; }
      if (bad.some(r => ['unavailable', 'error', 'skipped'].includes(r.status))) p('Could not be checked. ' + bad.map(r => r.note).filter(Boolean).join(' '), { size: 9, mute: true });
      else if (bad.length) p(`Nothing found, but this was only partly checked. ${bad.map(r => r.note).filter(Boolean).join(' ')}`, { size: 9, mute: true });
      else p(a.measured[w] || covKeys.length ? `Nothing found. Checked: ${checkedText}.` : `Not measured in this run (older report or no automatic checks ran). Would check: ${checkedText}.`, { size: 9, mute: true });
    };
    const perf = (rowsFor) => {
      const smp = (run.health?.samples || []).filter(x => x.world === w);
      if (!smp.length) return;
      rowsFor(smp);
    };
    let k2 = 2;
    if (w === 'app') {
      sect(k2++, 'Crashes and ANRs', ['crash', 'anr'], 'the crash log (FATAL EXCEPTION) and "app not responding" after every step group', ['crash']);
      sect(k2++, 'Performance', ['performance'], 'frame drops while scrolling or animating, slow responses to taps, memory', ['perf']);
      perf(smp => {
        const rows = smp.filter(x => x.jankPct != null || x.pssMb).sort((x, y) => (y.jankPct || 0) - (x.jankPct || 0)).slice(0, 12).map(x => [x.caseId || '-', String(x.screen || '').slice(0, 40), x.jankPct != null ? Math.round(x.jankPct) + '% of ' + x.frames : '-', x.pssMb ? x.pssMb + ' MB' : '-']);
        const mem = smp.filter(x => x.pssMb); const first = mem[0], last = mem[mem.length - 1];
        if (rows.length) table(['Case', 'App', 'Slow frames', 'Memory'], rows, [16, 44, 24, 16]);
        if (first && last && last.pssMb !== first.pssMb) p(`Memory use went from ${first.pssMb} MB to ${last.pssMb} MB during the run${last.pssMb > first.pssMb * 1.5 && last.pssMb - first.pssMb > 80 ? ': this growth can mean a memory leak.' : '.'}`, { size: 9 });
      });
      sect(k2++, 'Re-renders and smoothness', ['rerender'], 'repeated screen redraws as far as they can be measured from outside the app: the same server call repeating, and React warnings (slow frames are listed under Performance)', ['api', 'applog']);
      sect(k2++, 'UI and UX issues', ['ui', 'ux'], 'content running off the screen, and what the tester saw on each screen', ['layout']);
      sect(k2++, 'Accessibility', ['accessibility'], 'tap targets of at least 48 dp and labels for screen readers', ['layout']);
      sect(k2++, 'API and network problems', ['api'], 'every server call the app made (address, status, time, size), plus errors the app logged itself', ['api', 'applog']);
      const hs = apiHosts(run);
      if (hs.length) { p('Servers the app talks to', { bold: true }); table(['Server', 'Found in', 'Calls', 'Failed', 'Server check'], hs.map(x => [x.host, x.from, String(x.calls), String(x.fail), x.probe]), [34, 18, 10, 10, 28]); }
      const eps = apiEndpoints(run);
      if (eps.length) { p('Busiest and failing calls', { bold: true }); table(['Call', 'Calls', 'Failed', 'Average', 'Slowest', 'Answers'], eps.map(e => [`${e.method} ${e.host}${e.path}`.slice(0, 70), String(e.calls), String(e.fail), e.calls ? Math.round(e.sumMs / e.calls) + ' ms' : '-', e.maxMs + ' ms', Object.entries(e.statuses).map(([c, n]) => `${c} x${n}`).join(' ') || Object.keys(e.errors).join(' ') || '-']), [44, 9, 9, 12, 12, 14]); }
      sect(k2++, 'Errors in the app log', ['jserror', 'apperror', 'strictmode', 'permission', 'memory'], 'JavaScript errors, strict-mode problems, blocked permissions and memory errors the app wrote to its own log', ['applog']);
      sect(k2++, 'Security and configuration', ['security'], 'debug build, backup, plain http, hard-coded keys, certificates, sensitive permissions', ['apk', 'probe']);
      const sf = run.health?.static;
      if (sf) table(['Setting', 'Value'], [['App', `${sf.pkg}${sf.versionName ? ' ' + sf.versionName : ''}`], ['Target Android version', sf.targetSdk ? 'API ' + sf.targetSdk : '-'], ['Debug build', sf.debuggable ? 'Yes' : 'No'], ['Backup allowed', sf.allowBackup ? 'Yes' : 'No'], ['Plain http allowed', sf.cleartext ? 'Yes' : 'No'], ['Certificate pinning', sf.pinning ? 'Found in the app' : 'Not found'], ['Permissions asked', String((sf.permissions || []).length)], ['Server addresses found in the APK', String((sf.hosts || []).length)]], [38, 62]);
    } else {
      sect(k2++, 'Console and script errors', ['console'], 'JavaScript errors and page errors in the browser console', ['web']);
      sect(k2++, 'Network problems', ['network'], 'failed requests and server errors (4xx / 5xx)', ['web']);
      sect(k2++, 'Performance', ['performance'], 'page load, main-content time (LCP), layout shifts, long scripts');
      perf(smp => {
        const byPage = new Map(); smp.forEach(x => byPage.set(x.screen, x));
        const rows = [...byPage.values()].slice(0, 14).map(x => [String(x.screen || '').replace(/^https?:\/\//, '').slice(0, 42), x.ttfb ? x.ttfb + ' ms' : '-', x.fcp ? x.fcp + ' ms' : '-', x.lcp ? x.lcp + ' ms' : '-', x.cls != null ? String(x.cls) : '-', x.longTaskMs ? Math.round(x.longTaskMs) + ' ms' : '0', x.domNodes ? String(x.domNodes) : '-']);
        if (rows.length) table(['Page', 'Server', 'First paint', 'Main content', 'Layout shift', 'Long scripts', 'Elements'], rows, [28, 11, 12, 13, 12, 12, 12]);
      });
      sect(k2++, 'Re-renders and heavy pages', ['rerender'], 'React re-render warnings in the console and very large pages');
      sect(k2++, 'UI and UX issues', ['ui', 'ux'], 'sideways scrolling, layout jumps, and what the tester saw on each page');
      sect(k2++, 'Accessibility', ['accessibility'], 'image alt text, field labels, button names, tap-target size');
    }
    h2(`${letter}.${k2} Case details and evidence`);
    cases.forEach(({ k, i }) => M.push({ t: 'case', k, i }));
  });
  if (!parts.length) { sec('Test case results'); table(['#', 'Check', 'Result'], run.checks.map((k, i) => [k.id || String(i + 1), k.title, st(k.status)]), [10, 70, 20]); }

  sec('Detection coverage: what the automatic checks could and could not see');
  p('Nothing here is hidden: if a check could not run, it says why and what to do. "Nothing found" in a section above only counts when its check shows Done.', { size: 9, mute: true });
  if (a.covRows.length) table(['Check', 'Status', 'What it means / what to do'], a.covRows.map(r => [r.label, { text: r.text, color: r.status === 'ok' ? COLORS.pass : r.status === 'partial' || r.status === 'skipped' ? COLORS.blocked : COLORS.fail }, r.note || (r.status === 'ok' ? 'Ran normally.' : '')]), [30, 14, 56]);
  else p('No automatic checks ran in this report.', { size: 9, mute: true });
  p('If something is wrong that none of these checks could see, it can still be listed: as a finding on a case, or under "Defects seen while testing" in the final report.', { size: 9, mute: true });

  sec('Coverage: what was tested and what was not');
  p('Tested', { bold: true }); (a.coverage.tested.length ? a.coverage.tested : a.byModule.map(m => m.name)).forEach(t => p('✓ ' + t, { size: 9 }));
  p('Not tested yet (suggested next)', { bold: true });
  if (!a.coverage.notTested.length) p('The AI did not list any gaps. Check the screens and flows that are not in the test cases above.', { size: 9, mute: true });
  else table(['Area / page / feature', 'Why it was not tested'], a.coverage.notTested.map(x => [x.area, x.reason || '']), [40, 60]);

  sec('Suggestions');
  if (!a.suggestions.length) p('No suggestions were recorded.');
  else for (const type of [...new Set(a.suggestions.map(x => x.type || 'improvement'))]) { p(cap(type), { bold: true }); a.suggestions.filter(x => (x.type || 'improvement') === type).forEach(x => p(`• ${x.text}${x.priority ? '  [' + x.priority + ' priority]' : ''}`, { size: 9 })); }
  if (a.risks.length) { p('Risks', { bold: true }); a.risks.forEach(r => p('• ' + r, { size: 9 })); }
  p('Next steps', { bold: true }); p(a.defects.length ? '• Fix the defects above, highest severity first, then re-run the failed cases.' : '• Add the not-tested areas to the next run.', { size: 9 });
  return M;
}

// ---------- DOCX ----------
export async function buildDocx(run) {
  const a = analyze(run), M = buildModel(run, a);
  const P = (text, o = {}) => new Paragraph({ spacing: { after: 90 }, ...(o.align ? { alignment: o.align } : {}), children: [new TextRun({ text: String(text ?? ''), ...o })] });
  const H = (text, level) => new Paragraph({ heading: level, spacing: { before: 240, after: 100 }, children: [new TextRun(text)] });
  const cell = (text, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.PERCENTAGE }, ...(o.fill ? { shading: { type: ShadingType.CLEAR, fill: o.fill } } : {}), children: String(text ?? '').split('\n').map(l => P(l, { size: 18, ...o })) });
  const table = (headers, rows, widths) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { bold: true, fill: 'E2E8F0' })) }),
      ...rows.map(r => new TableRow({ children: r.map((v, i) => (v && typeof v === 'object' ? cell(v.text, widths[i], { bold: true, color: v.color }) : cell(v, widths[i]))) }))]
  });
  const bar = () => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: ['pass', 'fail', 'blocked'].filter(s => a[s] > 0).map(s => new TableCell({ width: { size: Math.max(4, Math.round(a[s] / a.total * 100)), type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: COLORS[s] }, children: [P(`${a[s]} ${s}`, { color: 'FFFFFF', bold: true, size: 16, align: AlignmentType.CENTER })] })) })] });
  const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, NOB = { top: NB, bottom: NB, left: NB, right: NB };
  const imgPara = (e, maxW, maxH) => { const sc = Math.min(maxW / e.w, maxH / e.h, 1); return new Paragraph({ children: [new ImageRun({ type: 'png', data: e.b, transformation: { width: Math.round(e.w * sc), height: Math.round(e.h * sc) } })] }); };

  const kids = [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: NOB, children: [logo ? new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 44, height: 44 } })] }) : P('')] }),
      new TableCell({ width: { size: 92, type: WidthType.PERCENTAGE }, borders: NOB, children: [new Paragraph({ children: [new TextRun({ text: 'StreamFusion', bold: true, size: 34, color: BRAND })] }), P('AI-assisted app and web testing · Test report', { color: '64748B', size: 17 })] })
    ] })] }),
    P(''), P('TEST REPORT', { color: '64748B', bold: true, size: 18 }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(run.title)] }),
    P(`${new Date(run.startedAt).toLocaleString()} · ${fmtDur(a.durationMs)} · ${run.id}`, { color: '64748B' })
  ];
  for (const b of M) {
    if (b.t === 'h1') kids.push(H(b.text, HeadingLevel.HEADING_1));
    else if (b.t === 'h2') kids.push(H(b.text, HeadingLevel.HEADING_2));
    else if (b.t === 'p') kids.push(P(b.text, { ...(b.o.bold ? { bold: true } : {}), ...(b.o.size ? { size: Math.round(b.o.size * 2) } : {}), ...(b.o.mute ? { color: '64748B' } : {}) }));
    else if (b.t === 'verdict') kids.push(P(b.text, { bold: true, size: 32, color: b.text.startsWith('PASS') ? COLORS.pass : b.text === 'INCOMPLETE' ? COLORS.blocked : COLORS.fail }));
    else if (b.t === 'bar') kids.push(bar(), P(''));
    else if (b.t === 'table') kids.push(table(b.headers, b.rows, b.widths), P(''));
    else if (b.t === 'case') {
      const { k, i } = b, col = COLORS[k.status] || COLORS.info, code = k.id || String(i + 1);
      kids.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 280 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: col, space: 2 } }, children: [new TextRun(`${code} - ${k.title}`)] }));
      const meta = caseMeta(k); if (meta) kids.push(P(meta, { size: 17, color: '64748B', keepNext: true }));
      for (const [label, text, key] of caseFields(k)) {
        kids.push(new Paragraph({ spacing: { before: 100, after: 30 }, keepNext: true, children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 16, color: key === 'fix' ? '1D4ED8' : key === 'sugg' ? '0F766E' : '64748B' })] }));
        if (key === 'result') kids.push(P(text, { bold: true, size: 22, color: col }));
        else String(text).split('\n').forEach(l => kids.push(P(l, { size: 19 })));
        if (key === 'output') {
          const ev = evidenceOf(run, k);
          if (!ev.length) kids.push(P('No screenshot was captured for this case.', { size: 17, color: '94A3B8' }));
          else kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB }, rows: [new TableRow({ children: ev.map(e => new TableCell({ width: { size: Math.round(100 / ev.length), type: WidthType.PERCENTAGE }, borders: NOB, children: [imgPara(e, ev.length === 1 ? 190 : 175, 260), P(capOf(e), { size: 14, color: '64748B' })] })) })] }));
        }
      }
    }
  }
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `StreamFusion · ${run.title}`, size: 15, color: '94A3B8' })] })] });
  return Packer.toBuffer(new Document({ sections: [{ footers: { default: footer }, children: kids }] }));
}

// ---------- PDF ----------
export function buildPdf(run) {
  return new Promise((resolve, reject) => {
    const a = analyze(run), M = buildModel(run, a);
    const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true });
    const bufs = []; doc.on('data', d => bufs.push(d)); doc.on('end', () => resolve(Buffer.concat(bufs))); doc.on('error', reject);
    const L = 48, W = 499, hex = (s) => '#' + (COLORS[s] || SEV_COLOR[s] || COLORS.info);
    const room = (h) => { if (doc.y + h > 790) doc.addPage(); };
    const h1 = (t) => { room(60); doc.moveDown(0.8).fontSize(15).fillColor('#0f172a').text(t, L, doc.y, { width: W }); doc.moveDown(0.3); };
    const h2 = (t) => { room(50); doc.moveDown(0.5).fontSize(12).fillColor('#' + BRAND).text(t, L, doc.y, { width: W }); doc.moveDown(0.2); };
    const p = (t, o = {}) => { doc.fontSize(o.size || 10).fillColor(o.mute ? '#64748b' : o.bold ? '#0f172a' : '#334155').text(String(t ?? ''), L, doc.y, { width: W }); };
    const table = (headers, rows, widths) => {
      const xs = []; let x = L; widths.forEach(w => { xs.push(x); x += W * w / 100; });
      const cw = widths.map(w => W * w / 100 - 8);
      const draw = (r, head) => {
        const cells = r.map(v => (v && typeof v === 'object' ? v : { text: String(v ?? '') }));
        const hs = cells.map((c, i) => doc.fontSize(9).heightOfString(c.text || ' ', { width: cw[i] }));
        const h = Math.max(...hs) + 8; room(head ? h + 50 : h);
        const y = doc.y;
        if (head) doc.rect(L, y, W, h).fill('#e2e8f0');
        cells.forEach((c, i) => doc.fontSize(9).fillColor(head ? '#0f172a' : c.color ? '#' + c.color : '#334155').text(c.text, xs[i] + 4, y + 4, { width: cw[i] }));
        doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.4).strokeColor('#cbd5e1').stroke();
        doc.y = y + h;
      };
      draw(headers, true); rows.forEach(r => draw(r, false)); doc.moveDown(0.5);
    };

    if (logo) { try { doc.image(logo, L, 40, { width: 34 }); } catch (e) {} }
    doc.fontSize(18).fillColor('#' + BRAND).text('StreamFusion', L + 44, 42, { width: 300 });
    doc.fontSize(8.5).fillColor('#64748b').text('AI-assisted app and web testing · Test report', L + 44, 63, { width: 300 });
    doc.moveTo(L, 82).lineTo(L + W, 82).lineWidth(1.5).strokeColor('#' + BRAND).stroke();
    doc.fontSize(9).fillColor('#64748b').text('TEST REPORT', L, 96);
    doc.fontSize(22).fillColor('#0f172a').text(run.title, L, doc.y, { width: W });
    p(`${new Date(run.startedAt).toLocaleString()} · ${fmtDur(a.durationMs)} · ${run.id}`, { mute: true, size: 9.5 });

    for (const b of M) {
      if (b.t === 'h1') h1(b.text);
      else if (b.t === 'h2') h2(b.text);
      else if (b.t === 'p') { if (b.o.bold) doc.moveDown(0.3); p(b.text, b.o); }
      else if (b.t === 'verdict') { doc.fontSize(20).fillColor(b.text.startsWith('PASS') ? hex('pass') : b.text === 'INCOMPLETE' ? hex('blocked') : hex('fail')).text(b.text, L, doc.y, { width: W }); doc.moveDown(0.3); }
      else if (b.t === 'bar') { if (a.total) { let x = L; const y = doc.y; for (const s of ['pass', 'fail', 'blocked']) if (a[s]) { const w = W * a[s] / a.total; doc.rect(x, y, w, 16).fill(hex(s)); if (w > 40) doc.fontSize(8).fillColor('#fff').text(`${a[s]} ${s}`, x + 4, y + 4, { width: w - 6 }); x += w; } doc.y = y + 24; } }
      else if (b.t === 'table') table(b.headers, b.rows, b.widths);
      else if (b.t === 'case') {
        const { k, i } = b, col = hex(k.status), code = k.id || String(i + 1), fields = caseFields(k), meta = caseMeta(k), ev = evidenceOf(run, k);
        const box = ev.map(e => { const sc = Math.min((ev.length === 1 ? 190 : 158) / e.w, 240 / e.h, 1); return { ...e, dw: e.w * sc, dh: e.h * sc }; });
        const imgH = box.length ? Math.max(...box.map(e => e.dh)) + 22 : 14;
        const est = 34 + (meta ? 14 : 0) + fields.reduce((t, [l, v]) => t + 12 + doc.fontSize(9.5).heightOfString(v, { width: W }) + 6, 0) + imgH;
        room(Math.min(est, 700)); doc.moveDown(0.5);
        let y = doc.y;
        doc.rect(L, y, W, 22).fill('#f1f5f9'); doc.rect(L, y, 4, 22).fill(col);
        doc.fontSize(11).fillColor('#0f172a').text(`${code} - ${k.title}`, L + 12, y + 6, { width: W - 24, lineBreak: false, ellipsis: true });
        y += 28;
        if (meta) { doc.fontSize(8).fillColor('#64748b').text(meta, L, y, { width: W }); y = doc.y + 4; }
        for (const [l, v, key] of fields) {
          const need = 12 + doc.fontSize(9.5).heightOfString(v, { width: W }) + 6;
          if (y + Math.min(need, 120) > 790) { doc.addPage(); y = doc.y; }
          doc.fontSize(7.5).fillColor(key === 'fix' ? '#1d4ed8' : key === 'sugg' ? '#0f766e' : '#64748b').text(l.toUpperCase(), L, y, { width: W, characterSpacing: 0.6 });
          y = doc.y + 1;
          if (key === 'result') doc.fontSize(11).fillColor(col).text(v, L, y, { width: W });
          else doc.fontSize(9.5).fillColor('#334155').text(v, L, y, { width: W });
          y = doc.y + 6;
          if (key === 'output') {
            if (!box.length) { doc.fontSize(8).fillColor('#94a3b8').text('No screenshot was captured for this case.', L, y, { width: W }); y = doc.y + 6; }
            else {
              if (y + imgH > 790) { doc.addPage(); y = doc.y; }
              let x = L;
              for (const e of box) {
                try { doc.image(e.b, x, y, { width: e.dw, height: e.dh }); doc.rect(x, y, e.dw, 1.5).fill(col); doc.fontSize(7).fillColor('#64748b').text(capOf(e), x, y + e.dh + 3, { width: Math.max(e.dw, 90), lineBreak: false, ellipsis: true }); }
                catch (err) { doc.fontSize(8).fillColor('#94a3b8').text('(screenshot could not be drawn)', x, y, { width: 150 }); }
                x += e.dw + 12;
              }
              y += imgH;
            }
          }
        }
        doc.y = y;
      }
    }
    // page numbers
    const r = doc.bufferedPageRange();
    for (let i = r.start; i < r.start + r.count; i++) { doc.switchToPage(i); doc.page.margins.bottom = 0; doc.fontSize(8).fillColor('#94a3b8').text(`StreamFusion · ${run.title} · page ${i + 1} of ${r.count}`, L, 812, { width: W, align: 'center', lineBreak: false }); }
    doc.end();
  });
}
