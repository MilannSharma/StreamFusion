// Test Mode: stores each AI test run (checks + evidence screenshots) on disk. The DOCX / PDF reports are built in report.js.
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as recorder from '../automation/recorder.js';
import { getContext } from '../automation/assertions.js';
import { buildDocx as makeDocx, buildPdf as makePdf } from './report.js';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
export const REPORTS_DIR = path.join(BASE, 'reports');
const ID_RE = /^run-[\w-]+$/;

const runDir = (id) => path.join(REPORTS_DIR, id);
const readRun = (id) => JSON.parse(fs.readFileSync(path.join(runDir(id), 'run.json'), 'utf8'));
// Written to a temp file and renamed: a reader (the reports list) can never see a half-written run.json.
const save = (run) => {
  const f = path.join(runDir(run.id), 'run.json'), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(run, null, 1));
  try { fs.renameSync(tmp, f); } catch (e) { fs.writeFileSync(f, JSON.stringify(run, null, 1)); try { fs.unlinkSync(tmp); } catch (x) {} }
};

recorder.setStore({
  save: (runId, data) => { if (ID_RE.test(runId) && fs.existsSync(runDir(runId))) fs.writeFileSync(path.join(runDir(runId), 'recording.json'), JSON.stringify(data)); },
  load: (runId) => { try { return ID_RE.test(runId) ? JSON.parse(fs.readFileSync(path.join(runDir(runId), 'recording.json'), 'utf8')) : null; } catch (e) { return null; } }
});

export function createRun({ title, model, serial, attachments = [], instructions = '', deviceInfo = null, projectId = null, sessionId = null }) {
  let id = 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (fs.existsSync(runDir(id))) id += '-' + Math.random().toString(36).slice(2, 5);
  fs.mkdirSync(path.join(runDir(id), 'shots'), { recursive: true });
  const run = { id, sessionId, projectId, title: title || 'Test run', model, serial, startedAt: new Date().toISOString(), finishedAt: null, instructions, attachments: attachments.map(a => a.name), deviceInfo, checks: [], steps: [], summary: '', status: 'running' };
  save(run);
  recorder.start(id, { projectId, target: getContext().world === 'web' ? 'web' : 'phone', serial });
  return run;
}

// One chat = one report. A new message in the same chat (continue, an answer to a question, a resumed chat) keeps adding to the same run
// instead of starting a new report with only a few cases.
export function findRunBySession(sessionId) {
  if (!sessionId || !fs.existsSync(REPORTS_DIR)) return null;
  for (const d of fs.readdirSync(REPORTS_DIR).filter(x => ID_RE.test(x)).sort().reverse()) {
    try { const r = readRun(d); if (r.sessionId === sessionId) return r; } catch (e) {}
  }
  return null;
}
export function reopenRun(run) {
  run.finishedAt = null; run.status = 'running';
  save(run);
  recorder.resume?.(run.id, { projectId: run.projectId, serial: run.serial });
  return run;
}

const stepText = (s) => {
  const i = s.input || {};
  const t = i.text || i.selector || i.url || i.package || i.key || i.direction || (Array.isArray(i.steps) ? i.steps.length + ' steps' : '') || (i.x != null ? `(${i.x}, ${i.y})` : '');
  const name = String(s.name || '').replace(/^web_/, 'browser ').replace(/_/g, ' ');
  return `${name}${t ? ' ' + String(t).slice(0, 80) : ''}${s.ok === false ? ' (failed)' : ''}`.trim();
};

export function saveShot(run, base64, tag) {
  const file = `shots/${String(run.checks.length + run.steps.length).padStart(3, '0')}-${tag}.png`;
  fs.writeFileSync(path.join(runDir(run.id), file), Buffer.from(base64, 'base64'));
  return file;
}

