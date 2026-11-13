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
function write(p) { fs.mkdirSync(DIR, { recursive: true }); p.updatedAt = new Date().toISOString(); fs.writeFileSync(file(p.id), JSON.stringify(p, null, 1)); return p; }
const all = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => read(f.slice(0, -5))).filter(Boolean) : []);

export const getProject = (id) => (ID_RE.test(id) ? read(id) : null);
export const deleteProject = (id) => { if (!ID_RE.test(id)) return false; try { fs.rmSync(file(id), { force: true }); return true; } catch (e) { return false; } };

export function runsOf(id) { return listRuns().filter(r => r.projectId === id); }

export function listProjects() {
  const runs = listRuns();
  return all().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(p => {
    const mine = runs.filter(r => r.projectId === p.id);
    return { id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, targets: p.targets, modules: p.modules.length, docs: p.docs.length, runs: mine.length, lastRun: mine[0] ? { status: mine[0].status, at: mine[0].startedAt } : null };
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
  let p = (projectId && getProject(projectId)) || all().find(x => x.name.toLowerCase() === name.toLowerCase());
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
  return write(p);
}

// Edits made on the Projects page
export function updateProject(id, b = {}) {
  const p = getProject(id); if (!p) return null;
  if (b.name !== undefined) p.name = clip(b.name, 80).trim() || p.name;
  if (b.targets) p.targets = { web: clip(b.targets.web, 400), app: clip(b.targets.app, 400) };
  if (b.notes !== undefined) p.notes = clip(b.notes, 50000);
  if (Array.isArray(b.docs)) p.docs = cleanFiles(b.docs);
  if (Array.isArray(b.modules)) p.modules = b.modules.slice(0, 100).map(m => ({ name: clip(m.name, 80).trim(), cases: clip(m.cases, 100000), files: cleanFiles(m.files), updatedAt: new Date().toISOString() })).filter(m => m.name);
  return write(p);
}
