// M4: web testing in the user's own Chrome (Edge as fallback). Playwright only talks to it over CDP; no Chromium is bundled or downloaded.
// If neither browser is installed, the official Google Chrome installer is downloaded and run silently (per-user, no admin needed).
// Tools use the same shape as the device tools so the chat agent, REST and MCP share them.
import fs from 'fs';
import { batchTool } from '../agent/batch.js';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { compareBaseline, baselineDir, getContext } from '../automation/assertions.js';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
const require = createRequire(import.meta.url);

export const state = { installing: false, stage: '', error: null, mode: 'chrome' };
let pw = null;
const playwright = () => (pw ||= require('playwright-core'));

const CHROME_SETUP_URL = 'https://dl.google.com/chrome/install/ChromeStandaloneSetup64.exe';

export function findDesktopBrowser() {
  const pf = process.env['ProgramFiles'] || 'C:/Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', la = process.env.LOCALAPPDATA || '';
  const c = [
    pf + '/Google/Chrome/Application/chrome.exe', pf86 + '/Google/Chrome/Application/chrome.exe', la + '/Google/Chrome/Application/chrome.exe',
    pf86 + '/Microsoft/Edge/Application/msedge.exe', pf + '/Microsoft/Edge/Application/msedge.exe'
  ];
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}
export const isInstalled = () => !!findDesktopBrowser();
export const browserName = () => { const e = findDesktopBrowser(); return !e ? null : /msedge/i.test(e) ? 'Microsoft Edge' : 'Google Chrome'; };

// Only runs when no Chrome/Edge exists. Downloads Google's offline installer and runs it silently.
export async function install() {
  if (state.installing || isInstalled()) return;
  Object.assign(state, { installing: true, stage: 'Downloading Google Chrome...', error: null });
  try {
    const dir = path.join(BASE, 'downloads');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'ChromeStandaloneSetup64.exe');
    const res = await fetch(CHROME_SETUP_URL);
    if (!res.ok || !res.body) throw new Error('Download failed (HTTP ' + res.status + ')');
    const total = Number(res.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(file);
    let got = 0;
    for await (const chunk of res.body) {
      got += chunk.length;
      if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
      state.stage = 'Downloading Google Chrome... ' + (total ? Math.round(got * 100 / total) + '%' : Math.round(got / 1048576) + ' MB');
    }
    await new Promise((r, j) => { out.end(); out.on('finish', r); out.on('error', j); });
    state.stage = 'Installing Google Chrome...';
    const child = spawn(file, ['/silent', '/install'], { windowsHide: true });
    await new Promise((r, j) => { child.on('error', j); child.on('close', r); });
    for (let i = 0; i < 60 && !isInstalled(); i++) await new Promise(r => setTimeout(r, 1000)); // installer can finish in the background
    if (!isInstalled()) throw new Error('Chrome did not finish installing. Please install it from google.com/chrome and try again.');
    state.stage = '';
    fs.rmSync(file, { force: true });
  } catch (e) {
    state.error = 'Install failed: ' + String(e.message || e).slice(0, 300);
  } finally { state.installing = false; }
}

// ---------- browser lifecycle ----------
let ctx = null;
let remote = null; // CDP connection (desktop Chrome, or Chrome/WebView in the Android emulator)
let page = null;
const logs = { console: [], network: [] };
const cap = (arr, v, n = 200) => { arr.push(v); if (arr.length > n) arr.shift(); };