export function addStep(run, step) { run.steps.push({ t: new Date().toISOString(), ...step }); if (run.steps.length % 5 === 0) save(run); }
export function progressOf(run) {
  const n = (k) => run.checks.filter(c => c.status === k).length;
  const done = run.checks.length;
  return { done, total: Math.max(run.total || 0, done), pass: n('pass'), fail: n('fail'), blocked: n('blocked') };
}
export function addCheck(run, check) {
  if (check.total) run.total = Math.max(run.total || 0, check.total);
  // The AI sometimes corrects a case it already reported ("marked blocked, not fail"): that replaces the earlier entry, it is not a new case.
  const same = (a, b) => (a.id && b.id ? String(a.id).toLowerCase() === String(b.id).toLowerCase() : String(a.title || '').trim().toLowerCase() === String(b.title || '').trim().toLowerCase());
  const at = run.checks.findIndex(c => same(c, check));
  const old = at >= 0 ? run.checks[at] : null;
  // The steps of a case: what the AI listed, otherwise the real actions recorded since the previous case (a correction keeps the steps of the original).
  if (!check.steps || !check.steps.length) {
    const from = run.stepMark || 0;
    const derived = run.steps.slice(from).filter(x => !/^(report_|finish_report)/.test(x.name)).map(stepText).slice(0, 25);
    check = { ...check, steps: derived.length ? derived : (old?.steps || []) };
  }
  run.stepMark = run.steps.length;
  if (old) {
    const merged = { ...old, t: new Date().toISOString() };
    for (const [k, v] of Object.entries(check)) if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) merged[k] = v;
    if (!check.screenshot && old.screenshot) merged.screenshot = old.screenshot;
    run.checks[at] = merged; save(run);
  } else {
    recorder.onCheck(check); run.checks.push({ t: new Date().toISOString(), ...check }); save(run);
  }
  // the project's context learns as the test goes, not only at the end (an interrupted run keeps what it found)
  if (run.projectId) import('../projects/store.js').then(m => m.updateContextFromRun(run)).catch(() => {});
}
// Every finished report is also written to <Downloads>\StreamFusion Reports as PDF + DOCX (SF_NO_AUTOSAVE=1 turns it off).
export const downloadsDir = () => (process.env.SF_NO_AUTOSAVE ? '' : path.join(process.env.SF_DOWNLOADS_DIR || path.join(os.homedir(), 'Downloads'), 'StreamFusion Reports'));
const platformOf = (run) => { const st = run.steps || []; const web = st.some(x => /^web_/.test(x.name || '')), app = st.some(x => x.name && !/^(web_|report_|finish_report)/.test(x.name)); return web && app ? 'App + Web' : web ? 'Web' : 'Android'; };
const fileBase = (run) => {
  const d = new Date(run.startedAt), p2 = (n) => String(n).padStart(2, '0');
  const safe = (String(run.title || 'Test report').replace(/\s*\(resumed\)\s*$/i, '') + ' - ' + platformOf(run)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
  return `${safe} - ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}-${p2(d.getMinutes())}`;
};
export async function exportToDownloads(run) {
  const dir = run.savedTo || downloadsDir(); if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const r = getRun(run.id) || run, base = path.join(dir, run.fileName || fileBase(run));
  fs.writeFileSync(base + '.pdf', await makePdf(r));
  fs.writeFileSync(base + '.docx', await makeDocx(r));
  return base;
}

export function finishRun(run, summary, reason) {
  run.finishedAt = new Date().toISOString(); run.summary = summary || run.summary;
  if (!run.fileName) run.fileName = fileBase(run); // fixed on the first finish: later saves of the same report overwrite the same files
  const f = run.checks.filter(c => c.status === 'fail').length;
  run.status = reason && reason !== 'complete' ? 'aborted' : f ? 'failed' : run.checks.length ? 'passed' : 'no-checks';
  if (run.checks.length) run.savedTo = downloadsDir();
  save(run);
  if (run.savedTo) exportToDownloads(run).catch(() => {}); // a copy of the PDF + DOCX lands in Downloads by itself
  if (run.projectId && run.checks.length) import('../projects/store.js').then(m => m.updateContextFromRun(run)).catch(() => {}); // the project's context file learns from every run
  recorder.finish(run.id);
}

// A run in which no test case was executed is not a report: remove it.
export function discardRun(run) { recorder.discard(run.id); try { fs.rmSync(runDir(run.id), { recursive: true, force: true }); } catch (e) {} }

export function listRuns() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs.readdirSync(REPORTS_DIR).filter(d => ID_RE.test(d) && fs.existsSync(path.join(runDir(d), 'run.json'))).sort().reverse().map(d => {
    let r; try { r = readRun(d); } catch (e) { return null; } // one unreadable report never hides the others
    const n = (s) => r.checks.filter(c => c.status === s).length;
    return { id: r.id, projectId: r.projectId || null, title: r.title, startedAt: r.startedAt, status: r.status, total: r.checks.length, planned: r.total || 0, pass: n('pass'), fail: n('fail'), blocked: n('blocked') };
  }).filter(x => x && (x.total > 0 || x.status === 'running'));
}
export const getRun = (id) => (ID_RE.test(id) && fs.existsSync(path.join(runDir(id), 'run.json')) ? readRun(id) : null);
export const shotPath = (id, rel) => { const p = path.join(runDir(id), rel); return ID_RE.test(id) && p.startsWith(runDir(id) + path.sep) && fs.existsSync(p) ? p : null; };

