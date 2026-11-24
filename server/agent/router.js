import express from 'express';
import fs from 'fs';
import path from 'path';
import { setContext, getContext } from '../automation/assertions.js';
import { loginTokens } from '../automation/format.js';
import { listRuns, getRun, shotPath, REPORTS_DIR, buildDocx, buildPdf, discardRun, createRun, saveShot, addCheck, finishRun, cleanCheck, cleanExtras , progressOf , findRunBySession, reopenRun, addStep, surfaceSince, reportFileName, setPriorIssues } from '../testmode/runs.js';
import { WORLD_PROMPT } from './agent.js';
import { authStatus, startLogin, logout, installMcp, runClaudeCli, resetCliSession, installClaude } from './claude-cli.js';
import { lastWorld } from '../mcp/activity.js';
import { extractText } from './extract.js';
import { listChats, getChat, saveChat, deleteChat, renameChat } from './chats.js';
import { runAgent, resolveApproval, resetSession, MODELS } from './agent.js';
import { setActiveRun, attachEvidence, frame } from '../testmode/evidence.js';
import { startRunCollectors, stopRunCollectors } from '../testmode/collectors/index.js';
import { getSettings, saveSettings } from '../testmode/collectors/netproxy.js';
import { appInfo } from '../testmode/report.js';
import { openIssuesOf } from '../projects/store.js';
import { setWebBackground, shutdownBackgroundBrowser } from '../web/tools.js';

// A built PDF / DOCX is kept next to the run and reused until run.json changes (opening or downloading again is instant)
const CACHE_VER = 'v3';
async function cachedBuild(run, fmt) {
  const dir = path.join(REPORTS_DIR, run.id), cache = path.join(dir, `cache-${CACHE_VER}.${fmt}`), src = path.join(dir, 'run.json');
  try { if (fs.statSync(cache).mtimeMs >= fs.statSync(src).mtimeMs) return fs.readFileSync(cache); } catch (e) {}
  const buf = fmt === 'docx' ? await buildDocx(run) : await buildPdf(run);
  if (run.status !== 'running') { try { fs.writeFileSync(cache, buf); } catch (e) {} }
  return buf;
}

