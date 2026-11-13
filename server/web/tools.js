// M4: Chromium web testing. Playwright drives a real Chromium with its own persistent profile.
// Chromium is NOT bundled: it is downloaded on demand into %LOCALAPPDATA%\StreamFusion\browsers.
// Tools use the same shape as the device tools so the chat agent, REST and MCP share them.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
const BROWSERS = path.join(BASE, 'browsers');
const PROFILE = path.join(BASE, 'web-profile');
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
const require = createRequire(import.meta.url);

export const state = { installing: false, stage: '', error: null, headless: true, device: null, mode: 'desktop' };
let pw = null;
const playwright = () => (pw ||= require('playwright-core'));

export function isInstalled() {
  try {
    const exe = playwright().chromium.executablePath();
    return !!exe && fs.existsSync(exe);
  } catch (e) { return false; }
}

export async function install() {
  if (state.installing) return;
  Object.assign(state, { installing: true, stage: 'Downloading Chromium (about 150 MB)...', error: null });
  const cli = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js');
  const child = spawn(process.execPath, [cli, 'install', 'chromium'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PLAYWRIGHT_BROWSERS_PATH: BROWSERS }, windowsHide: true });
  let tail = '';
  const onData = (d) => { tail = (tail + d.toString()).slice(-600); const m = tail.match(/(\d+)%/g); if (m) state.stage = `Downloading Chromium... ${m[m.length - 1]}`; };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('close', (code) => {
    state.installing = false;
    if (code === 0 && isInstalled()) state.stage = '';
    else state.error = 'Install failed: ' + tail.trim().split('\n').slice(-3).join(' ');
  });
}

// ---------- browser lifecycle ----------
let ctx = null;
let remote = null; // CDP connection to Chrome/WebView inside the Android emulator
let page = null;
const logs = { console: [], network: [] };
const cap = (arr, v, n = 200) => { arr.push(v); if (arr.length > n) arr.shift(); };

function wirePage(p) {
  p.on('console', (m) => cap(logs.console, { t: Date.now(), page: p.url(), type: m.type(), text: m.text().slice(0, 400) }));
  p.on('pageerror', (e) => cap(logs.console, { t: Date.now(), page: p.url(), type: 'pageerror', text: String(e.message).slice(0, 400) }));
  p.on('response', (r) => cap(logs.network, { t: Date.now(), method: r.request().method(), url: r.url().slice(0, 200), status: r.status(), type: r.request().resourceType() }));
  p.on('requestfailed', (r) => cap(logs.network, { t: Date.now(), method: r.method(), url: r.url().slice(0, 200), status: 0, failure: r.failure()?.errorText }));
}

async function ensure() {
  if (ctx && page && !page.isClosed()) return page;
  if (remote) throw new Error('The connected Android browser page was closed. Reconnect with web_attach_android.');
  if (!isInstalled()) throw new Error('Chromium is not installed. Install it from the Web tab (or POST /api/web/install) first.');
  const { chromium, devices } = playwright();
  fs.mkdirSync(PROFILE, { recursive: true });
  const dev = state.device && devices[state.device] ? devices[state.device] : {};
  ctx = await chromium.launchPersistentContext(path.join(PROFILE, state.device ? 'mobile' : 'desktop'), { headless: state.headless, ...(state.device ? dev : { viewport: { width: 1280, height: 800 } }) });
  ctx.on('page', wirePage);
  ctx.on('close', () => { ctx = null; page = null; });
  page = ctx.pages()[0] || await ctx.newPage();
  if (!page.__wired) { wirePage(page); page.__wired = true; }
  return page;
}

export async function closeBrowser() { try { if (remote) await remote.close(); else await ctx?.close(); } catch (e) {} remote = null; ctx = null; page = null; state.mode = state.device ? 'mobile' : 'desktop'; }
export const isOpen = () => !!(ctx && page && !page.isClosed());
export async function configure({ headless, device }) {
  if (typeof headless === 'boolean') state.headless = headless;
  if (device !== undefined) state.device = device || null;
  await closeBrowser();
}
export const listDevices = () => { try { return Object.keys(playwright().devices).filter(n => !/landscape| \w+ landscape/.test(n)); } catch (e) { return []; } };

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
  if (!isInstalled()) throw new Error('Chromium (Playwright) is not installed. Install it first.');
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

