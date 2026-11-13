import express from 'express';
import * as web from './tools.js';

export function createWebRouter({ runAdb } = {}) {
  const router = express.Router();
  const TOOLS = web.createWebTools({ runAdb });
  router.TOOLS = TOOLS;

  router.get('/status', (req, res) => res.json({ success: true, installed: web.isInstalled(), isInstalling: web.state.installing, stage: web.state.stage, error: web.state.error, open: web.isOpen(), headless: web.state.headless, device: web.state.device, mode: web.state.mode }));
  router.get('/devices', (req, res) => res.json({ success: true, devices: web.listDevices() }));
  router.post('/install', (req, res) => { web.install(); res.json({ success: true }); });
  router.post('/config', async (req, res) => { await web.configure({ headless: req.body?.headless, device: req.body?.device }); res.json({ success: true }); });
  router.post('/attach-chrome', async (req, res) => { try { res.json({ success: true, ...(await web.attachDesktop()) }); } catch (e) { res.json({ success: false, error: e.message }); } });
  router.post('/close', async (req, res) => { await web.closeBrowser(); res.json({ success: true }); });

  router.get('/tools', (req, res) => res.json({ success: true, tools: Object.values(TOOLS).map(({ handler, ...t }) => t) }));
  router.post('/tool/:name', async (req, res) => {
    const tool = TOOLS[req.params.name];
    if (!tool) return res.status(404).json({ ok: false, error: 'Unknown tool' });
    const args = req.body || {};
    for (const k of tool.inputSchema.required) if (args[k] === undefined || args[k] === null) return res.status(400).json({ ok: false, error: 'Missing argument: ' + k });
    res.json(await tool.handler(args));
  });
  return router;
}
