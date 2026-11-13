// Test case format for the automation engine (YAML or JSON), plus a small plain-English parser.
// Steps that the parser understands become deterministic tool calls (replayed with zero AI tokens). Anything else is kept as
// plain English and needs one AI run ("learn"), whose recorded steps replace it.
import yaml from 'js-yaml';

const isUrl = (s) => /^(https?:\/\/|localhost|[\w-]+(\.[\w-]+)+(\/|$|:))/i.test(String(s).trim());
const asUrl = (s) => { const t = String(s).trim(); return /^https?:\/\//i.test(t) ? t : /^localhost/i.test(t) ? 'http://' + t : 'https://' + t; };
const looksSelector = (s) => /^(css|text|role|label|placeholder|field|testid|xpath|id)=|^[#.\[]|[>\[\]]|^\/\//.test(String(s));
const textSel = (s) => (looksSelector(s) ? String(s) : `text="${String(s).replace(/"/g, '\\"')}"`);
const KEY_WORDS = { enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape', backspace: 'Backspace', delete: 'Delete', space: 'Space' };
const PHONE_KEYS = ['back', 'home', 'recent', 'recents', 'enter', 'delete', 'tab', 'menu', 'search', 'space', 'escape'];

export const loginTokens = (text) => [...new Set(String(text || '').split(/[\s:,/|]+/).filter(t => t.length >= 3))];
export function resolveSecrets(value, tokens, env = process.env) {
  if (typeof value === 'string') return value.replace(/\{\{(login|env):([^}]+)\}\}/g, (m, k, v) => (k === 'login' ? tokens[Number(v)] ?? m : env[v] ?? m));
  if (Array.isArray(value)) return value.map(v => resolveSecrets(v, tokens, env));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveSecrets(v, tokens, env)]));
  return value;
}
// used when recording: a typed value equal to a saved login token is stored as {{login:N}}, never as text
export function redactSecrets(value, tokens) {
  if (typeof value === 'string') { const i = tokens.indexOf(value); return i >= 0 ? `{{login:${i}}}` : value; }
  if (Array.isArray(value)) return value.map(v => redactSecrets(v, tokens));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactSecrets(v, tokens)]));
  return value;
}

