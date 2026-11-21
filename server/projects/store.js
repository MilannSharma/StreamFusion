// Projects: everything about a product that should not have to be typed twice.
// One JSON file per project under %LOCALAPPDATA%\StreamFusion\projects. Logins are NOT stored here (the app keeps them in the OS-encrypted secrets store).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listRuns, getRun } from '../testmode/runs.js';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
const DIR = path.join(BASE, 'projects');
export const ID_RE = /^proj-[\w-]+$/;
const file = (id) => path.join(DIR, id + '.json');
const clip = (v, n) => String(v ?? '').slice(0, n);
const cleanFiles = (arr) => (Array.isArray(arr) ? arr : []).slice(0, 30).map(f => ({ name: clip(f.name, 120), text: clip(f.text, 200000) })).filter(f => f.name);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'project';

function read(id) { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch (e) { return null; } }
function write(p) {
  fs.mkdirSync(DIR, { recursive: true }); p.updatedAt = new Date().toISOString(); fs.writeFileSync(file(p.id), JSON.stringify(p, null, 1));
  try { if (p.context) fs.writeFileSync(path.join(DIR, p.id + '.context.md'), p.context); } catch (e) {} // the context is also a plain file you can open
  return p;
}
const all = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => read(f.slice(0, -5))).filter(Boolean) : []);

export const writeProject = write;
export const getProject = (id) => (ID_RE.test(id) ? read(id) : null);
export const deleteProject = (id) => { if (!ID_RE.test(id)) return false; try { fs.rmSync(file(id), { force: true }); return true; } catch (e) { return false; } };

export function runsOf(id) { return listRuns().filter(r => r.projectId === id); }

export function listProjects() {
  const runs = listRuns();
  return all().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(p => {
    const mine = runs.filter(r => r.projectId === p.id);
    return { id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, targets: p.targets, modules: p.modules.length, docs: p.docs.length, tests: (p.tests || []).length, runs: mine.length, lastRun: mine[0] ? { status: mine[0].status, at: mine[0].startedAt } : null };
  });
}

// What the AI should know from earlier runs of this project (failures first), so it does not start from zero.
export function historyOf(id) {
  const lines = [];
  for (const s of runsOf(id).slice(0, 3)) {
    const r = getRun(s.id); if (!r) continue;
    lines.push(`- ${String(r.startedAt).slice(0, 10)} "${r.title}": ${s.pass} passed, ${s.fail} failed, ${s.blocked} blocked`);
    for (const c of r.checks.filter(c => c.status !== 'pass').slice(0, 5)) lines.push(`    ${c.status.toUpperCase()} ${c.id || ''} ${c.title}: ${clip(c.evidence, 160)}`);
  }
  return lines.join('\n');
}

// Called when a test starts from the brief form: create the project the first time, then keep it up to date.
export function saveFromBrief({ projectId, world, brief = {}, files = [] }) {
  const name = clip(brief.product, 80).trim();
  if (!name) throw new Error('Product name is required');
  // A project picked earlier is only reused when the product name is still that project's name: typing another product never renames or mixes into it.
  const picked = projectId && getProject(projectId);
  let p = (picked && picked.name.toLowerCase() === name.toLowerCase() ? picked : null) || all().find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!p) p = { id: 'proj-' + slug(name) + '-' + Math.random().toString(36).slice(2, 6), name, createdAt: new Date().toISOString(), targets: { web: '', app: '' }, notes: '', docs: [], modules: [] };
  p.name = name;
  const target = clip(brief.target, 400).trim();
  if (target) p.targets[world === 'web' ? 'web' : 'app'] = target;
  if (brief.notes !== undefined) p.notes = clip(brief.notes, 50000);
  const docs = cleanFiles(files.filter(f => f.kind === 'docs'));
  for (const d of docs) { const i = p.docs.findIndex(x => x.name === d.name); if (i >= 0) p.docs[i] = d; else p.docs.push(d); }
  const modName = clip(brief.module, 80).trim();
  if (modName) {
    let m = p.modules.find(x => x.name.toLowerCase() === modName.toLowerCase());
    if (!m) { m = { name: modName, cases: '', files: [], updatedAt: '' }; p.modules.push(m); }
    m.cases = clip(brief.cases, 100000);
    const cf = cleanFiles(files.filter(f => f.kind === 'cases'));
    for (const f of cf) { const i = m.files.findIndex(x => x.name === f.name); if (i >= 0) m.files[i] = f; else m.files.push(f); }
    m.updatedAt = new Date().toISOString();
  }
  if (!p.context) p.context = renderContext(p); // first save: the context file starts with the basics, test runs fill it in
  return write(p);
}

// "Add project" on the Projects page: an empty project the user fills in later (files, cases, logins, notes)
export function createProject(name) {
  const n = clip(name, 80).trim();
  if (!n) throw new Error('Enter a project name');
  const dup = all().find(x => x.name.toLowerCase() === n.toLowerCase());
  if (dup) return dup;
  return write({ id: 'proj-' + slug(n) + '-' + Math.random().toString(36).slice(2, 6), name: n, createdAt: new Date().toISOString(), targets: { web: '', app: '' }, notes: '', docs: [], modules: [] });
}

