// M3-A: Chat agent. A manual tool loop over the M2 device tools using the official Anthropic SDK.
import Anthropic from '@anthropic-ai/sdk';

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
- Never use shell, uninstall_app, clear_data or install_apk unless the user asked for it.
- When testing, end with a short result: PASS or FAIL per check, with the evidence (what you saw). Keep messages brief.`;

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
function pruneImages(messages, keep = 2) {
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
  if (name === 'screenshot' && r.ok) {
    return [
      { type: 'image', source: { type: 'base64', media_type: r.mime, data: r.imageBase64 } },
      { type: 'text', text: `Image ${r.imageWidth}x${r.imageHeight}; device is ${r.deviceWidth}x${r.deviceHeight} (multiply image coords by ${(r.deviceWidth / r.imageWidth).toFixed(2)} to get device pixels).` }
    ];
  }
  const { imageBase64, ...rest } = r;
  return JSON.stringify(rest).slice(0, 12000);
}

const summarize = (name, r) => {
  if (!r.ok) return `error: ${r.error}`;
  if (name === 'ui_tree') return `${r.count} elements on ${r.foreground}`;
  if (name === 'screenshot') return `${r.imageWidth}x${r.imageHeight} image`;
  if (name === 'tap_element') return `tapped "${r.tapped?.text || r.tapped?.desc || r.tapped?.id}"`;
  return 'ok';
};

export async function runAgent({ sessionId, message, apiKey, model = 'claude-opus-5-5', effort = 'medium', serial, mode = 'ask', tools, emit, signal, maxSteps = 40, baseURL }) {
  if (!apiKey) return emit({ type: 'error', message: 'No API key set. Add your Anthropic API key in the chat settings.' });
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const anthropicTools = toAnthropicTools(tools);
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
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
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