// ---- plain English -> step (or null when it needs AI) ----
export function englishStep(line, target) {
  const s = String(line).trim().replace(/^[-*\d.)\s]+/, '').replace(/[.]$/, '');
  if (!s) return null;
  const q = '["“\'‘](.+?)["”\'’]';
  let m;
  const web = target === 'web';
  if ((m = /^wait\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?)?$/i.exec(s))) return { tool: 'wait', args: { ms: Math.round(Number(m[1]) * (/^m/i.test(m[2] || '') ? 1 : 1000)) } };
  if ((m = new RegExp(`^(?:expect|verify|check|assert|see|should see|make sure)\\s+(?:that\\s+)?(?:the\\s+)?(?:page\\s+|screen\\s+)?(?:(?:shows?|has|contains?|displays?|says?|is showing)\\s+)?(?:(no|not)\\s+)?${q}`, 'i').exec(s))
    || (m = new RegExp(`^${q}\\s+(?:is|should be)\\s+(not\\s+)?visible$`, 'i').exec(s) && null)) {
    const neg = /^(no|not)$/i.test(m[1] || '') || /\b(doesn'?t|does not|should not|isn'?t|not)\b/i.test(s.slice(0, s.search(/["“'‘]/)));
    return { tool: web ? 'web_assert_text' : 'assert_text', args: { text: m[2], ...(neg ? { visible: false } : {}) } };
  }
  if (!web && /^(expect|verify|check|assert)\s+(that\s+)?(there is\s+)?no crash(es)?( or anr)?$/i.test(s)) return { tool: 'assert_no_crash', args: {} };
  if (web && (m = /^(?:open|go to|navigate to|visit|load)\s+(?:the\s+)?(?:url\s+|page\s+|site\s+|website\s+)?(\S+)$/i.exec(s)) && isUrl(m[1])) return { tool: 'web_navigate', args: { url: asUrl(m[1]) } };
  if (web && /^(go\s+)?back$/i.test(s)) return { tool: 'web_history', args: { action: 'back' } };
  if (web && /^(reload|refresh)(\s+the\s+page)?$/i.test(s)) return { tool: 'web_history', args: { action: 'reload' } };
  if ((m = new RegExp(`^(?:type|enter|fill(?: in)?|input|write)\\s+${q}\\s+(?:in|into|in the|into the)\\s+(?:the\\s+)?["“'‘]?(.+?)["”'’]?(?:\\s+(?:field|input|box|textbox))?$`, 'i').exec(s))) {
    return web ? { tool: 'web_fill', args: { selector: 'label=' + m[2], value: m[1] } } : null;
  }
  if (!web && (m = new RegExp(`^(?:type|enter|input|write)\\s+${q}$`, 'i').exec(s))) return { tool: 'type_text', args: { text: m[1] } };
  if ((m = /^press\s+(?:the\s+)?(\w+)(?:\s+key)?$/i.exec(s))) {
    const k = m[1].toLowerCase();
    if (web && KEY_WORDS[k]) return { tool: 'web_press', args: { key: KEY_WORDS[k] } };
    if (!web && PHONE_KEYS.includes(k)) return { tool: 'key', args: { key: k === 'recents' ? 'recent' : k } };
  }
  if (!web && (m = /^(?:go\s+)?(back|home)$/i.exec(s))) return { tool: 'key', args: { key: m[1].toLowerCase() } };
  if (!web && (m = /^scroll\s+(up|down|left|right)$/i.exec(s))) return { tool: 'scroll', args: { direction: m[1].toLowerCase() } };
  if (!web && (m = /^(?:open|launch|start)\s+(?:the\s+)?(?:app\s+)?([A-Za-z][\w]*(?:\.[A-Za-z_][\w]*)+)$/i.exec(s))) return { tool: 'launch_app', args: { package: m[1] } };
  if ((m = new RegExp(`^(?:click|tap|press|select|choose|open)\\s+(?:on\\s+)?(?:the\\s+)?${q}(?:\\s+(?:button|link|tab|item|option|icon))?$`, 'i').exec(s))
    || (m = /^(?:click|tap)\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:button|link|tab|icon)$/i.exec(s))) {
    return web ? { tool: 'web_click', args: { selector: textSel(m[1]) } } : { tool: 'tap_element', args: { text: m[1] } };
  }
  return null;
}

// ---- one YAML/JSON step -> tool call ----
function objStep(o, target) {
  const web = target === 'web';
  if (o.check !== undefined) { const c = o.check; return { check: typeof c === 'object' && c ? { id: String(c.id || ''), title: String(c.title || '') } : { id: '', title: String(c) } }; }
  if (o.tool) return { tool: String(o.tool), args: o.args && typeof o.args === 'object' ? o.args : {} };
  const [k] = Object.keys(o); const v = o[k];
  const str = typeof v === 'string' || typeof v === 'number' ? String(v) : null;
  switch (k) {
    case 'open': case 'goto': case 'navigate': case 'visit': return web ? { tool: 'web_navigate', args: { url: asUrl(str) } } : { tool: 'launch_app', args: { package: str } };
    case 'launch': case 'open_app': return { tool: 'launch_app', args: { package: str } };
    case 'stop_app': return { tool: 'stop_app', args: { package: str } };
    case 'click': return web ? { tool: 'web_click', args: { selector: textSel(str ?? v.selector) } } : { tool: 'tap_element', args: typeof v === 'object' ? v : { text: str } };
    case 'tap': return web ? { tool: 'web_click', args: { selector: textSel(str ?? v.selector) } } : { tool: 'tap_element', args: typeof v === 'object' ? v : { text: str } };
    case 'tap_id': return { tool: 'tap_element', args: { id: str } };
    case 'fill': case 'type': {
      if (web) { const f = v.field || v.into || v.selector; return { tool: 'web_fill', args: { selector: v.selector ? v.selector : 'label=' + f, value: String(v.value ?? v.text ?? ''), ...(v.submit ? { submit: true } : {}) } }; }
      return { tool: 'type_text', args: { text: str ?? String(v.text ?? v.value ?? '') } };
    }
    case 'press': case 'key': return web ? { tool: 'web_press', args: { key: KEY_WORDS[String(v).toLowerCase()] || String(v) } } : { tool: 'key', args: { key: String(v).toLowerCase() } };
    case 'select': return { tool: 'web_select', args: { selector: v.selector, option: v.option } };
    case 'scroll': case 'swipe': return { tool: 'scroll', args: { direction: str } };
    case 'wait': return typeof v === 'object' && v.text ? { tool: 'web_wait', args: { text: v.text } } : { tool: 'wait', args: { ms: Number(v) > 50 ? Number(v) : Number(v) * 1000 } };
    case 'back': return web ? { tool: 'web_history', args: { action: 'back' } } : { tool: 'key', args: { key: 'back' } };
    case 'reload': return { tool: 'web_history', args: { action: 'reload' } };
    case 'expect_text': case 'see': case 'assert_text': return { tool: web ? 'web_assert_text' : 'assert_text', args: typeof v === 'object' ? v : { text: str } };
    case 'expect_no_text': return { tool: web ? 'web_assert_text' : 'assert_text', args: { text: str, visible: false } };
    case 'expect_url': return { tool: 'web_assert_url', args: { contains: str } };
    case 'expect_no_crash': return { tool: 'assert_no_crash', args: {} };
    case 'expect_screenshot': case 'screenshot': return { tool: web ? 'web_assert_screenshot' : 'assert_screenshot', args: typeof v === 'object' ? v : { name: str } };
    default: return null;
  }
}

// source: YAML or JSON text (or plain lines). Returns { name, target, steps, plain, errors }.
export function parseTest(source, fallbackTarget = 'web') {
  const errors = [];
  let doc;
  const text = String(source || '').trim();
  try { doc = yaml.load(text); } catch (e) { doc = null; errors.push('Could not read the file as YAML/JSON: ' + String(e.message).split('\n')[0]); }
  if (!doc || typeof doc !== 'object') { // plain lines
    doc = { name: 'Untitled test', target: fallbackTarget, steps: text.split(/\r?\n/).map(l => l.trim()).filter(Boolean) };
    errors.length = 0;
  }
  const target = doc.target === 'phone' || doc.target === 'android' || doc.target === 'app' ? 'phone' : doc.target === 'web' ? 'web' : fallbackTarget;
  const raw = Array.isArray(doc.steps) ? doc.steps : [];
  const steps = []; let plainCount = 0;
  raw.forEach((st, i) => {
    let s = null;
    if (typeof st === 'string') { s = englishStep(st, target); if (!s) { steps.push({ plain: st }); plainCount++; return; } s.text = st; }
    else if (st && typeof st === 'object') { try { s = objStep(st, target); } catch (e) { s = null; } if (!s) { errors.push(`Step ${i + 1}: not understood`); return; } }
    else return;
    steps.push(s);
  });
  if (!steps.length) errors.push('No steps found. Add a "steps:" list.');
  return { name: String(doc.name || 'Untitled test').slice(0, 100), target, description: doc.description ? String(doc.description).slice(0, 500) : '', steps, needsAi: plainCount, errors };
}

// readable one-liner for reports and the UI
export function describeStep(s) {
  if (s.plain) return s.plain;
  if (s.check) return 'Check: ' + (s.check.id ? s.check.id + ' ' : '') + s.check.title;
  const a = s.args || {};
  switch (s.tool) {
    case 'web_navigate': return 'Open ' + a.url;
    case 'web_click': return 'Click ' + (a.selector || '').replace(/^text=/, '');
    case 'web_fill': return `Type "${/pass|secret|\{\{/i.test(a.selector + a.value) ? '••••' : a.value}" into ${(a.selector || '').replace(/^(label|placeholder)=/, '')}`;
    case 'web_press': return 'Press ' + a.key;
    case 'web_wait': return 'Wait for ' + (a.text || a.selector || a.ms + ' ms');
    case 'web_history': return a.action[0].toUpperCase() + a.action.slice(1);
    case 'web_assert_text': case 'assert_text': return `Expect "${a.text}" ${a.visible === false ? 'not ' : ''}visible`;
    case 'web_assert_url': return `Expect URL contains "${a.contains}"`;
    case 'web_assert_screenshot': case 'assert_screenshot': return `Screen matches "${a.name}"`;
    case 'assert_no_crash': return 'No crash or ANR';
    case 'tap_element': return 'Tap ' + (a.text || a.desc || a.id);
    case 'type_text': return `Type "${/pass|secret|\{\{/i.test(a.text) ? '••••' : a.text}"`;
    case 'launch_app': return 'Launch ' + a.package;
    case 'key': return 'Press ' + a.key;
    case 'scroll': return 'Scroll ' + a.direction;
    case 'wait': return `Wait ${a.ms} ms`;
    default: return s.tool + ' ' + JSON.stringify(a).slice(0, 80);
  }
}
export const isAssertTool = (t) => /assert/.test(t);