// ---------- attach to the user's own desktop Chrome / Edge (they log in themselves, e.g. through bot checks) ----------
const DESKTOP_PORT = 9333;
function findDesktopBrowser() {
  const pf = process.env['ProgramFiles'] || 'C:/Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', la = process.env.LOCALAPPDATA || '';
  const c = [
    pf + '/Google/Chrome/Application/chrome.exe', pf86 + '/Google/Chrome/Application/chrome.exe', la + '/Google/Chrome/Application/chrome.exe',
    pf86 + '/Microsoft/Edge/Application/msedge.exe', pf + '/Microsoft/Edge/Application/msedge.exe'
  ];
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}
async function cdpAlive() { try { const r = await fetch('http://127.0.0.1:' + DESKTOP_PORT + '/json/version', { signal: AbortSignal.timeout(1500) }); return r.ok; } catch (e) { return false; } }
export async function attachDesktop({ launch = true } = {}) {
  if (!isInstalled()) throw new Error('Playwright browser support is not installed. Install it first (Settings -> Web).');
  if (!(await cdpAlive())) {
    if (!launch) throw new Error('Chrome is not running with remote debugging on port ' + DESKTOP_PORT + '.');
    const exe = findDesktopBrowser();
    if (!exe) throw new Error('Chrome or Edge was not found on this PC.');
    // A separate profile folder is required for remote debugging; it keeps your logins between sessions.
    const dir = path.join(BASE, 'own-chrome-profile');
    fs.mkdirSync(dir, { recursive: true });
    spawn(exe, ['--remote-debugging-port=' + DESKTOP_PORT, '--user-data-dir=' + dir, '--no-first-run', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40 && !(await cdpAlive()); i++) await new Promise(r => setTimeout(r, 500));
    if (!(await cdpAlive())) throw new Error('Chrome started but did not open the debugging port.');
  }
  await closeBrowser();
  remote = await playwright().chromium.connectOverCDP('http://127.0.0.1:' + DESKTOP_PORT, { timeout: 15000 });
  ctx = remote.contexts()[0];
  ctx.on('page', wirePage);
  for (let i = 0; i < 20 && !ctx.pages().length; i++) await new Promise(r => setTimeout(r, 250));
  page = ctx.pages()[ctx.pages().length - 1] || await ctx.newPage();
  wirePage(page); page.__wired = true;
  state.mode = 'chrome';
  return { pages: ctx.pages().length };
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

  def('web_navigate', 'Open a URL in the browser (opens Chromium if needed).', { url: { type: 'string' } }, ['url'], async (a) => {
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
    const vp = p.viewportSize() || { width: 0, height: 0 };
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
  def('web_tabs', 'List, open, switch to or close browser tabs.', { action: { type: 'string', enum: ['list', 'new', 'switch', 'close'] }, index: { type: 'number' }, url: { type: 'string' } }, ['action'], async (a) => {
    await ensure();
    const pages = ctx.pages();
    if (a.action === 'new') { page = await ctx.newPage(); if (a.url) await page.goto(a.url, { waitUntil: 'domcontentloaded' }); }
    else if (a.action === 'switch') { page = pages[a.index] || page; await page.bringToFront(); }
    else if (a.action === 'close') { const t = pages[a.index ?? pages.indexOf(page)]; await t?.close(); page = ctx.pages()[0] || (await ctx.newPage()); }
    return { ok: true, active: ctx.pages().indexOf(page), tabs: await Promise.all(ctx.pages().map(async (p, i) => ({ index: i, url: p.url(), title: await p.title().catch(() => '') }))) };
  });
  def('web_emulate', 'Emulate a mobile device (e.g. "Pixel 7", "iPhone 14") or return to desktop with device="" . Restarts the browser (cookies stay per mode).', { device: { type: 'string' } }, ['device'], async (a) => {
    if (a.device && !playwright().devices[a.device]) return { ok: false, error: 'Unknown device. Examples: Pixel 7, iPhone 14, iPad Pro 11, Galaxy S9+' };
    await configure({ device: a.device });
    return { ok: true, device: a.device || 'desktop' };
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
  def('web_attach_android', 'Connect the web_* tools to Chrome or a debuggable WebView running on the Android device/emulator (via adb + DevTools). After this, web_snapshot/click/etc. act on the phone. Use web_close to disconnect.', { serial: { type: 'string', description: 'adb serial, default emulator-5554' }, target: { type: 'string', enum: ['chrome', 'webview'] }, pid: { type: 'string', description: 'WebView process id (optional)' } }, [], async (a) => {
    if (!runAdb) return { ok: false, error: 'adb not available' };
    const r = await attachAndroid(runAdb, a.serial || 'emulator-5554', a.target || 'chrome', a.pid);
    return { ok: true, ...r, ...(await state0(page)) };
  });
  def('web_attach_chrome', "Use the user's own desktop Chrome/Edge (opened with a dedicated profile and remote debugging) instead of the built-in Chromium. The user can log in or solve any check themselves in that window; then web_* tools act on it. Use web_close to disconnect (Chrome stays open).", {}, [], async () => {
    const r = await attachDesktop();
    return { ok: true, ...r, ...(await state0(page)) };
  });
  def('web_close', 'Close the browser.', {}, [], async () => { await closeBrowser(); return { ok: true }; });
  return TOOLS;
}