// Edits made on the Projects page
export function updateProject(id, b = {}) {
  const p = getProject(id); if (!p) return null;
  if (b.name !== undefined) p.name = clip(b.name, 80).trim() || p.name;
  if (b.targets) p.targets = { web: clip(b.targets.web, 400), app: clip(b.targets.app, 400) };
  if (b.notes !== undefined) p.notes = clip(b.notes, 50000);
  if (Array.isArray(b.docs)) p.docs = cleanFiles(b.docs);
  if (b.context !== undefined) p.context = clip(b.context, 50000);
  if (Array.isArray(b.modules)) p.modules = b.modules.slice(0, 100).map(m => ({ name: clip(m.name, 80).trim(), cases: clip(m.cases, 100000), files: cleanFiles(m.files), updatedAt: new Date().toISOString() })).filter(m => m.name);
  return write(p);
}

// ---------- Project context: what this product is, who uses it, what was covered, known issues, what is still untested ----------
// Kept as markdown in the project (and as a real file: projects/<id>.context.md). The block between the markers is rewritten after
// every test run; anything the user writes outside the markers is never touched. The AI gets it in every new test brief.
const CTX_START = '<!-- sf:auto:start -->', CTX_END = '<!-- sf:auto:end -->';
const userPart = (text) => String(text || '').replace(/<!-- sf:auto:start -->[\s\S]*?<!-- sf:auto:end -->/, '').trim();
const same = (a, b) => { const x = String(a).toLowerCase().trim(), y = String(b).toLowerCase().trim(); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

export function renderContext(p) {
  const d = p.contextData || { features: {}, personas: {}, notTested: [], lastRun: null };
  const feats = Object.entries(d.features || {}).sort((a, b) => String(b[1].lastDate || '').localeCompare(String(a[1].lastDate || '')));
  const build = (nFeatures) => {
    const L = [`## Project context: ${p.name}`];
    const t = [p.targets?.web && 'Web: ' + p.targets.web, p.targets?.app && 'App: ' + p.targets.app].filter(Boolean).join(' · ');
    if (t) L.push(t);
    L.push('(Use this first: go straight to the known screens, re-check the open issues, do not rediscover what is written here.)');
    const per = Object.entries(d.personas || {});
    if (per.length) { L.push('', '### Who uses it (roles tested)'); per.forEach(([n, g]) => L.push(`- ${n}${g ? ': ' + g : ''}`)); }
    if (feats.length) {
      L.push('', '### Features (known per feature)');
      for (const [n, f] of feats.slice(0, nFeatures)) {
        L.push('', `#### ${n}`);
        const meta = [f.lastDate && 'last tested ' + f.lastDate, f.runs && f.runs + ' run' + (f.runs > 1 ? 's' : ''), f.cases && `${f.pass || 0} pass / ${f.fail || 0} fail / ${f.blocked || 0} blocked in the last run`].filter(Boolean).join(' · ');
        if (meta) L.push(meta);
        if (f.reach) L.push('How to reach: ' + f.reach);
        if (f.testData) L.push('Test data that worked: ' + f.testData);
        const cl = (f.caseList || []).slice().sort((x, y) => (x.status === 'pass') - (y.status === 'pass')).slice(0, 12);
        if (cl.length) L.push('Cases: ' + cl.map(c => `${c.id ? c.id + ' ' : ''}${c.title} [${String(c.status).toUpperCase()}]`).join('; '));
        if (f.issues?.length) { L.push('Open issues (re-check these):'); f.issues.slice(0, 8).forEach(i => L.push(`- [${i.severity}] ${i.title}${i.location ? ' (' + i.location + ')' : ''}, since ${i.since}`)); }
        if (f.fixed?.length) L.push('Recently fixed: ' + f.fixed.slice(0, 4).map(x => x.title).join('; '));
        if (f.notes?.length) { L.push('Tips and quirks:'); f.notes.slice(0, 8).forEach(x => L.push('- ' + x)); }
      }
      if (feats.length > nFeatures) L.push('', `(${feats.length - nFeatures} older features not shown here; they are still saved in the project.)`);
    }
    if (d.notTested?.length) { L.push('', '### Not tested yet'); d.notTested.slice(0, 20).forEach(n => L.push(`- ${n.area}${n.reason ? ' (' + n.reason + ')' : ''}`)); }
    if (d.lastRun) L.push('', `Last run: ${d.lastRun.date} · ${d.lastRun.pass} pass / ${d.lastRun.fail} fail / ${d.lastRun.blocked} blocked`);
    return L.join('\n');
  };
  let k = feats.length, body = build(k);
  while (body.length > 12000 && k > 3) body = build(--k); // keeps what the AI receives small: the most recently tested features win
  const auto = CTX_START + '\n' + body + '\n' + CTX_END;
  const mine = userPart(p.context);
  return auto + (mine ? '\n\n' + mine : '');
}

// Merge one run into the project's memory. Safe to call after every single check (it is also called when the run ends):
// cases and issues are keyed, so repeating it never duplicates anything, and a run is counted once.
export function updateContextFromRun(run) {
  if (!run?.projectId || !run.checks?.length) return null;
  const p = getProject(run.projectId); if (!p) return null;
  const d = p.contextData || { features: {}, personas: {}, notTested: [], lastRun: null };
  d.features ||= {}; d.personas ||= {}; delete d.issues; // issues now live inside each feature
  const rep = run.report || {};
  const date = String(run.startedAt).slice(0, 10);
  const firstTime = d.lastRun?.id !== run.id;
  const featureKey = (name) => { const n = clip(name || 'General', 80); return Object.keys(d.features).find(k => k.toLowerCase() === n.toLowerCase()) || Object.keys(d.features).find(k => same(k, n)) || n; };
  const feat = (name) => { const k = featureKey(name); return (d.features[k] ||= { cases: 0, pass: 0, fail: 0, blocked: 0 }); };
  const caseKey = (c) => String(c.id || c.title || '').toLowerCase().trim().slice(0, 80);

  const stats = new Map();
  for (const c of run.checks) {
    const k = featureKey(c.module);
    const st = stats.get(k) || { cases: 0, pass: 0, fail: 0, blocked: 0 };
    st.cases++; st[c.status] = (st[c.status] || 0) + 1; stats.set(k, st);
    if (c.persona && !(c.persona in d.personas)) d.personas[clip(c.persona, 60)] = '';
    const f = feat(c.module);
    f.caseList ||= []; f.issues ||= []; f.fixed ||= [];
    const key = caseKey(c);
    const entry = { id: clip(c.id, 30), title: clip(c.title, 120), status: c.status, date };
    const ci = f.caseList.findIndex(x => caseKey(x) === key);
    if (ci >= 0) f.caseList[ci] = entry; else f.caseList.push(entry);
    if (f.caseList.length > 40) f.caseList = f.caseList.slice(-40);
    const ii = f.issues.findIndex(x => x.key === key);
    if (c.status !== 'pass') {
      const issue = { key, title: clip(c.title, 140), severity: c.severity || (c.status === 'fail' ? 'major' : 'minor'), location: clip(c.location || '', 100), since: ii >= 0 ? f.issues[ii].since : date };
      if (ii >= 0) f.issues[ii] = issue; else f.issues.push(issue);
    } else if (ii >= 0) { // passes now: the problem is fixed
      const [gone] = f.issues.splice(ii, 1);
      f.fixed = [{ title: gone.title, date }, ...f.fixed.filter(x => x.title !== gone.title)].slice(0, 5);
    }
  }
  for (const [k, st] of stats) { const f = d.features[k]; Object.assign(f, st); f.lastDate = date; if (firstTime) f.runs = (f.runs || 0) + 1; }

  for (const t of rep.coverage?.tested || []) if (!Object.keys(d.features).some(k => same(k, t))) d.features[clip(t, 80)] = { cases: 0, pass: 0, fail: 0, blocked: 0, lastDate: date };
  for (const x of rep.personas || []) if (x.name) d.personas[clip(x.name, 60)] = clip(x.goal || d.personas[x.name] || '', 200);
  for (const x of rep.defects || []) { // problems seen while a case still passed
    const f = feat(Object.keys(d.features).find(k => same(k, x.location)) || 'General'); f.issues ||= [];
    const key = 'obs:' + String(x.title).toLowerCase().slice(0, 70);
    const issue = { key, title: clip(x.title, 140), severity: x.severity || 'minor', location: clip(x.location, 100), since: f.issues.find(i => i.key === key)?.since || date };
    const i = f.issues.findIndex(y => y.key === key); if (i >= 0) f.issues[i] = issue; else f.issues.push(issue);
  }
  for (const x of rep.features || []) { // what the AI learned about getting around each feature
    if (!x?.name) continue;
    const f = feat(x.name);
    if (x.reach) f.reach = clip(x.reach, 200);
    if (x.testData) f.testData = clip(x.testData, 200);
    const notes = [...(x.notes || []), ...(f.notes || [])];
    f.notes = notes.filter((n, i) => notes.findIndex(m => same(m, n)) === i).slice(0, 8);
  }
  const gaps = [...(d.notTested || []), ...(rep.coverage?.notTested || [])];
  d.notTested = gaps.filter((n, i) => gaps.findIndex(m => same(m.area, n.area)) === i && !Object.keys(d.features).some(k => same(k, n.area) && d.features[k].cases > 0)).slice(0, 40);
  const pass = run.checks.filter(c => c.status === 'pass').length, fail = run.checks.filter(c => c.status === 'fail').length;
  d.lastRun = { id: run.id, date, pass, fail, blocked: run.checks.length - pass - fail };
  p.contextData = d;
  p.context = renderContext(p);
  return write(p);
}
