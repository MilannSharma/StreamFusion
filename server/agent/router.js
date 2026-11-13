import express from 'express';
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
      serial: b.serial, mode: b.mode === 'auto' ? 'auto' : 'ask', tools, emit, signal: ac.signal,
      baseURL: process.env.SF_ANTHROPIC_BASE_URL
    });
    res.end();
  });

  router.post('/approve', (req, res) => res.json({ success: resolveApproval(String(req.body?.id), !!req.body?.allow) }));
  router.post('/reset', (req, res) => { resetSession(String(req.body?.sessionId)); res.json({ success: true }); });
  return router;
}
