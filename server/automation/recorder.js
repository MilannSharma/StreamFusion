// Records what the AI does during a test run so it can be replayed later with zero AI tokens.
// Only state-changing actions and assertions are kept (reads like snapshot / screenshot / ui_tree are not).
// Typed values equal to a saved login are stored as {{login:N}} placeholders, never as text.
import { getContext } from './assertions.js';
import { redactSecrets } from './format.js';

const ACTIONS = new Set(['web_navigate', 'web_click', 'web_fill', 'web_press', 'web_select', 'web_wait', 'web_history', 'web_click_at',
  'tap', 'tap_element', 'long_press', 'swipe', 'scroll', 'type_text', 'key', 'launch_app', 'stop_app', 'rotate']);
const ASSERTS = new Set(['web_assert_text', 'web_assert_url', 'web_assert_screenshot', 'assert_text', 'assert_no_crash', 'assert_screenshot']);
const CLEAN_KEYS = ['serial', 'baselineDir']; // never recorded: the device is chosen at replay time

let rec = null;          // active recording
const done = new Map(); // runId -> finished recording (kept in memory until the user saves it)

// The recording is also kept on disk (next to the report), so "Save as automated test" still works after a restart or a crash.
let store = null; // { save(runId, data), load(runId) } set by the report store
export function setStore(s) { store = s; }
const persist = () => { try { if (rec && store) store.save(rec.runId, { runId: rec.runId, projectId: rec.projectId, steps: compact(rec.steps), target: rec.steps.some(s => /^web_/.test(s.tool || '')) ? 'web' : 'phone', at: new Date().toISOString() }); } catch (e) {} };
export function start(runId, meta = {}) { rec = { runId, steps: [], t0: Date.now(), ...meta }; }
// A resumed run keeps what was recorded before: the new actions are added to the old ones.
export function resume(runId, meta = {}) {
  if (rec && rec.runId === runId) return;
  const prev = done.get(runId) || (store && store.load(runId)) || null;
  rec = { runId, steps: prev ? prev.steps.slice() : [], t0: Date.now(), ...meta };
}
export function active() { return !!rec; }
const clean = (args) => { const o = { ...(args || {}) }; for (const k of CLEAN_KEYS) delete o[k]; return o; };

export function onCall(name, args, result) {
  if (!rec || !result || result.ok === false) return;
  if (!ACTIONS.has(name) && !ASSERTS.has(name)) return;
  if (ASSERTS.has(name) && result.passed !== true) return; // only criteria that held while the AI watched are pinned
  const tokens = getContext().loginTokens || [];
  let a = redactSecrets(clean(args), tokens);
  // a password typed by an AI that does not know the saved login must still never be stored: keep a placeholder
  if ((name === 'web_fill' || name === 'type_text') && /pass(word|wd)?|pwd|secret|token|(^|[^a-z])(otp|pin)([^a-z]|$)/i.test(String(a.selector || '')) && !/^{{/.test(String(a.value ?? a.text ?? ''))) {
    const key = 'SF_' + (String(a.selector).replace(/^[a-z]+=/i, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase() || 'SECRET');
    a = { ...a, ...(a.value !== undefined ? { value: `{{env:${key}}}` } : { text: `{{env:${key}}}` }) };
  }
  rec.steps.push({ tool: name, args: a });
}
export function onCheck(check) {
  if (!rec) return;
  rec.steps.push({ check: { id: check.id || '', title: check.title || '' } });
  persist();
}
export function finish(runId) {
  if (!rec || rec.runId !== runId) return;
  const r = rec; rec = null;
  const actions = r.steps.filter(s => s.tool).length;
  if (actions) { const d = { runId, projectId: r.projectId, steps: compact(r.steps), target: r.steps.some(s => /^web_/.test(s.tool || '')) ? 'web' : 'phone', at: new Date().toISOString() }; done.set(runId, d); try { store?.save(runId, d); } catch (e) {} }
  if (done.size > 20) done.delete(done.keys().next().value);
}
export function discard(runId) { if (rec?.runId === runId) rec = null; done.delete(runId); }
export const recordingOf = (runId) => done.get(runId) || (store ? store.load(runId) : null) || null;

// drop consecutive duplicates (e.g. repeated waits) and trailing actions that no check follows
function compact(steps) {
  const out = [];
  for (const s of steps) { const p = out[out.length - 1]; if (p && s.tool && p.tool === s.tool && JSON.stringify(p.args) === JSON.stringify(s.args) && !ASSERTS.has(s.tool)) continue; out.push(s); }
  return out;
}

// Wrap every tool handler (in place) so each call is recorded. The runner uses `raw` to avoid recording its own replays.
export function wrapTools(tools) {
  for (const t of Object.values(tools)) {
    if (t.raw) continue;
    const orig = t.handler; t.raw = orig;
    t.handler = async (a) => { const r = await orig(a); try { onCall(t.name, a, r); } catch (e) {} return r; };
  }
  return tools;
}
