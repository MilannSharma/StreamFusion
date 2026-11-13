import express from 'express';
import { createTools } from './tools.js';

// REST face of the device tool registry: GET /api/device/tools, POST /api/device/tool/:name
export function createDeviceRouter({ runAdb, adbExe, scrcpyBin }) {
  const router = express.Router();
  const TOOLS = createTools({ runAdb, adbExe, cwd: scrcpyBin });

  router.get('/tools', (req, res) => {
    res.json({ success: true, tools: Object.values(TOOLS).map(({ handler, ...t }) => t) });
  });

  router.post('/tool/:name', async (req, res) => {
    const tool = TOOLS[req.params.name];
    if (!tool) return res.status(404).json({ ok: false, error: 'Unknown tool' });
    const args = req.body || {};
    if (!/^[\w.:-]+$/.test(String(args.serial || ''))) return res.status(400).json({ ok: false, error: 'serial is required' });
    for (const k of tool.inputSchema.required) {
      if (args[k] === undefined || args[k] === null || args[k] === '') return res.status(400).json({ ok: false, error: `Missing argument: ${k}` });
    }
    try { res.json(await tool.handler(args)); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Convenience for <img src>: /api/device/screenshot.png?serial=emulator-5554
  router.get('/screenshot.png', async (req, res) => {
    const r = await TOOLS.screenshot.handler({ serial: String(req.query.serial || ''), maxDim: req.query.maxDim });
    if (!r.ok) return res.status(500).json(r);
    res.type('png').send(Buffer.from(r.imageBase64, 'base64'));
  });

  router.TOOLS = TOOLS;
  return router;
}
