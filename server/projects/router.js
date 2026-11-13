import express from 'express';
import { listProjects, getProject, saveFromBrief, updateProject, deleteProject, runsOf, historyOf } from './store.js';

export function createProjectsRouter() {
  const router = express.Router();
  router.get('/', (req, res) => res.json({ success: true, projects: listProjects() }));
  router.get('/:id', (req, res) => { const p = getProject(req.params.id); p ? res.json({ success: true, project: p, runs: runsOf(p.id) }) : res.status(404).json({ success: false, message: 'Not found' }); });
  // Create or update a project from the Test brief form. Returns what earlier runs found, as context for the AI.
  router.post('/save', (req, res) => {
    try { const p = saveFromBrief({ projectId: String(req.body?.projectId || ''), world: req.body?.world, brief: req.body?.brief, files: req.body?.files }); res.json({ success: true, projectId: p.id, project: p, history: historyOf(p.id) }); }
    catch (e) { res.status(400).json({ success: false, message: e.message }); }
  });
  router.put('/:id', (req, res) => { const p = updateProject(req.params.id, req.body); p ? res.json({ success: true, project: p }) : res.status(404).json({ success: false, message: 'Not found' }); });
  router.delete('/:id', (req, res) => res.json({ success: deleteProject(req.params.id) }));
  return router;
}
