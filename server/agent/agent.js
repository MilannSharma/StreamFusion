// M3-A: Chat agent. A manual tool loop over the M2 device tools using the official Anthropic SDK.
import Anthropic from '@anthropic-ai/sdk';
import { createRun, saveShot, addStep, addCheck, finishRun, discardRun } from '../testmode/runs.js';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' }
];

const SYSTEM = `You are StreamFusion's mobile QA agent. You operate a real Android device (usually an emulator) through tools and carry out the user's testing instructions.

How to work:
- Observe with ui_tree first (cheap, gives element text and coordinates). Use screenshot only when the layout matters visually or ui_tree is empty.
- Act with tap_element (by text/desc/id) when possible; use raw tap/swipe coordinates from ui_tree otherwise. Coordinates are device pixels.
- After each meaningful action, verify the result (ui_tree or logcat) before moving on. Screens may need a moment to load: if ui_tree shows the old screen, observe again.
- If something fails, try one alternative, then report what you tried instead of looping.
- You can also drive the user's own Chrome browser with the web_* tools (web_navigate, web_snapshot, web_click, web_fill ...) to test websites. Use web_snapshot (accessibility tree) before clicking and check web_console / web_network for errors.
- Never use shell, uninstall_app, clear_data or install_apk unless the user asked for it.
- If the user has not said what to test (a bare "start", "hi", "test"), do not touch anything: ask for the product, feature/module, URL or app, the test cases and any login.
- When testing, end with a short result: PASS or FAIL per check, with the evidence (what you saw). Keep messages brief.`;

const TEST_PROMPT = `

TEST MODE is on. You are producing a formal test report.
- The user's message lists the test cases and may include attached files (test cases, specs). Work through every test case in order.
- Save tokens: read the page with web_snapshot / ui_tree (text) and use screenshots only when the layout itself matters. Before each report_check call the assert tool that proves the result (web_assert_text, web_assert_url, assert_text, assert_no_crash, assert_screenshot): the assertion is recorded and the test can be replayed later with zero AI tokens.
- After finishing each test case, call report_check once with: id, title, status (pass | fail | blocked), and evidence (what you actually observed, e.g. the text on screen). A screenshot of the current screen is attached to the report automatically, so make sure the screen shows the result when you call it.
- Use blocked only when the check could not be executed (app crashed, element missing); explain why. Never mark pass without evidence.
- When all cases are done, call finish_report with a short overall summary (what was tested, what failed, likely causes). Do not call it earlier.`;

const REPORT_TOOLS = [
  { name: 'report_check', description: 'Record the result of one test case in the report. Auto-attaches a screenshot of the current screen.', input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Test case id, e.g. TC-01' }, title: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'blocked'] }, evidence: { type: 'string', description: 'What you observed' } }, required: ['title', 'status', 'evidence'] } },
  { name: 'finish_report', description: 'Finish the test run with an overall summary. Call once, after all test cases are reported.', input_schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } }
];

const sessions = new Map(); // sessionId -> { messages }
const pending = new Map();  // approvalId -> resolve(boolean)

export function resolveApproval(id, allow) {
  const r = pending.get(id);
  if (r) { pending.delete(id); r(!!allow); return true; }
  return false;
}
export function resetSession(id) { sessions.delete(id); }

const toAnthropicTools = (tools) => Object.values(tools).map((t) => {
  const { serial, ...props } = t.inputSchema.properties; // serial is injected server-side
  return { name: t.name, description: t.description, input_schema: { type: 'object', properties: props, required: t.inputSchema.required.filter(r => r !== 'serial') } };
});

// Keep only the newest images in history: old screenshots are the biggest token cost.
function pruneImages(messages, keep = 1) {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type !== 'tool_result' || !Array.isArray(b.content)) continue;
      if (b.content.some(c => c.type === 'image') && ++seen > keep) {
        b.content = [{ type: 'text', text: '[older screenshot removed to save tokens]' }];
      }
    }
  }
}

