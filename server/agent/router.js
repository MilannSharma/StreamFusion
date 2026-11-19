import express from 'express';
import { setContext } from '../automation/assertions.js';
import { loginTokens } from '../automation/format.js';
import { listRuns, getRun, shotPath, buildDocx, buildPdf, discardRun, createRun, saveShot, addCheck, finishRun, cleanCheck, cleanExtras } from '../testmode/runs.js';
import { WORLD_PROMPT } from './agent.js';
import { authStatus, startLogin, logout, installMcp, runClaudeCli, resetCliSession, installClaude } from './claude-cli.js';
import { lastWorld } from '../mcp/activity.js';
import { extractText } from './extract.js';
import { listChats, getChat, saveChat, deleteChat, renameChat } from './chats.js';
import { runAgent, resolveApproval, resetSession, MODELS } from './agent.js';

export function createAgentRouter({ tools }) {
  const router = express.Router();
  let current = null; // the open test-report run (in-app Test mode, or started by an external MCP client with report_begin)
  // A chat belongs to one world: the browser page only gets web_* tools, the phone page only device tools.
  const isWebTool = (n) => n.startsWith('web_');
  const worldTools = (world) => (world === 'web' ? Object.fromEntries(Object.entries(tools).filter(([n]) => isWebTool(n))) : world === 'phone' ? Object.fromEntries(Object.entries(tools).filter(([n]) => !isWebTool(n))) : tools);
  const isRealPhone = (serial) => !/^emulator-/.test(String(serial || ''));
  const REAL_PHONE = (serial) => `

The user chose their REAL phone (serial ${serial}). Work only on it: pass serial "${serial}" to every device tool. Never call emulator_start, emulator_status or emulator_stop and never start the Android emulator.`;
  const otherWorldNames = (world, serial) => (world === 'phone' && isRealPhone(serial) ? Object.keys(tools).filter(isWebTool).concat(['emulator_start', 'emulator_status', 'emulator_stop']) : world === 'web' ? Object.keys(tools).filter(n => !isWebTool(n)).concat(['emulator_start', 'emulator_status', 'emulator_stop']) : world === 'phone' ? Object.keys(tools).filter(isWebTool) : []);
  const dangerousNames = () => Object.values(tools).filter(t => t.dangerous).map(t => t.name);
  const closeRun = (reason, emit) => { if (!current) return; const r = current; current = null; if (!r.checks.length) { discardRun(r); emit?.({ type: 'no_report' }); return; } finishRun(r, r.summary, reason); emit?.({ type: 'report_ready', runId: r.id, status: r.status, savedTo: r.savedTo }); };

  router.get('/models', (req, res) => res.json({ success: true, models: MODELS }));

  // NDJSON stream: one JSON event per line. Closing the connection stops the agent.
  const chatHandler = async (req, res) => {
    const b = req.body || {};
    if (!b.message || !b.sessionId || !/^[\w.:-]+$/.test(String(b.serial || ''))) {
      return res.status(400).json({ success: false, message: 'sessionId, message and serial are required' });
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const emit = (ev) => { if (!res.writableEnded) res.write(JSON.stringify(ev) + '\n'); };
    if (b.testMode) setContext({ projectId: b.testMode.projectId || null, loginTokens: loginTokens(b.testMode.logins), world: b.world, serial: b.serial });
    if (b.engine === 'claude') {
      let run = null;
      if (b.testMode) {
        closeRun('aborted');
        let deviceInfo = null;
        try { const d = await tools.device_info?.handler({ serial: b.serial }); if (d?.ok) deviceInfo = { model: d.model, androidVersion: d.androidVersion || d.release }; } catch (e) {}
        run = createRun({ title: String(b.testMode.title || '').slice(0, 120), model: 'Claude Code', serial: b.serial, attachments: (Array.isArray(b.testMode.attachments) ? b.testMode.attachments : []).slice(0, 10).map(a => ({ name: String(a.name || 'file').slice(0, 120) })), instructions: String(b.testMode.summary || '').slice(0, 4000), deviceInfo, projectId: b.testMode.projectId ? String(b.testMode.projectId) : null });
        current = run;
        emit({ type: 'run_started', runId: run.id });
      }
      let reason = 'complete';
      const wrap = (ev) => { if (ev.type === 'done') reason = ev.reason; if (ev.type === 'error') reason = 'error'; emit(ev); };
      await runClaudeCli({ sessionId: String(b.sessionId), message: String(b.message), serial: b.serial, mode: b.mode === 'auto' ? 'auto' : 'ask', model: b.model, testMode: !!run, dangerousNames: dangerousNames(), blockedNames: otherWorldNames(b.world, b.serial), worldPrompt: (WORLD_PROMPT[b.world] || '') + (b.world === 'phone' && isRealPhone(b.serial) ? REAL_PHONE(b.serial) : ''), emit: wrap, signal: ac.signal });
      if (run) { if (current === run) closeRun(reason, emit); else if (run.checks.length) emit({ type: 'report_ready', runId: run.id, status: run.status, savedTo: run.savedTo }); else { discardRun(run); emit({ type: 'no_report' }); } } // the AI may have finished it itself with report_finish
      return res.end();
    }
    await runAgent({
      sessionId: String(b.sessionId), message: String(b.message), apiKey: b.apiKey, model: b.model, effort: b.effort,
      testMode: b.testMode ? { title: String(b.testMode.title || '').slice(0, 120), summary: String(b.testMode.summary || ''), projectId: b.testMode.projectId ? String(b.testMode.projectId) : null, attachments: (Array.isArray(b.testMode.attachments) ? b.testMode.attachments : []).slice(0, 10).map(a => ({ name: String(a.name || 'file').slice(0, 120) })) } : null,
      serial: b.serial, mode: b.mode === 'auto' ? 'auto' : 'ask', tools: worldTools(b.world), world: b.world, emit, signal: ac.signal,
      baseURL: process.env.SF_ANTHROPIC_BASE_URL
    });
    res.end();
  };
  router.post('/chat', (req, res) => chatHandler(req, res).catch(e => {
    console.error('[agent] chat failed:', e);
    try { if (!res.headersSent) res.status(500).json({ success: false, message: e.message || 'Agent failed' }); else { res.write(JSON.stringify({ type: 'error', message: e.message || 'Agent failed' }) + String.fromCharCode(10)); res.end(); } } catch (x) {}
  }));

  // Saved chats (history + resume)
  router.get('/chats', (req, res) => res.json({ success: true, chats: listChats(req.query.world ? String(req.query.world) : '') }));
  router.get('/chats/:id', (req, res) => { const c = getChat(req.params.id); c ? res.json({ success: true, chat: c }) : res.status(404).json({ success: false, message: 'Not found' }); });
  router.put('/chats/:id', (req, res) => { try { saveChat(req.params.id, req.body || {}); res.json({ success: true }); } catch (e) { res.status(400).json({ success: false, message: e.message }); } });
  router.post('/chats/:id/rename', (req, res) => res.json({ success: renameChat(req.params.id, req.body?.title) }));
  router.delete('/chats/:id', (req, res) => res.json({ success: deleteChat(req.params.id) }));

  // Test reports
  router.get('/reports',(req, res) => res.json({ success: true, runs: listRuns() }));
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

  // Text of an uploaded test document (.docx is unzipped; text formats as is)
  router.post('/extract', (req, res) => { try { res.json({ success: true, text: extractText(String(req.body?.name || ''), req.body?.base64).slice(0, 200000) }); } catch (e) { res.json({ success: false, message: e.message }); } });
  router.post('/approve', (req, res) => res.json({ success: resolveApproval(String(req.body?.id), !!req.body?.allow) }));
  router.post('/reset', (req, res) => { resetSession(String(req.body?.sessionId)); resetCliSession(String(req.body?.sessionId)); res.json({ success: true }); });

  // Sign in with the installed Claude Code (no API key)
  router.get('/claude/status', async (req, res) => res.json({ success: true, ...(await authStatus(req.query.force === '1')) }));
  router.post('/claude/login', async (req, res) => { const st = await authStatus(true); if (!st.installed) return res.json({ success: false, message: 'Claude Code is not installed.' }); const r = startLogin({ console: !!req.body?.console }); res.json({ success: r.started, message: r.reason }); });
  router.post('/claude/install', (req, res) => { installClaude(); res.json({ success: true }); });
  router.post('/claude/logout', async (req, res) => res.json({ success: await logout() }));
  router.post('/claude/install-mcp', async (req, res) => { const r = await installMcp(parseInt(process.env.SF_PORT || '3001', 10)); res.json({ success: r.ok, message: r.output }); });

  // Test reports written by an AI that drives StreamFusion over MCP (report_begin / report_check / report_finish)
  router.post('/report/begin', async (req, res) => {
    closeRun('aborted');
    const serial = String(req.body?.serial || 'emulator-5554');
    let deviceInfo = null;
    try { const d = await tools.device_info?.handler({ serial }); if (d?.ok) deviceInfo = { model: d.model, androidVersion: d.androidVersion || d.release }; } catch (e) {}
    current = createRun({ title: String(req.body?.title || 'Test run').slice(0, 120), model: String(req.body?.client || 'MCP client'), serial, instructions: String(req.body?.instructions || '').slice(0, 4000), deviceInfo });
    res.json({ ok: true, runId: current.id });
  });
  router.post('/report/check', async (req, res) => {
    if (!current) return res.json({ ok: false, error: 'No open report. Call report_begin first (or turn on Test mode in StreamFusion).' });
    const b = req.body || {};
    const status = ['pass', 'fail', 'blocked'].includes(b.status) ? b.status : 'blocked';
    const world = b.world === 'web' || b.world === 'phone' ? b.world : lastWorld();
    let shot = null;
    try { const sc = world === 'web' && tools.web_screenshot ? await tools.web_screenshot.handler({}) : await tools.screenshot.handler({ serial: current.serial, maxDim: 700 }); if (sc.ok) shot = saveShot(current, sc.imageBase64, status); } catch (e) {}
    addCheck(current, { ...cleanCheck({ ...b, status }), screenshot: shot });
    res.json({ ok: true, recorded: current.checks.length, screenshot: !!shot });
  });
  router.post('/report/finish', async (req, res) => {
    if (!current) return res.json({ ok: false, error: 'No open report.' });
    const r = current; r.summary = String(req.body?.summary || ''); r.report = cleanExtras(req.body || {}); closeRun('complete');
    res.json({ ok: true, runId: r.id, status: r.status, pdf: '/api/agent/reports/' + r.id + '/pdf', docx: '/api/agent/reports/' + r.id + '/docx' });
  });
  return router;
}
