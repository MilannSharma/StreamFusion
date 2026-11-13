import express from 'express';
import { spawn } from 'child_process';
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

  // Live screen: raw H.264 from the phone's screenrecord (about 100 ms behind, 30 fps) instead of 3-second screencap grabs.
  // The browser decodes it with WebCodecs. screenrecord stops after 3 minutes; the client simply reconnects.
  router.get('/stream.h264', (req, res) => {
    const serial = String(req.query.serial || '');
    if (!/^[\w.:-]+$/.test(serial)) return res.status(400).end();
    const w = Math.max(16, Math.min(1080, parseInt(req.query.w, 10) || 540)), h = Math.max(16, Math.min(2400, parseInt(req.query.h, 10) || 1204));
    const bit = Math.max(1, Math.min(12, Number(req.query.mbps) || 4)) * 1000000;
    const p = spawn(adbExe, ['-s', serial, 'exec-out', 'screenrecord', '--output-format=h264', '--size', w + 'x' + h, '--bit-rate', String(bit), '--time-limit', '180', '-'], { cwd: scrcpyBin, windowsHide: true });
    res.setHeader('Content-Type', 'video/h264'); res.setHeader('Cache-Control', 'no-store');
    let got = 0, err = '';
    p.stdout.on('data', (d) => { got += d.length; res.write(d); });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => { if (!res.writableEnded) { if (!got) res.statusCode = 502; res.end(); } });
    p.on('error', () => { try { res.status(500).end(); } catch (e) {} });
    res.on('close', () => { try { p.kill(); } catch (e) {} });
  });

  router.TOOLS = TOOLS;
  return router;
}