function toResultContent(name, r) {
  if (name === 'web_screenshot' && r.ok) {
    return [{ type: 'image', source: { type: 'base64', media_type: r.mime, data: r.imageBase64 } }, { type: 'text', text: 'Page ' + r.url }];
  }
  if (name === 'screenshot' && r.ok) {
    return [
      { type: 'image', source: { type: 'base64', media_type: r.mime, data: r.imageBase64 } },
      { type: 'text', text: `Image ${r.imageWidth}x${r.imageHeight}; device is ${r.deviceWidth}x${r.deviceHeight} (multiply image coords by ${(r.deviceWidth / r.imageWidth).toFixed(2)} to get device pixels).` }
    ];
  }
  const { imageBase64, ...rest } = r;
  return JSON.stringify(rest).slice(0, 7000);
}

const summarize = (name, r) => {
  if (!r.ok) return `error: ${r.error}`;
  if (name === 'ui_tree') return `${r.count} elements on ${r.foreground}`;
  if (name === 'web_screenshot') return 'page screenshot';
  if (name === 'web_snapshot') return 'snapshot of ' + (r.title || r.url);
  if (name === 'web_navigate') return (r.status || '') + ' ' + (r.title || r.url);
  if (name === 'screenshot') return `${r.imageWidth}x${r.imageHeight} image`;
  if (name === 'tap_element') return `tapped "${r.tapped?.text || r.tapped?.desc || r.tapped?.id}"`;
  return 'ok';
};

export const WORLD_PROMPT = {
  web: '\n\nThis chat is for WEB testing in the browser. Use only the web_* tools. Do NOT start or use the Android emulator.',
  phone: '\n\nThis chat is for ANDROID app testing on the emulator/device. Use only the device tools. Do NOT use the web_* browser tools.'
};

