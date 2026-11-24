// One call, many steps. A test case normally needs: look, tap, type, tap, assert ... = 10-25 separate model round trips,
// and every round trip re-sends the whole conversation. device_batch / web_batch run a list of steps on the server
// and return one compact answer plus a fresh look at the screen, so a whole test case costs 1-2 calls instead of 20.
import { activeRun, frame } from '../testmode/evidence.js';
import { recordBatch } from '../testmode/runs.js';
import { prepareApp, afterAppBatch, afterWebBatch } from '../testmode/health.js';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAX_STEPS = 25;

const compactElements = (r) => (r.elements || []).filter(e => e.text || e.desc || e.clickable || e.scrollable).slice(0, 45)
  .map(e => `${e.text || e.desc || e.id || e.cls}${e.clickable ? ' [tap]' : ''}${e.cx != null ? ' @' + e.cx + ',' + e.cy : ''}`);

function compact(name, r) {
  const { imageBase64, snapshot, elements, ...rest } = r || {};
  if (name === 'web_snapshot' && snapshot) rest.snapshot = String(snapshot).slice(0, 1500);
  if (name === 'ui_tree' && elements) rest.elements = compactElements({ elements }).slice(0, 25);
  const s = JSON.stringify(rest);
  return s.length > 360 ? { ok: rest.ok, passed: rest.passed, detail: String(rest.detail || rest.error || s).slice(0, 300) } : rest;
}

export function batchTool(TOOLS, world) {
  const isWeb = world === 'web';
  const name = isWeb ? 'web_batch' : 'device_batch';
  const tool = {
    name, dangerous: false,
    description: `Run several ${isWeb ? 'web_*' : 'phone'} steps in ONE call (up to ${MAX_STEPS}) and get one compact answer plus the screen afterwards. ` +
      'Use this for a whole test case: open, tap, type, wait, assert. Each step is {"tool":"<tool name>","args":{...}}. It stops at the first failed step or failed assert, so you only react when something is wrong. ' +
      'Include the assert steps (' + (isWeb ? 'web_assert_text, web_assert_url' : 'assert_text, assert_no_crash') + ') in the batch. Not allowed inside: screenshot tools and risky tools (call those alone).',
    inputSchema: {
      type: 'object',
      properties: {
        ...(isWeb ? {} : { serial: { type: 'string', description: 'adb serial, e.g. emulator-5554' } }),
        steps: { type: 'array', description: 'Steps in order', items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' }, waitMs: { type: 'number', description: 'Pause after this step (ms)' } }, required: ['tool'] } },
        case: { type: 'string', description: 'Test case id this batch belongs to (e.g. TC-03). Its screenshots are attached to that case in the report.' },
        stopOnFail: { type: 'boolean', description: 'Stop at the first failure (default true)' },
        observe: { type: 'boolean', description: 'Return the screen state after the steps (default true)' }
      },
      required: [...(isWeb ? [] : ['serial']), 'steps']
    }
  };
  tool.handler = async (a) => {
    const steps = Array.isArray(a.steps) ? a.steps.slice(0, MAX_STEPS) : [];
    if (!steps.length) return { ok: false, error: 'steps is empty' };
    const results = []; let stoppedAt = null;
    const run = activeRun(), caseId = a.case ? String(a.case).slice(0, 30) : '', t0 = Date.now(), slow = [];
    // evidence: real screenshots while the case runs (only when a report is being recorded)
    const grab = async () => { try { const sc = isWeb ? await TOOLS.web_screenshot.handler({ __noFrame: true }) : await TOOLS.screenshot.handler({ serial: a.serial, maxDim: 700, __noFrame: true }); return sc && sc.ok ? sc.imageBase64 : null; } catch (e) { return null; } };
    const snap = async (note) => { if (run) frame({ base64: await grab(), world: isWeb ? 'web' : 'phone', caseId, note }); };
    let firstAssert = true;
    if (run && !isWeb) await prepareApp(TOOLS, a.serial).catch(() => {});
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i] || {}; const n = String(s.tool || ''); const t = TOOLS[n];
      let r; const ts = Date.now();
      if (!t || n === name) r = { ok: false, error: 'Unknown tool ' + n };
      else if (n.startsWith('web_') !== isWeb) r = { ok: false, error: n + ' is not a ' + (isWeb ? 'web' : 'phone') + ' tool' };
      else if (t.dangerous) r = { ok: false, error: n + ' needs the user to approve it. Call it on its own, not in a batch.' };
      else if (n === 'screenshot' || n === 'web_screenshot') r = { ok: false, error: 'Screenshots cannot be used inside a batch (the report attaches one by itself).' };
      else { try { r = await t.handler(isWeb ? (s.args || {}) : { ...(s.args || {}), serial: a.serial }); } catch (e) { r = { ok: false, error: String(e.message || e).slice(0, 300) }; } }
      const failed = !r.ok || r.passed === false;
      if (run && /^(tap|tap_element|key|swipe|scroll|assert_text|web_click|web_fill|web_press|web_select|web_assert_text|web_assert_url)$/.test(n)) { const ms = Date.now() - ts; if (ms > 4000 && !s.waitMs) slow.push({ label: n.replace(/^web_/, '').replace(/_/g, ' ') + (s.args?.text ? ' "' + String(s.args.text).slice(0, 30) + '"' : ''), ms }); }
      if (run && /assert/.test(n) && firstAssert && !failed) { firstAssert = false; await snap('check passed'); }
      if (run && failed) await snap('failure: ' + n);
      results.push({ i, tool: n, ...compact(n, r), ...(failed ? { failed: true } : {}) });
      if (failed && a.stopOnFail !== false) { stoppedAt = i; break; }
      if (s.waitMs) await sleep(Math.min(5000, Number(s.waitMs) || 0));
    }
    let observe, raw;
    if (a.observe !== false || run) {
      try {
        if (isWeb) { const o = await TOOLS.web_snapshot.handler({}); observe = o.ok ? { url: o.url, title: o.title, snapshot: String(o.snapshot || '').slice(0, 3500) } : { error: o.error }; }
        else { const o = await TOOLS.ui_tree.handler({ serial: a.serial }); raw = o.ok ? o.elements : undefined; observe = o.ok ? { app: o.foreground, elements: compactElements(o) } : { error: o.error }; }
      } catch (e) { observe = { error: String(e.message || e).slice(0, 200) }; }
    }
    if (run) { recordBatch(run, { caseId, t0, t1: Date.now(), world: isWeb ? 'web' : 'phone' }); }
    if (run) { // the final state of the case + automatic health checks (no AI tokens)
      if (stoppedAt === null) await snap('after the steps');
      if (isWeb) await afterWebBatch({ caseId, since: t0 }).catch(() => {});
      else await afterAppBatch({ TOOLS, serial: a.serial, caseId, observe, raw, slow }).catch(() => {});
    }
    if (a.observe === false) observe = undefined;
    return { ok: true, allPassed: stoppedAt === null && results.every(r => !r.failed), ran: results.length, of: steps.length, ...(stoppedAt !== null ? { stoppedAt } : {}), results, observe };
  };
  tool.raw = true; // the recorder already records every inner step; the batch call itself is not a replayable step
  return tool;
}
