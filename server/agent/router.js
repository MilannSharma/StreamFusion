import express from 'express';
import { listRuns, getRun, shotPath, buildDocx, buildPdf } from '../testmode/runs.js';
import { runAgent, resolveApproval, resetSession, MODELS } from './agent.js';

export function createAgentRouter({ tools }) {
  const router = express.Router();

  router.get('/models', (req, res) => res.json({ success: true, models: MODELS }));

  // NDJSON stream: one JSON event per line. Closing the connection stops the agent.
  router.post('/chat', async (req, res) => {
    const b = req.body || {};
    if (!b.message || !b.sessionId || !/^[\w.:-]+$/.test(String(b.serial || ''))) {
      return res.status(400).json({ success: false, message: 'sessionId, message and serial are required' });
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const emit = (ev) => { if (!res.writableEnded) res.write(JSON.stringify(ev) + '\n'); };
    await runAgent({
      sessionId: String(b.sessionId), message: String(b.message), apiKey: b.apiKey, model: b.model, effort: b.effort,
      testMode: b.testMode ? { title: String(b.testMode.title || '').slice(0, 120), attachments: (Array.isArray(b.testMode.attachments) ? b.testMode.attachments : []).slice(0, 10).map(a => ({ name: String(a.name || 'file').slice(0, 120) })) } : null,
      serial: b.serial, mode: b.mode === 'auto' ? 'auto' : 'ask', tools, emit, signal: ac.signal,
      baseURL: process.env.SF_ANTHROPIC_BASE_URL
    });
    res.end();
  });

  // Test reports
  router.get('/reports', (req, res) => res.json({ success: true, runs: listRuns() }));
  router.get('/reports/:id', (req, res) => { const r = getRun(req.params.id); r ? res.json({ success: true, run: r }) : res.status(404).json({ success: false, message: 'Not found' }); });
  router.get('/reports/:id/shot', (req, res) => { const p = shotPath(req.params.id, String(req.query.f || '')); p ? res.sendFile(p) : res.status(404).end(); });
  router.get('/reports/:id/:fmt(docx|pdf|json)', async (req, res) => {
    const r = getRun(req.params.id); if (!r) return res.status(404).json({ success: false, message: 'Not found' });
    const fmt = req.params.fmt;
    const types = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', json: 'application/json' };
    try {
      const buf = fmt === 'docx' ? await buildDocx(r) : fmt === 'pdf' ? await buildPdf(r) : Buffer.from(JSON.stringify(r, null, 1));
      res.setHeader('Content-Type', types[fmt]); res.setHeader('Content-Disposition', 'attachment; filename="' + r.id + '.' + fmt + '"'); res.send(buf);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  router.post('/approve', (req, res) => res.json({ success: resolveApproval(String(req.body?.id), !!req.body?.allow) }));
  router.post('/reset', (req, res) => { resetSession(String(req.body?.sessionId)); res.json({ success: true }); });
  return router;
}