export async function runAgent({ sessionId, message, apiKey, model = 'claude-opus-5-5', effort = 'medium', serial, mode = 'ask', tools, emit, signal, maxSteps = 40, baseURL, testMode, world }) {
  if (!apiKey) return emit({ type: 'error', message: 'No API key set. Add your Anthropic API key in the chat settings.' });
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const anthropicTools = toAnthropicTools(tools);
  const worldPrompt = WORLD_PROMPT[world] || '';
  let run = null;
  if (testMode) {
    let deviceInfo = null;
    try { const d = await tools.device_info?.handler({ serial }); if (d?.ok) deviceInfo = { model: d.model, androidVersion: d.androidVersion || d.release }; } catch (e) {}
    run = createRun({ title: testMode.title, model, serial, attachments: testMode.attachments || [], instructions: String(testMode.summary ?? message).slice(0, 4000), deviceInfo, projectId: testMode.projectId || null });
    anthropicTools.push(...REPORT_TOOLS);
    emit({ type: 'run_started', runId: run.id });
  }
  // the tool list is identical on every step: cache it together with the system prompt (a cache read costs a tenth)
  if (anthropicTools.length) anthropicTools[anthropicTools.length - 1] = { ...anthropicTools[anthropicTools.length - 1], cache_control: { type: 'ephemeral' } };
  let runEnded = false;
  let lastWorld = 'device';
  const endRun = (reason) => { if (run && !runEnded) { runEnded = true; if (!run.checks.length) { discardRun(run); emitDone({ type: 'no_report' }); return; } finishRun(run, run.summary, reason); emit({ type: 'report_ready', runId: run.id, status: run.status }); } };
  const emitDone = emit;
  emit = (ev) => { emitDone(ev); if (ev.type === 'done') endRun(ev.reason); if (ev.type === 'error') endRun('error'); };
  const s = sessions.get(sessionId) || { messages: [] };
  sessions.set(sessionId, s);
  const messages = s.messages;
  messages.push({ role: 'user', content: message });
  // Server-side refusal fallback (opt-in per the API); Haiku 5.5 has no server-side fallback.
  const useFallback = model !== 'claude-haiku-5-5';

  try {
    for (let step = 0; step < maxSteps; step++) {
      if (signal.aborted) return emit({ type: 'done', reason: 'stopped' });
      const resp = await client.beta.messages.create({
        model, max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM + worldPrompt + (run ? TEST_PROMPT : ''), cache_control: { type: 'ephemeral' } }],
        tools: anthropicTools, messages,
        output_config: { effort },
        betas: useFallback ? ['server-side-fallback-2026-07-01'] : [],
        ...(useFallback ? { fallbacks: 'default' } : {})
      }, { signal });

      messages.push({ role: 'assistant', content: resp.content });
      emit({ type: 'usage', input: resp.usage?.input_tokens, output: resp.usage?.output_tokens, cacheRead: resp.usage?.cache_read_input_tokens || 0 });
      for (const b of resp.content) if (b.type === 'text' && b.text.trim()) emit({ type: 'text', text: b.text });

      if (resp.stop_reason === 'refusal') return emit({ type: 'done', reason: 'refusal' });
      if (resp.stop_reason === 'max_tokens') return emit({ type: 'done', reason: 'max_tokens' });
      const calls = resp.content.filter(b => b.type === 'tool_use');
      if (resp.stop_reason !== 'tool_use' || !calls.length) return emit({ type: 'done', reason: 'complete' });

      const results = [];
      for (const c of calls) {
        const tool = tools[c.name];
        if (c.name.startsWith('web_')) lastWorld = 'web'; else if (tool) lastWorld = 'device';
        if (run && (c.name === 'report_check' || c.name === 'finish_report')) {
          let r = { ok: true };
          if (c.name === 'report_check') {
            const status = ['pass', 'fail', 'blocked'].includes(c.input.status) ? c.input.status : 'blocked';
            let shot = null;
            try { const sc = lastWorld === 'web' && tools.web_screenshot ? await tools.web_screenshot.handler({}) : await tools.screenshot.handler({ serial, maxDim: 700 }); if (sc.ok) shot = saveShot(run, sc.imageBase64, status); } catch (e) {}
            addCheck(run, { id: c.input.id, title: String(c.input.title || ''), status, evidence: String(c.input.evidence || ''), screenshot: shot });
            emit({ type: 'check', check: { id: c.input.id, title: c.input.title, status, evidence: c.input.evidence } });
          } else { run.summary = String(c.input.summary || ''); }
          results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(r) });
          continue;
        }
        emit({ type: 'tool_call', id: c.id, name: c.name, input: c.input });
        let r;
        if (!tool) r = { ok: false, error: 'Unknown tool' };
        else {
          let allowed = true;
          if (tool.dangerous && mode === 'ask') {
            allowed = await new Promise((resolve) => {
              pending.set(c.id, resolve);
              signal.addEventListener('abort', () => resolve(false), { once: true });
              emit({ type: 'approval', id: c.id, name: c.name, input: c.input });
            });
            pending.delete(c.id);
          }
          if (!allowed) r = { ok: false, error: 'The user denied this action.' };
          else { try { r = await tool.handler({ ...c.input, serial }); } catch (e) { r = { ok: false, error: e.message }; } }
        }
        emit({ type: 'tool_result', id: c.id, name: c.name, ok: !!r.ok, summary: summarize(c.name, r) });
        if (run) addStep(run, { name: c.name, input: c.input, ok: !!r.ok, summary: summarize(c.name, r) });
        results.push({ type: 'tool_result', tool_use_id: c.id, content: toResultContent(c.name, r), ...(r.ok ? {} : { is_error: true }) });
      }
      messages.push({ role: 'user', content: results });
      pruneImages(messages);
    }
    emit({ type: 'done', reason: 'step_limit' });
  } catch (e) {
    if (signal.aborted) return emit({ type: 'done', reason: 'stopped' });
    // A failed turn could leave a dangling tool_use in history; drop the session so the next message starts clean.
    sessions.delete(sessionId);
    const msg = e instanceof Anthropic.AuthenticationError ? 'Invalid API key.'
      : e instanceof Anthropic.RateLimitError ? 'Rate limited by Anthropic. Wait a moment and retry.'
      : e instanceof Anthropic.BadRequestError ? `Request rejected: ${e.message}`
      : e instanceof Anthropic.APIError ? `Anthropic API error ${e.status}: ${e.message}`
      : e.message;
    emit({ type: 'error', message: msg });
  }
}