// Playwright no longer parses `label=Email` / `placeholder=Search`; accept them anyway (the tool descriptions promise them).
const fixSel = (s) => {
  const t = String(s ?? '');
  let m = /^label=(.+)$/s.exec(t); if (m) return 'internal:label=' + JSON.stringify(m[1].replace(/^["']|["']$/g, '')) + 'i';
  m = /^placeholder=(.+)$/s.exec(t); if (m) return 'internal:attr=[placeholder=' + JSON.stringify(m[1].replace(/^["']|["']$/g, '')) + 'i]';
  return t;
};
function wirePage(p) {
  if (!p.__sel) { p.__sel = true; const o = p.locator.bind(p); p.locator = (sel, ...r) => o(fixSel(sel), ...r); }
  p.on('console', (m) => cap(logs.console, { t: Date.now(), page: p.url(), type: m.type(), text: m.text().slice(0, 400) }));
  p.on('pageerror', (e) => cap(logs.console, { t: Date.now(), page: p.url(), type: 'pageerror', text: String(e.message).slice(0, 400) }));
  p.on('response', (r) => cap(logs.network, { t: Date.now(), method: r.request().method(), url: r.url().slice(0, 200), status: r.status(), type: r.request().resourceType() }));
  p.on('requestfailed', (r) => cap(logs.network, { t: Date.now(), method: r.method(), url: r.url().slice(0, 200), status: 0, failure: r.failure()?.errorText }));
}

const livePages = () => (ctx ? ctx.pages().filter(p => !p.isClosed() && !/^devtools:/.test(p.url())) : []);

async function ensure() {
  if (ctx && page && !page.isClosed()) return page;
  if (ctx && remote) { // the tab was closed: continue on another tab of the same browser
    const left = livePages();
    if (left.length) { page = left[left.length - 1]; if (!page.__wired) { wirePage(page); page.__wired = true; } return page; }
    if (state.mode === 'android') throw new Error('The connected Android browser page was closed. Reconnect with web_attach_android.');
    page = await ctx.newPage(); wirePage(page); page.__wired = true; return page;
  }
  if (state.mode === 'android') throw new Error('The Android browser connection was lost. Reconnect with web_attach_android.');
  await attachDesktop();
  return page;
}

export async function closeBrowser() { try { await remote?.close(); } catch (e) {} remote = null; ctx = null; page = null; state.mode = 'chrome'; } // for a CDP connection this only disconnects; the browser stays open
export const isOpen = () => !!(ctx && remote && page && !page.isClosed());

// Address-bar logic: a full URL is opened as is, something host-like gets a scheme, anything else is a Google search.
export function normalizeUrl(input) {
  const q = String(input || '').trim();
  if (!q) return 'https://www.google.com';
  if (/^(about|data|file|chrome|blob):/i.test(q) || /^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return q;
  if (!/\s/.test(q)) {
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([\/?#]|$)/i.test(q)) return 'http://' + q;
    if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([\/?#]|$)/i.test(q)) return 'https://' + q;
  }
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

// ---------- tools ----------
async function attachAndroid(runAdb, serial, target, pid) {
  let socket = 'chrome_devtools_remote';
  if (target === 'webview') {
    const u = await runAdb(['-s', serial, 'shell', 'cat', '/proc/net/unix'], 8000);
    const names = [...String(u.output).matchAll(/@(webview_devtools_remote_\d+)/g)].map(m => m[1]);
    const pick = pid ? names.find(n => n.endsWith('_' + pid)) : names[0];
    if (!pick) throw new Error('No debuggable WebView found. The app must enable WebView debugging (setWebContentsDebuggingEnabled) or be a debug build.');
    socket = pick;
  } else {
    const u = await runAdb(['-s', serial, 'shell', 'cat', '/proc/net/unix'], 8000);
    if (!/@chrome_devtools_remote/.test(String(u.output))) throw new Error('Chrome is not running on the device. Open Chrome first (launch_app com.android.chrome).');
  }
  const f = await runAdb(['-s', serial, 'forward', 'tcp:9222', 'localabstract:' + socket], 8000);
  if (!f.success) throw new Error('adb forward failed: ' + f.output);
  await closeBrowser();
  remote = await playwright().chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 15000 });
  ctx = remote.contexts()[0];
  ctx.on('page', wirePage);
  for (let i = 0; i < 20 && !ctx.pages().length; i++) await new Promise(r => setTimeout(r, 250));
  page = ctx.pages()[ctx.pages().length - 1];
  if (!page) { await closeBrowser(); throw new Error('Connected, but no browser tab is visible. Open a tab in Chrome on the device and try again.'); }
  wirePage(page); page.__wired = true;
  state.mode = 'android';
  return { socket, pages: ctx.pages().length };
}

// ---------- the user's own desktop Chrome / Edge ----------
const DESKTOP_PORT = 9333;
async function cdpAlive() { try { const r = await fetch('http://127.0.0.1:' + DESKTOP_PORT + '/json/version', { signal: AbortSignal.timeout(1500) }); return r.ok; } catch (e) { return false; } }
let attaching = null;
export function attachDesktop() { return (attaching ||= doAttach().finally(() => { attaching = null; })); }
async function doAttach() {
  if (!(await cdpAlive())) {
    const exe = findDesktopBrowser();
    if (!exe) throw new Error('Google Chrome was not found on this PC. Install it from the Web Testing page (or Settings -> Web) first.');
    // A separate profile folder is required for remote debugging; it keeps your logins between sessions.
    const dir = path.join(BASE, 'own-chrome-profile');
    fs.mkdirSync(dir, { recursive: true });
    spawn(exe, ['--remote-debugging-port=' + DESKTOP_PORT, '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', 'https://www.google.com'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40 && !(await cdpAlive()); i++) await new Promise(r => setTimeout(r, 500));
    if (!(await cdpAlive())) throw new Error('The browser started but did not open its debugging port.');
  }
  await closeBrowser();
  const b = await playwright().chromium.connectOverCDP('http://127.0.0.1:' + DESKTOP_PORT, { timeout: 15000 });
  remote = b; ctx = b.contexts()[0];
  b.on('disconnected', () => { if (remote === b) { remote = null; ctx = null; page = null; } }); // user closed the Chrome window
  ctx.on('page', wirePage);
  for (let i = 0; i < 20 && !livePages().length; i++) await new Promise(r => setTimeout(r, 250));
  page = livePages().pop() || await ctx.newPage();
  wirePage(page); page.__wired = true;
  if (/^(about:blank|chrome:\/\/newtab|chrome:\/\/new-tab-page|edge:\/\/newtab)/i.test(page.url())) await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}); // start on Google, not a blank tab
  state.mode = 'chrome';
  return { pages: livePages().length };
}

export function createWebTools({ runAdb } = {}) {
  const TOOLS = {};
  const def = (name, description, properties, required, handler, dangerous = false) => {
    TOOLS[name] = { name, description, dangerous, inputSchema: { type: 'object', properties, required }, handler: async (a) => {
      try { return await handler(a); } catch (e) { return { ok: false, error: String(e.message || e).split('\n')[0].slice(0, 500) }; }
    } };
  };
  const SEL = { selector: { type: 'string', description: 'Playwright selector: css, text="Sign in", role=button[name="Sign in"], label=Email, placeholder=Search. Get names from web_snapshot.' } };
  const state0 = async (p) => ({ url: p.url(), title: await p.title() });

  def('web_navigate', "Open a URL in the user's Chrome (starts it if needed).", { url: { type: 'string' } }, ['url'], async (a) => {
    const p = await ensure();
    const r = await p.goto(normalizeUrl(a.url), { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { ok: true, status: r?.status(), ...(await state0(p)) };
  });
  def('web_snapshot', 'Accessibility snapshot of the page: roles, names, values, states. Cheap; use this before clicking. Returns YAML-like text.', { selector: { type: 'string', description: 'Optional root selector (default body)' } }, [], async (a) => {
    const p = await ensure();
    const snap = await p.locator(a.selector || 'body').ariaSnapshot({ timeout: 8000 });
    return { ok: true, ...(await state0(p)), snapshot: snap.length > 14000 ? snap.slice(0, 14000) + '\n...[truncated]' : snap };
  });
  def('web_screenshot', 'Screenshot of the current page (PNG). Use web_snapshot first; screenshots cost more.', { fullPage: { type: 'boolean' } }, [], async (a) => {
    const p = await ensure();
    const buf = await p.screenshot({ fullPage: !!a.fullPage, type: 'png', scale: 'css' });
    const vp = p.viewportSize() || await p.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })).catch(() => ({ width: 0, height: 0 }));
    return { ok: true, mime: 'image/png', imageBase64: buf.toString('base64'), imageWidth: vp.width, imageHeight: vp.height, url: p.url() };
  });
  def('web_click', 'Click an element.', { ...SEL, button: { type: 'string', enum: ['left', 'right', 'middle'] }, doubleClick: { type: 'boolean' } }, ['selector'], async (a) => {
    const p = await ensure();
    await p.locator(a.selector).first().click({ button: a.button || 'left', clickCount: a.doubleClick ? 2 : 1, timeout: 8000 });
    await p.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    return { ok: true, ...(await state0(p)) };
  });
  def('web_fill', 'Type text into an input (replaces its content).', { ...SEL, value: { type: 'string' }, submit: { type: 'boolean', description: 'Press Enter afterwards' } }, ['selector', 'value'], async (a) => {
    const p = await ensure();
    const l = p.locator(a.selector).first();
    await l.fill(a.value, { timeout: 8000 });
    if (a.submit) await l.press('Enter');
    return { ok: true };
  });
  def('web_press', 'Press a keyboard key or chord, e.g. Enter, Tab, Escape, Control+A.', { key: { type: 'string' } }, ['key'], async (a) => {
    await (await ensure()).keyboard.press(a.key); return { ok: true };
  });
  def('web_select', 'Choose an option in a <select> by label or value.', { ...SEL, option: { type: 'string' } }, ['selector', 'option'], async (a) => {
    const l = (await ensure()).locator(a.selector).first();
    let r;
    try { r = await l.selectOption({ label: a.option }, { timeout: 4000 }); } catch (e) { r = await l.selectOption({ value: a.option }, { timeout: 4000 }); }
    return { ok: true, selected: r };
  });
  def('web_wait', 'Wait for text to appear, a selector to be visible, or a number of milliseconds.', { text: { type: 'string' }, selector: { type: 'string' }, ms: { type: 'number' } }, [], async (a) => {
    const p = await ensure();
    if (a.text) await p.getByText(a.text).first().waitFor({ timeout: 15000 });
    else if (a.selector) await p.locator(a.selector).first().waitFor({ timeout: 15000 });
    else await p.waitForTimeout(Math.min(Number(a.ms) || 1000, 10000));
    return { ok: true };
  });
  def('web_text', 'Read the visible text of an element (or the whole page).', { ...SEL }, [], async (a) => {
    const p = await ensure();
    const t = await p.locator(a.selector || 'body').first().innerText({ timeout: 8000 });
    return { ok: true, text: t.slice(0, 12000) };
  });
  def('web_console', 'Browser console messages and page errors since the page was opened (last 200). Optional type filter: error, warning, log.', { type: { type: 'string' }, clear: { type: 'boolean' } }, [], async (a) => {
    const r = logs.console.filter(x => !a.type || x.type === a.type || (a.type === 'error' && x.type === 'pageerror')).slice(-60);
    if (a.clear) logs.console.length = 0;
    return { ok: true, count: r.length, messages: r };
  });
  def('web_network', 'Recent network requests (last 200). Use failedOnly to see 4xx/5xx and failed requests.', { failedOnly: { type: 'boolean' }, urlContains: { type: 'string' } }, [], async (a) => {
    const r = logs.network.filter(x => (!a.failedOnly || x.status === 0 || x.status >= 400) && (!a.urlContains || x.url.includes(a.urlContains))).slice(-60);
    return { ok: true, count: r.length, requests: r };
  });
  def('web_cookies', 'List, set or clear cookies for the browser profile.', { action: { type: 'string', enum: ['list', 'set', 'clear'] }, name: { type: 'string' }, value: { type: 'string' }, url: { type: 'string' } }, ['action'], async (a) => {
    await ensure();
    if (a.action === 'clear') { await ctx.clearCookies(); return { ok: true }; }
    if (a.action === 'set') { await ctx.addCookies([{ name: a.name, value: a.value || '', url: a.url || page.url() }]); return { ok: true }; }
    return { ok: true, cookies: (await ctx.cookies()).map(c => ({ name: c.name, domain: c.domain, path: c.path, value: c.value.slice(0, 80) })) };
  });
  def('web_tabs', 'List, open, switch to or close browser tabs (every tab and window of the connected Chrome).', { action: { type: 'string', enum: ['list', 'new', 'switch', 'close'] }, index: { type: 'number' }, url: { type: 'string' } }, ['action'], async (a) => {
    await ensure();
    const pages = livePages();
    if (a.action === 'new') { page = await ctx.newPage(); wirePage(page); page.__wired = true; await page.goto(a.url ? normalizeUrl(a.url) : 'https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}); }
    else if (a.action === 'switch') { page = pages[a.index] || page; await page.bringToFront(); }
    else if (a.action === 'close') { const t = pages[a.index ?? pages.indexOf(page)]; await t?.close(); const left = livePages(); page = left[left.length - 1] || (await ctx.newPage()); }
    const now = livePages();
    return { ok: true, active: now.indexOf(page), tabs: await Promise.all(now.map(async (p, i) => ({ index: i, url: p.url(), title: await p.title().catch(() => '') }))) };
  });
  def('web_eval', 'Run a JavaScript expression in the page and return the JSON result.', { expression: { type: 'string' } }, ['expression'], async (a) => {
    const r = await (await ensure()).evaluate(a.expression);
    return { ok: true, result: JSON.stringify(r)?.slice(0, 8000) };
  }, true);
  def('web_click_at', 'Click at page coordinates (CSS px, as in web_screenshot). Prefer web_click with a selector.', { x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y'], async (a) => {
    const p = await ensure(); await p.mouse.click(a.x, a.y); return { ok: true };
  });
  def('web_history', 'Go back, forward or reload.', { action: { type: 'string', enum: ['back', 'forward', 'reload'] } }, ['action'], async (a) => {
    const p = await ensure();
    if (a.action === 'back') await p.goBack({ timeout: 8000 }); else if (a.action === 'forward') await p.goForward({ timeout: 8000 }); else await p.reload({ timeout: 15000 });
    return { ok: true, ...(await state0(p)) };
  });
  def('web_assert_text', 'Assert that text is (visible=true, default) or is not (visible=false) on the page. Waits up to timeoutMs (default 6000). Call it before report_check so the pass criterion is recorded and can be replayed without AI. Result: passed true/false.', { text: { type: 'string' }, visible: { type: 'boolean' }, timeoutMs: { type: 'number' } }, ['text'], async (a) => {
    const p = await ensure();
    const want = a.visible !== false, end = Date.now() + (Number(a.timeoutMs) || 6000), q = String(a.text).toLowerCase();
    let found = false;
    for (;;) {
      const body = await p.locator('body').innerText({ timeout: 4000 }).catch(() => '');
      found = body.toLowerCase().includes(q);
      if (found === want || Date.now() >= end) break;
      await p.waitForTimeout(400);
    }
    return { ok: true, passed: found === want, detail: found === want ? `"${a.text}" is ${want ? 'visible' : 'not visible'}` : `"${a.text}" is ${found ? 'visible' : 'not visible'} but should ${want ? '' : 'not '}be` };
  });
  def('web_assert_url', 'Assert that the current page URL contains a string. Waits up to timeoutMs (default 6000). Result: passed true/false.', { contains: { type: 'string' }, timeoutMs: { type: 'number' } }, ['contains'], async (a) => {
    const p = await ensure(); const end = Date.now() + (Number(a.timeoutMs) || 6000);
    while (!p.url().includes(a.contains) && Date.now() < end) await p.waitForTimeout(300);
    const ok = p.url().includes(a.contains);
    return { ok: true, passed: ok, detail: ok ? `URL contains "${a.contains}"` : `URL is ${p.url()}, expected it to contain "${a.contains}"` };
  });
  def('web_assert_screenshot', 'Compare the page with a stored baseline image called name (the first call creates the baseline). threshold = allowed fraction of changed area (default 0.03). Result: passed true/false.', { name: { type: 'string' }, threshold: { type: 'number' } }, ['name'], async (a) => {
    const p = await ensure();
    const buf = await p.screenshot({ type: 'png', scale: 'css' });
    const r = compareBaseline({ dir: a.baselineDir || baselineDir(getContext().projectId), name: a.name, png: buf, threshold: a.threshold });
    return { ok: true, passed: r.passed, detail: r.detail, state: r.state };
  });
  def('web_attach_android', 'Connect the web_* tools to Chrome or a debuggable WebView running on the Android device/emulator (via adb + DevTools). After this, web_snapshot/click/etc. act on the phone. Use web_close to disconnect.', { serial: { type: 'string', description: 'adb serial, default emulator-5554' }, target: { type: 'string', enum: ['chrome', 'webview'] }, pid: { type: 'string', description: 'WebView process id (optional)' } }, [], async (a) => {
    if (!runAdb) return { ok: false, error: 'adb not available' };
    const r = await attachAndroid(runAdb, a.serial || 'emulator-5554', a.target || 'chrome', a.pid);
    return { ok: true, ...r, ...(await state0(page)) };
  });
  def('web_attach_chrome', "Connect to (or start) the user's own desktop Chrome. Other web_* tools do this automatically; use it to reconnect, e.g. after switching back from the Android browser. The user can log in or pass any check themselves in that window. web_close only disconnects (Chrome stays open).", {}, [], async () => {
    const r = await attachDesktop();
    return { ok: true, ...r, ...(await state0(page)) };
  });
  def('web_close', 'Close the browser.', {}, [], async () => { await closeBrowser(); return { ok: true }; });
  TOOLS.web_batch = batchTool(TOOLS, 'web');
  return TOOLS;
}