export { buildDocx, buildPdf, analyze } from './report.js';

// ---- what the AI may record about a check / the whole run (everything optional except title, status, evidence) ----
const str = (v, n) => String(v ?? '').slice(0, n);
const opt = (v, n) => (v === undefined || v === null || v === '' ? undefined : str(v, n));
const SEV = ['critical', 'major', 'minor', 'cosmetic'];
const CATS = ['functional', 'ui', 'ux', 'accessibility', 'performance', 'security', 'compatibility', 'content'];
const list = (v, n = 15, len = 220) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n;]/) : []).map(x => str(x, len).trim()).filter(Boolean).slice(0, n);

export function cleanCheck(i = {}) {
  return {
    id: opt(i.id, 30), total: Number.isFinite(Number(i.total)) && Number(i.total) > 0 ? Math.min(5000, Math.round(Number(i.total))) : undefined, title: str(i.title, 200), status: ['pass', 'fail', 'blocked'].includes(i.status) ? i.status : 'blocked', evidence: str(i.evidence, 3000),
    module: opt(i.module, 80), persona: opt(i.persona, 60), location: opt(i.location, 160), category: CATS.includes(i.category) ? i.category : undefined,
    severity: SEV.includes(i.severity) ? i.severity : undefined, steps: list(i.steps), expected: opt(i.expected, 600), actual: opt(i.actual, 1200), suggestion: opt(i.suggestion, 600),
    description: opt(i.description, 400), issues: list(i.issues, 10, 300), remark: opt(i.remark, 90)
  };
}
export function cleanExtras(b = {}) {
  const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  return {
    personas: arr(b.personas, 8).map(x => ({ name: str(x?.name, 60), goal: str(x?.goal || x?.notes, 300) })).filter(x => x.name),
    coverage: { tested: list(b.coverage?.tested, 60, 160), notTested: arr(b.coverage?.notTested, 60).map(x => ({ area: str(typeof x === 'string' ? x : x?.area, 160), reason: str(typeof x === 'string' ? '' : x?.reason, 300) })).filter(x => x.area) },
    defects: arr(b.defects, 60).map(d => ({ title: str(d?.title, 200), severity: SEV.includes(d?.severity) ? d.severity : 'minor', category: CATS.includes(d?.category) ? d.category : 'ui', location: str(d?.location, 160), steps: list(d?.steps), expected: str(d?.expected, 600), actual: str(d?.actual, 1200), persona: str(d?.persona, 60) })).filter(d => d.title),
    suggestions: arr(b.suggestions, 60).map(x => ({ type: str(typeof x === 'string' ? 'improvement' : x?.type, 30).toLowerCase() || 'improvement', text: str(typeof x === 'string' ? x : x?.text, 500), priority: ['high', 'medium', 'low'].includes(x?.priority) ? x.priority : undefined })).filter(x => x.text),
    risks: list(b.risks, 20, 300),
    features: arr(b.features, 30).map(x => ({ name: str(x?.name, 80), reach: str(x?.reach || x?.how_to_reach, 200), notes: list(x?.notes, 8, 200), testData: str(x?.testData || x?.test_data, 200) })).filter(x => x.name)
  };
}
