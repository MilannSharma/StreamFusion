// /api/automation — saved test cases per project, zero-token replay, parallel device runs, CI endpoint.
import express from 'express';
import yaml from 'js-yaml';
import { getProject, writeProject } from '../projects/store.js';
import { parseTest } from './format.js';
import { runMany, runTest, recordLastRun, junit } from './runner.js';
import { recordingOf } from './recorder.js';

const clip = (v, n) => String(v ?? '').slice(0, n);
const newId = () => 't-' + Math.random().toString(36).slice(2, 8);

// canonical YAML of a stored test (what the editor shows)
export function toYaml(t) {
  const steps = (t.steps || []).map(s => (s.plain ? s.plain : s.check ? { check: { ...(s.check.id ? { id: s.check.id } : {}), title: s.check.title } } : { tool: s.tool, args: s.args || {} }));
  return yaml.dump({ name: t.name, target: t.target, ...(t.description ? { description: t.description } : {}), steps }, { lineWidth: 140, flowLevel: 3 });
}

export function createAutomationRouter({ tools, runAdb }) {
  const router = express.Router();
  const adb = (serial, args, t) => runAdb(['-s', serial, ...args], t);
  const proj = (id) => getProject(String(id || ''));
  const view = (t) => ({ id: t.id, name: t.name, target: t.target, description: t.description || '', steps: t.steps.length, needsAi: t.steps.filter(s => s.plain).length, checks: t.steps.filter(s => s.check || /assert/.test(s.tool || '')).length, source: t.source, updatedAt: t.updatedAt, lastRun: t.lastRun || null, yaml: toYaml(t) });

  // CI: run a YAML/JSON file directly, no project needed
  router.post('/adhoc/run', async (req, res) => {
    const b = req.body || {};
    const t = parseTest(String(b.source || ''), b.target === 'phone' ? 'phone' : 'web');
    if (t.errors.length) return res.json({ success: false, message: t.errors.join(' ') });
    if (t.needsAi) return res.json({ success: false, message: t.needsAi + ' step(s) are plain English that StreamFusion cannot run without the AI. Record them once with the AI, or rewrite them (e.g. click "Login").' });
    const results = await runMany({ tools, tests: [{ id: 'adhoc', ...t }], serials: Array.isArray(b.serials) ? b.serials.filter(s => /^[\w.:-]+$/.test(s)) : [], shard: false, projectId: null, logins: String(b.logins || ''), adb });
    res.json({ success: true, passed: results.every(r => r.status === 'passed'), results, junit: junit(results, t.name) });
  });
  router.get('/:pid/tests', (req, res) => { const p = proj(req.params.pid); p ? res.json({ success: true, tests: (p.tests || []).map(view) }) : res.status(404).json({ success: false, message: 'Project not found' }); });

  // create / update a test from YAML, JSON or plain English text
  router.post('/:pid/tests', (req, res) => {
    const p = proj(req.params.pid); if (!p) return res.status(404).json({ success: false, message: 'Project not found' });
    const b = req.body || {};
    const t = parseTest(String(b.source || ''), b.target === 'phone' ? 'phone' : 'web');
    if (t.errors.length) return res.json({ success: false, message: t.errors.join(' ') });
    p.tests = p.tests || [];
    const existing = b.id && p.tests.find(x => x.id === b.id);
    const rec = { id: existing?.id || newId(), name: clip(b.name || t.name, 100), target: t.target, description: t.description, steps: t.steps, source: existing?.source || 'file', updatedAt: new Date().toISOString(), lastRun: existing?.lastRun || null };
    if (existing) Object.assign(existing, rec); else p.tests.push(rec);
    writeProject(p);
    res.json({ success: true, test: view(rec), needsAi: t.needsAi });
  });

  // save what the AI just did (a finished test-mode run) as an automated test
  router.post('/:pid/from-run', (req, res) => {
    const p = proj(req.params.pid); if (!p) return res.status(404).json({ success: false, message: 'Project not found' });
    const rec = recordingOf(String(req.body?.runId || ''));
    if (!rec) return res.json({ success: false, message: 'No recording for this run (it is kept until StreamFusion restarts).' });
    const name = clip(req.body?.name || 'Recorded test', 100);
    p.tests = p.tests || [];
    const t = { id: newId(), name, target: rec.target, description: 'Recorded from an AI run', steps: rec.steps, source: 'recorded', updatedAt: new Date().toISOString(), lastRun: null };
    const same = p.tests.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
    if (same >= 0) { t.id = p.tests[same].id; p.tests[same] = t; } else p.tests.push(t);
    writeProject(p);
    res.json({ success: true, test: view(t) });
  });
  router.get('/recording/:runId', (req, res) => { const r = recordingOf(req.params.runId); res.json({ success: true, available: !!r, steps: r ? r.steps.filter(s => s.tool).length : 0 }); });

  router.delete('/:pid/tests/:id', (req, res) => {
    const p = proj(req.params.pid); if (!p) return res.status(404).json({ success: false });
    p.tests = (p.tests || []).filter(t => t.id !== req.params.id); writeProject(p); res.json({ success: true });
  });

  // replay: { ids?: [..] (default all), serials?: [..], shard?: bool, logins?: string }
  router.post('/:pid/run', async (req, res) => {
    const p = proj(req.params.pid); if (!p) return res.status(404).json({ success: false, message: 'Project not found' });
    const b = req.body || {};
    const ids = Array.isArray(b.ids) && b.ids.length ? b.ids : null;
    const tests = (p.tests || []).filter(t => !ids || ids.includes(t.id));
    if (!tests.length) return res.json({ success: false, message: 'No tests to run.' });
    const results = await runMany({ tools, tests, serials: Array.isArray(b.serials) ? b.serials.filter(s => /^[\w.:-]+$/.test(s)) : [], shard: !!b.shard, projectId: p.id, logins: String(b.logins || ''), adb });
    for (const r of results) if (r.testId) recordLastRun(p.id, r.testId, r);
    const failed = results.filter(r => r.status !== 'passed').length;
    res.json({ success: true, passed: !failed, results, junit: b.junit ? junit(results, p.name) : undefined });
  });
  return router;
}