export function createAgentRouter({ tools }) {
  const router = express.Router();
  // A screenshot the AI takes itself during a test is kept as evidence too (it used to be thrown away).
  for (const [n, world] of [['screenshot', 'phone'], ['web_screenshot', 'web']]) {
    const t = tools[n]; if (!t || t.__hooked) continue; const orig = t.handler; t.__hooked = true;
    t.handler = async (a) => { const r = await orig(a); if (r?.ok && !a?.__noFrame) frame({ base64: r.imageBase64, world, caseId: '', note: 'screenshot' }); return r; };
  }
  let chatRun = null; // the report of the chat turn that is running now (its checks keep landing here even if the AI calls report_finish early)
  let current = null; // the open test-report run (in-app Test mode, or started by an external MCP client with report_begin)
  // A chat belongs to one world: the browser page only gets web_* tools, the phone page only device tools.
  const isWebTool = (n) => n.startsWith('web_');
  const worldTools = (world) => (world === 'web' ? Object.fromEntries(Object.entries(tools).filter(([n]) => isWebTool(n))) : tools); // the phone page also gets the web_* tools: they run hidden, to cross-check on the website what the app did
  const isRealPhone = (serial) => !/^emulator-/.test(String(serial || ''));
  const REAL_PHONE = (serial) => `

The user chose their REAL phone (serial ${serial}). Work only on it: pass serial "${serial}" to every device tool. Never call emulator_start, emulator_status or emulator_stop and never start the Android emulator.`;
  const otherWorldNames = (world, serial) => (world === 'phone' && isRealPhone(serial) ? ['emulator_start', 'emulator_status', 'emulator_stop'] : world === 'web' ? Object.keys(tools).filter(n => !isWebTool(n)).concat(['emulator_start', 'emulator_status', 'emulator_stop']) : []);
  const dangerousNames = () => Object.values(tools).filter(t => t.dangerous).map(t => t.name);
  const closeRun = async (reason, emit) => { if (!current) return; const r = current; current = null; setActiveRun(null); await stopRunCollectors(r).catch(() => {}); if (!r.checks.length) { discardRun(r); emit?.({ type: 'no_report' }); return; } finishRun(r, r.summary, reason); emit?.({ type: 'report_ready', runId: r.id, status: r.status, savedTo: r.savedTo }); };

  // Settings for the automatic checks (capturing API traffic on a REAL phone is opt-in)
  router.get('/settings', (req, res) => res.json({ success: true, settings: getSettings() }));
  router.post('/settings', (req, res) => res.json({ success: true, settings: saveSettings({ networkCaptureRealPhone: !!req.body?.networkCaptureRealPhone }) }));

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
    setWebBackground(b.world === 'phone'); // browser steps during app testing run hidden in the background
    if (b.testMode) setContext({ projectId: b.testMode.projectId || null, loginTokens: loginTokens(b.testMode.logins), world: b.world, serial: b.serial });
    if (b.engine === 'claude') {
      let run = null;
      if (b.testMode) {
        let deviceInfo = null;
        const again = findRunBySession(String(b.sessionId)); // same chat: keep adding to the same report
        if (again) { if (current && current.id !== again.id) await closeRun('aborted'); run = reopenRun(again); }
        else {
          await closeRun('aborted');
          try { const d = await tools.device_info?.handler({ serial: b.serial }); if (d?.ok) deviceInfo = { model: d.model, androidVersion: d.androidVersion || d.release }; } catch (e) {}
          run = createRun({ title: String(b.testMode.title || '').slice(0, 120), model: 'Claude Code', serial: b.serial, attachments: (Array.isArray(b.testMode.attachments) ? b.testMode.attachments : []).slice(0, 10).map(a => ({ name: String(a.name || 'file').slice(0, 120) })), instructions: String(b.testMode.summary || '').slice(0, 4000), deviceInfo, projectId: b.testMode.projectId ? String(b.testMode.projectId) : null, sessionId: String(b.sessionId) });
        }
        if (run.projectId) { try { setPriorIssues(run, openIssuesOf(run.projectId)); } catch (e) {} }
        current = run; chatRun = run; run.emit = emit; setActiveRun(run);
        if (b.world !== 'web') await startRunCollectors(run, b.serial, appInfo(run).target).catch(() => {});
        emit({ type: 'run_started', runId: run.id });
      }
      let reason = 'complete';
      const calls = new Map();
      const wrap = (ev) => {
        if (ev.type === 'done') reason = ev.reason; if (ev.type === 'error') reason = 'error';
        if (run && ev.type === 'tool_call') calls.set(ev.id, ev.input);
        if (run && ev.type === 'tool_result' && !/^(report_|finish_report)/.test(ev.name || '')) { try { addStep(run, { name: ev.name, input: calls.get(ev.id) || {}, ok: !!ev.ok, summary: ev.summary }); } catch (e) {} }
        emit(ev);
      };
      await runClaudeCli({ sessionId: String(b.sessionId), message: String(b.message), serial: b.serial, mode: b.mode === 'auto' ? 'auto' : 'ask', model: b.model, testMode: !!run, dangerousNames: dangerousNames(), blockedNames: otherWorldNames(b.world, b.serial), worldPrompt: (WORLD_PROMPT[b.world] || '') + (b.world === 'phone' && isRealPhone(b.serial) ? REAL_PHONE(b.serial) : ''), world: b.world, emit: wrap, signal: ac.signal });
      if (run && run.total > run.checks.length && reason === 'complete') emit({ type: 'text', text: `Only ${run.checks.length} of ${run.total} test cases have a result so far. Send "continue" and I will carry on with the rest: the same report keeps growing.` });
      if (run) { if (current === run) await closeRun(reason, emit); else if (run.checks.length) emit({ type: 'report_ready', runId: run.id, status: run.status, savedTo: run.savedTo }); else { discardRun(run); emit({ type: 'no_report' }); } } // the AI may have finished it itself with report_finish
      chatRun = null;
      if (b.world === 'phone') await shutdownBackgroundBrowser().catch(() => {}); // the hidden browser used for cross-checks is closed when the turn ends
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
    chatRun = null; // a crashed turn must not leave its report bound to later MCP calls
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
  router.get('/reports', (req, res) => { const pid = String(req.query.projectId || ''); res.json({ success: true, runs: pid ? listRuns().filter(r => r.projectId === pid) : listRuns() }); });
  router.get('/reports/:id', (req, res) => { const r = getRun(req.params.id); r ? res.json({ success: true, run: r }) : res.status(404).json({ success: false, message: 'Not found' }); });
  router.get('/reports/:id/shot', (req, res) => { const p = shotPath(req.params.id, String(req.query.f || '')); p ? res.sendFile(p) : res.status(404).end(); });
  router.get('/reports/:id/:fmt(docx|pdf|json)', async (req, res) => {
    const r = getRun(req.params.id); if (!r) return res.status(404).json({ success: false, message: 'Not found' });
    const fmt = req.params.fmt;
    const types = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', json: 'application/json' };
    try {
      const buf = fmt === 'json' ? Buffer.from(JSON.stringify(r, null, 1)) : await cachedBuild(r, fmt);
      res.setHeader('Content-Type', types[fmt]); const nice = reportFileName(r) + '.' + fmt; res.setHeader('Content-Disposition', 'attachment; filename="' + nice.replace(/[^ -~]/g, '_').replace(/"/g, '') + '"; filename*=UTF-8' + "''" + encodeURIComponent(nice)); res.send(buf);
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
    if (chatRun) return res.json({ ok: true, runId: chatRun.id, note: 'A report is already open for this chat. Do not start another one: continue with report_check for every test case, then report_finish.' });
    await closeRun('aborted');
    const serial = String(req.body?.serial || 'emulator-5554');
    let deviceInfo = null;
    try { const d = await tools.device_info?.handler({ serial }); if (d?.ok) deviceInfo = { model: d.model, androidVersion: d.androidVersion || d.release }; } catch (e) {}
    current = createRun({ title: String(req.body?.title || 'Test run').slice(0, 120), model: String(req.body?.client || 'MCP client'), serial, projectId: getContext().projectId || null, instructions: String(req.body?.instructions || '').slice(0, 4000), deviceInfo });
    if (current.projectId) { try { setPriorIssues(current, openIssuesOf(current.projectId)); } catch (e) {} }
    setActiveRun(current);
    await startRunCollectors(current, serial, '').catch(() => {});
    res.json({ ok: true, runId: current.id });
  });
  router.post('/report/check', async (req, res) => {
    if (!current && chatRun) { reopenRun(chatRun); current = chatRun; setActiveRun(current); startRunCollectors(current, current.serial, '').catch(() => {}); } // report_finish was called early: later cases still count
    if (!current) return res.json({ ok: false, error: 'No open report. Call report_begin first (or turn on Test mode in StreamFusion).' });
    const b = req.body || {};
    const status = ['pass', 'fail', 'blocked'].includes(b.status) ? b.status : 'blocked';
    const ck = cleanCheck({ ...b, status });
    const ev = await attachEvidence(current, ck, async (w) => { const sc = w === 'web' && tools.web_screenshot ? await tools.web_screenshot.handler({ __noFrame: true }) : await tools.screenshot.handler({ serial: current.serial, maxDim: 700, __noFrame: true }); return sc.ok ? sc.imageBase64 : null; });
    addCheck(current, { ...ck, screenshot: ev.screenshot, screenshots: ev.screenshots, surface: ev.surface || ck.surface });
    const shot = ev.screenshot;
    try { current.emit?.({ type: 'check', check: { id: ck.id, title: ck.title, status, evidence: ck.actual || ck.evidence, persona: ck.persona } }); current.emit?.({ type: 'progress', ...progressOf(current) }); } catch (e) {}
    res.json({ ok: true, recorded: current.checks.length, ofTotal: current.total || undefined, screenshot: !!shot });
  });
  router.post('/report/finish', async (req, res) => {
    if (!current && chatRun) { reopenRun(chatRun); current = chatRun; setActiveRun(current); startRunCollectors(current, current.serial, '').catch(() => {}); }
    if (!current) return res.json({ ok: false, error: 'No open report.' });
    const r = current; r.summary = String(req.body?.summary || ''); r.report = cleanExtras(req.body || {}); await closeRun('complete');
    const gaps = Object.values(r.health?.coverage || {}).filter(c => c.status !== 'ok').map(c => `${c.label}: ${c.status}${c.note ? ' (' + c.note + ')' : ''}`).slice(0, 6);
    res.json({ ok: true, runId: r.id, status: r.status, ...(gaps.length ? { coverageWarnings: gaps, note: 'Some automatic checks could not fully run. Say so in one short line in your final message.' } : {}), pdf: '/api/agent/reports/' + r.id + '/pdf', docx: '/api/agent/reports/' + r.id + '/docx' });
  });
  return router;
}
