// M2: Device control layer. Every capability is a "tool" with a JSON schema, so the same
// registry powers the REST API now and the chat agent + MCP server in M3.
// All tools work on any adb device (emulator or real phone) via `serial`.
import { execFile } from 'child_process';
import zlib from 'zlib';
import path from 'path';
import { compareBaseline, baselineDir, getContext, crashScan, decodePng } from '../automation/assertions.js';

// ---------- tiny helpers ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function pngEncode(rgb, w, h) { // rgb: Buffer w*h*3
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// Box-average downscale of a raw RGBA screencap so screenshots cost fewer tokens.
function downscale(rgba, w, h, off, maxDim) {
  const s = Math.max(1, Math.max(w, h) / maxDim);
  const dw = Math.floor(w / s), dh = Math.floor(h / s);
  const out = Buffer.alloc(dw * dh * 3);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * s), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * s)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * s), x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * s)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = off + (yy * w + xx) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++; }
      const o = (y * dw + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return { rgb: out, dw, dh };
}

const KEYS = { back: 4, home: 3, recent: 187, enter: 66, delete: 67, tab: 61, menu: 82, power: 26, volume_up: 24, volume_down: 25, search: 84, space: 62, escape: 111 };
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`; // quote for the device shell
const PKG = /^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/;
const PERM = /^[A-Za-z][\w.]*$/;

export function createTools({ runAdb, adbExe, cwd }) {
  const adb = (serial, args, timeout = 10000) => runAdb(serial ? ['-s', serial, ...args] : args, timeout);
  const sh = (serial, cmd, timeout) => adb(serial, ['shell', cmd], timeout);
  const bin = (serial, args, timeout = 20000) => new Promise((resolve) =>
    execFile(adbExe, ['-s', serial, ...args], { cwd, timeout, encoding: 'buffer', maxBuffer: 96 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => resolve(err ? { ok: false, error: (stderr?.toString() || err.message).trim() } : { ok: true, data: stdout })));
  const res = (r, extra = {}) => (r.success ? { ok: true, ...extra } : { ok: false, error: r.output });
  const num = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

  async function screenSize(serial) {
    const r = await sh(serial, 'wm size');
    const m = /(\d+)x(\d+)/.exec((r.output || '').split('Override size:').pop());
    return m ? { w: +m[1], h: +m[2] } : { w: 1080, h: 2400 };
  }

  async function dumpTree(serial) {
    let xml = '', lastErr = '';
    for (let attempt = 0; attempt < 2 && !xml.includes('<node'); attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 800)); // UI busy/animating: retry
      const r = await bin(serial, ['exec-out', 'uiautomator', 'dump', '/dev/tty'], 25000);
      if (!r.ok) { lastErr = r.error; continue; }
      xml = r.data.toString('utf8');
      if (!xml.includes('<node')) lastErr = xml.trim().slice(0, 200);
    }
    if (!xml.includes('<node')) return { ok: false, error: lastErr || 'No UI hierarchy returned' };
    const nodes = [];
    for (const m of xml.matchAll(/<node\s([^>]*?)\/?>/g)) {
      const a = {};
      for (const kv of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[kv[1]] = decode(kv[2]);
      const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(a.bounds || '');
      if (!b) continue;
      const [l, t, rr, bb] = b.slice(1).map(Number);
      nodes.push({
        text: a.text || '', desc: a['content-desc'] || '', id: (a['resource-id'] || '').replace(/^.*:id\//, ''),
        cls: (a.class || '').split('.').pop(), pkg: a.package || '',
        clickable: a.clickable === 'true', scrollable: a.scrollable === 'true', checked: a.checked === 'true',
        focused: a.focused === 'true', enabled: a.enabled !== 'false',
        bounds: [l, t, rr, bb], cx: Math.round((l + rr) / 2), cy: Math.round((t + bb) / 2)
      });
    }
    if (!nodes.length) return { ok: false, error: 'No UI hierarchy returned (screen may be secure or loading)' };
    return { ok: true, nodes };
  }

  const interesting = (n) => n.text || n.desc || n.clickable || n.scrollable || (n.id && n.cls === 'EditText');

  const TOOLS = {};
  const def = (name, description, properties, required, handler, dangerous = false) => {
    TOOLS[name] = { name, description, dangerous, inputSchema: { type: 'object', properties: { serial: { type: 'string', description: 'adb serial, e.g. emulator-5554' }, ...properties }, required: ['serial', ...required] }, handler };
  };

  // ---- observe ----
  // Raw screencap moves ~10 MB over USB (about 3 s on many phones). The phone's own PNG is ~1 MB (about 1.2 s): use it, fall back to raw.
  const shotCache = new Map(); // serial -> { at, maxDim, result } : two calls within 400 ms share one capture
  def('screenshot', 'Capture the screen as a downscaled PNG (base64). Use ui_tree first; it is cheaper.', { maxDim: { type: 'number', description: 'Longest side in px (default 1024)' } }, [], async (a) => {
    const md = num(a.maxDim, 1024), hit = shotCache.get(a.serial);
    if (hit && hit.maxDim === md && Date.now() - hit.at < 400) return hit.result;
    const done = (result) => { if (result.ok) shotCache.set(a.serial, { at: Date.now(), maxDim: md, result }); return result; };
    const p = await bin(a.serial, ['exec-out', 'screencap', '-p']);
    if (p.ok && p.data.length > 1000 && p.data.readUInt32BE(0) === 0x89504e47) {
      try {
        const img = decodePng(p.data);
        if (img.ch === 4) { const { rgb, dw, dh } = downscale(img.data, img.w, img.h, 0, md); return done({ ok: true, mime: 'image/png', imageBase64: pngEncode(rgb, dw, dh).toString('base64'), imageWidth: dw, imageHeight: dh, deviceWidth: img.w, deviceHeight: img.h }); }
      } catch (e) { /* fall through to the raw path */ }
    }
    const r = await bin(a.serial, ['exec-out', 'screencap']);
    if (!r.ok) return r;
    const d = r.data, w = d.readUInt32LE(0), h = d.readUInt32LE(4);
    const off = d.length - w * h * 4;
    if (off < 12 || off > 64) return { ok: false, error: 'Unexpected screencap format' };
    const { rgb, dw, dh } = downscale(d, w, h, off, md);
    return done({ ok: true, mime: 'image/png', imageBase64: pngEncode(rgb, dw, dh).toString('base64'), imageWidth: dw, imageHeight: dh, deviceWidth: w, deviceHeight: h });
  });

  const treeCache = new Map();
  def('ui_tree', 'List visible UI elements (text, id, bounds, center x/y). Best way to see the screen. Tap using cx,cy.', { all: { type: 'boolean', description: 'Include non-interactive nodes' } }, [], async (a) => {
    const hit = treeCache.get(a.serial);
    if (hit && !a.all && Date.now() - hit.at < 500) return hit.result; // back-to-back calls share one dump
    const t0 = Date.now();
    const t = await dumpTree(a.serial);
    if (!t.ok) return { ...t, hint: 'ui_tree failed or is slow on this phone (video or animation on screen). Use screenshot instead, or wait for the screen to settle.' };
    const list = (a.all ? t.nodes : t.nodes.filter(interesting)).slice(0, 200).map((n, i) => ({ i, ...n }));
    const took = Date.now() - t0;
    const result = { ok: true, count: list.length, foreground: t.nodes.find(n => n.pkg)?.pkg || '', elements: list, ...(took > 8000 ? { hint: `ui_tree took ${Math.round(took / 1000)} s on this phone; prefer screenshot for quick looks.` } : {}) };
    if (!a.all) treeCache.set(a.serial, { at: Date.now(), result });
    return result;
  });

  def('device_info', 'Model, Android version, screen size, foreground app.', {}, [], async (a) => {
    const [model, ver, size, focus] = await Promise.all([
      sh(a.serial, 'getprop ro.product.model'), sh(a.serial, 'getprop ro.build.version.release'), screenSize(a.serial),
      sh(a.serial, 'dumpsys window | grep mCurrentFocus')]);
    return { ok: true, model: model.output, android: ver.output, screen: size, focus: (focus.output.match(/(\S+)\/(\S+?)\}?$/) || [])[1] || focus.output };
  });

  def('logcat', 'Recent logcat lines (newest last). Use level=E to find errors/crashes.', { lines: { type: 'number' }, level: { type: 'string', description: 'V,D,I,W,E,F' }, filter: { type: 'string', description: 'case-insensitive substring' } }, [], async (a) => {
    const lvl = /^[VDIWEF]$/.test(a.level || '') ? a.level : 'V';
    const r = await adb(a.serial, ['logcat', '-d', '-t', String(Math.min(num(a.lines, 100), 2000)), `*:${lvl}`], 15000);
    if (!r.success) return { ok: false, error: r.output };
    let lines = r.output.split(/\r?\n/);
    if (a.filter) { const f = String(a.filter).toLowerCase(); lines = lines.filter(l => l.toLowerCase().includes(f)); }
    return { ok: true, lines: lines.slice(-Math.min(num(a.lines, 100), 2000)) };
  });

  // ---- act ----
  def('tap', 'Tap at device pixel coordinates.', { x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y'], async (a) =>
    res(await sh(a.serial, `input tap ${num(a.x, 0)} ${num(a.y, 0)}`)));

  def('tap_element', 'Find an element by text / content-desc / id and tap its center. Prefer this over raw coordinates.', {
    text: { type: 'string' }, desc: { type: 'string' }, id: { type: 'string' }, index: { type: 'number', description: 'Which match if several (default 0)' }, exact: { type: 'boolean' }
  }, [], async (a) => {
    if (!a.text && !a.desc && !a.id) return { ok: false, error: 'Provide text, desc or id' };
    const t = await dumpTree(a.serial);
    if (!t.ok) return t;
    const eq = (v, q) => (a.exact ? v === q : v.toLowerCase().includes(String(q).toLowerCase()));
    const hits = t.nodes.filter(n => (a.text ? eq(n.text, a.text) : true) && (a.desc ? eq(n.desc, a.desc) : true) && (a.id ? n.id === a.id || eq(n.id, a.id) : true));
    const hit = hits[num(a.index, 0)];
    if (!hit) return { ok: false, error: 'Element not found', matches: hits.length };
    const r = await sh(a.serial, `input tap ${hit.cx} ${hit.cy}`);
    return res(r, { tapped: { text: hit.text, desc: hit.desc, id: hit.id, x: hit.cx, y: hit.cy }, matches: hits.length });
  });

  def('long_press', 'Press and hold at coordinates.', { x: { type: 'number' }, y: { type: 'number' }, durationMs: { type: 'number' } }, ['x', 'y'], async (a) =>
    res(await sh(a.serial, `input swipe ${num(a.x, 0)} ${num(a.y, 0)} ${num(a.x, 0)} ${num(a.y, 0)} ${num(a.durationMs, 800)}`)));

  def('swipe', 'Swipe between two points.', { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' }, durationMs: { type: 'number' } }, ['x1', 'y1', 'x2', 'y2'], async (a) =>
    res(await sh(a.serial, `input swipe ${num(a.x1, 0)} ${num(a.y1, 0)} ${num(a.x2, 0)} ${num(a.y2, 0)} ${num(a.durationMs, 300)}`)));

  def('scroll', 'Scroll the screen content in a direction (content moves the opposite way of the finger).', { direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] } }, ['direction'], async (a) => {
    const { w, h } = await screenSize(a.serial);
    const cx = Math.round(w / 2), cy = Math.round(h / 2), dy = Math.round(h * 0.3), dx = Math.round(w * 0.3);
    const m = { down: [cx, cy + dy, cx, cy - dy], up: [cx, cy - dy, cx, cy + dy], right: [cx + dx, cy, cx - dx, cy], left: [cx - dx, cy, cx + dx, cy] }[a.direction];
    if (!m) return { ok: false, error: 'direction must be up/down/left/right' };
    return res(await sh(a.serial, `input swipe ${m.join(' ')} 350`));
  });

  def('type_text', 'Type text into the focused field. ASCII only (adb limitation).', { text: { type: 'string' } }, ['text'], async (a) => {
    const t = String(a.text);
    if (/[^\x20-\x7e]/.test(t)) return { ok: false, error: 'Only printable ASCII is supported by adb input' };
    // adb "input text" turns "%s" into a space, so a space right after a literal "%" is sent as a key press.
    const parts = t.split(/(?<=%) /);
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) { const k = await sh(a.serial, 'input keyevent 62'); if (!k.success) return { ok: false, error: k.output }; }
      if (parts[i]) {
        const r = await sh(a.serial, `input text ${sq(parts[i].replace(/ /g, '%s'))}`, 20000);
        if (!r.success) return { ok: false, error: r.output };
      }
    }
    return { ok: true };
  });

  def('key', 'Press a key: back, home, recent, enter, delete, tab, menu, power, volume_up, volume_down, search, space, escape, or a numeric keycode.', { key: { type: 'string' } }, ['key'], async (a) => {
    const code = KEYS[String(a.key).toLowerCase()] ?? (/^\d+$/.test(a.key) ? Number(a.key) : null);
    if (code == null) return { ok: false, error: `Unknown key. Use one of: ${Object.keys(KEYS).join(', ')}` };
    return res(await sh(a.serial, `input keyevent ${code}`));
  });

  // ---- apps ----
  def('list_apps', 'List installed third-party apps.', {}, [], async (a) => {
    const r = await sh(a.serial, 'pm list packages -3');
    return r.success ? { ok: true, packages: r.output.split(/\r?\n/).map(l => l.replace('package:', '').trim()).filter(Boolean) } : { ok: false, error: r.output };
  });
  def('launch_app', 'Launch an app by package name.', { package: { type: 'string' } }, ['package'], async (a) => {
    if (!PKG.test(a.package)) return { ok: false, error: 'Invalid package name' };
    const r = await sh(a.serial, `monkey -p ${a.package} -c android.intent.category.LAUNCHER 1`);
    return r.success && !/No activities found|monkey aborted/i.test(r.output) ? { ok: true } : { ok: false, error: r.output || 'Launch failed' };
  });
  def('stop_app', 'Force-stop an app.', { package: { type: 'string' } }, ['package'], async (a) =>
    PKG.test(a.package) ? res(await sh(a.serial, `am force-stop ${a.package}`)) : { ok: false, error: 'Invalid package name' });
  def('clear_data', 'Wipe an app\'s data (like a fresh install).', { package: { type: 'string' } }, ['package'], async (a) =>
    PKG.test(a.package) ? res(await sh(a.serial, `pm clear ${a.package}`)) : { ok: false, error: 'Invalid package name' }, true);
  def('install_apk', 'Install an APK from a path on the host PC (replaces existing, grants runtime permissions).', { path: { type: 'string' } }, ['path'], async (a) => {
    const r = await adb(a.serial, ['install', '-r', '-g', path.resolve(String(a.path))], 120000);
    return r.success && /Success/i.test(r.output) ? { ok: true } : { ok: false, error: r.output };
  }, true);
  def('uninstall_app', 'Uninstall an app.', { package: { type: 'string' } }, ['package'], async (a) =>
    PKG.test(a.package) ? res(await adb(a.serial, ['uninstall', a.package], 30000)) : { ok: false, error: 'Invalid package name' }, true);
  def('grant_permission', 'Grant or revoke a runtime permission, e.g. android.permission.CAMERA.', { package: { type: 'string' }, permission: { type: 'string' }, revoke: { type: 'boolean' } }, ['package', 'permission'], async (a) =>
    PKG.test(a.package) && PERM.test(a.permission) ? res(await sh(a.serial, `pm ${a.revoke ? 'revoke' : 'grant'} ${a.package} ${a.permission}`)) : { ok: false, error: 'Invalid package or permission' });

  // ---- environment ----
  def('set_location', 'Mock GPS location (emulator only).', { lat: { type: 'number' }, lon: { type: 'number' } }, ['lat', 'lon'], async (a) => {
    if (!/^emulator-/.test(a.serial)) return { ok: false, error: 'Only supported on the emulator' };
    return res(await adb(a.serial, ['emu', 'geo', 'fix', String(Number(a.lon)), String(Number(a.lat))]));
  });
  def('set_battery', 'Mock battery level 0-100 (use reset=true to restore).', { level: { type: 'number' }, reset: { type: 'boolean' } }, [], async (a) =>
    res(await sh(a.serial, a.reset ? 'dumpsys battery reset' : `dumpsys battery set level ${Math.min(100, Math.max(0, num(a.level, 50)))}`)));
  def('set_network', 'Turn wifi / mobile data on or off.', { wifi: { type: 'boolean' }, data: { type: 'boolean' } }, [], async (a) => {
    const out = [];
    if (typeof a.wifi === 'boolean') out.push(await sh(a.serial, `svc wifi ${a.wifi ? 'enable' : 'disable'}`));
    if (typeof a.data === 'boolean') out.push(await sh(a.serial, `svc data ${a.data ? 'enable' : 'disable'}`));
    return out.every(r => r.success) ? { ok: true } : { ok: false, error: out.map(r => r.output).join(' ') };
  });
  def('rotate', 'Set screen orientation: portrait, landscape, reverse_portrait, reverse_landscape, or auto.', { orientation: { type: 'string' } }, ['orientation'], async (a) => {
    const map = { portrait: 0, landscape: 1, reverse_portrait: 2, reverse_landscape: 3 };
    if (a.orientation === 'auto') return res(await sh(a.serial, 'settings put system accelerometer_rotation 1'));
    if (!(a.orientation in map)) return { ok: false, error: 'Unknown orientation' };
    const r = await sh(a.serial, `settings put system accelerometer_rotation 0 && settings put system user_rotation ${map[a.orientation]}`);
    return res(r);
  });
  def('push_file', 'Copy a file from the PC to the device.', { local: { type: 'string' }, remote: { type: 'string' } }, ['local', 'remote'], async (a) =>
    res(await adb(a.serial, ['push', path.resolve(String(a.local)), String(a.remote)], 120000)));
  def('pull_file', 'Copy a file from the device to the PC.', { remote: { type: 'string' }, local: { type: 'string' } }, ['remote', 'local'], async (a) =>
    res(await adb(a.serial, ['pull', String(a.remote), path.resolve(String(a.local))], 120000)));
  def('shell', 'Run an arbitrary adb shell command. Powerful: gated by approval in M7.', { command: { type: 'string' } }, ['command'], async (a) => {
    const r = await sh(a.serial, String(a.command), 30000);
    return { ok: r.success, output: r.output.slice(0, 20000) };
  }, true);

  // ---- assertions: the AI uses these to pin its pass criteria; the zero-token replay runs the same checks ----
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  def('assert_text', 'Assert that text is (visible=true, default) or is not (visible=false) on the phone screen. Waits up to timeoutMs (default 6000). Call it before report_check so the pass criterion is recorded and can be replayed without AI. Result: passed true/false.', {
    text: { type: 'string' }, visible: { type: 'boolean' }, exact: { type: 'boolean' }, timeoutMs: { type: 'number' }
  }, ['text'], async (a) => {
    const want = a.visible !== false, end = Date.now() + num(a.timeoutMs, 6000), q = String(a.text).toLowerCase();
    let found = false, seen = false, lastErr = '';
    for (;;) {
      const t = await dumpTree(a.serial);
      if (t.ok) { seen = true; found = t.nodes.some(n => (a.exact ? n.text === a.text || n.desc === a.text : n.text.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q))); if (found === want) break; } else lastErr = t.error;
      if (Date.now() >= end) break;
      await sleep(700);
    }
    if (!seen) return { ok: false, error: lastErr || 'Could not read the screen' };
    return { ok: true, passed: found === want, detail: found === want ? `"${a.text}" is ${want ? 'visible' : 'not visible'}` : `"${a.text}" is ${found ? 'visible' : 'not visible'} but should ${want ? '' : 'not '}be` };
  });
  def('assert_no_crash', 'Assert that no app crash (FATAL EXCEPTION) or ANR happened since logcat was last cleared. Result: passed true/false.', {}, [], async (a) => {
    const s = await crashScan(adb, a.serial);
    const bad = s.crashed || s.anr;
    return { ok: true, passed: !bad, detail: bad ? (s.crashed ? 'App crashed: ' + s.lines.slice(0, 3).join(' | ') : s.anrLine) : 'No crash or ANR found', lines: bad ? s.lines : undefined };
  });
  def('assert_screenshot', 'Compare the screen with a stored baseline image called name (the first call creates the baseline). threshold = allowed fraction of changed area (default 0.03). Result: passed true/false.', { name: { type: 'string' }, threshold: { type: 'number' } }, ['name'], async (a) => {
    const sc = await TOOLS.screenshot.handler({ serial: a.serial, maxDim: 540 });
    if (!sc.ok) return sc;
    try { const r = compareBaseline({ dir: a.baselineDir || baselineDir(getContext().projectId), name: a.name, png: Buffer.from(sc.imageBase64, 'base64'), threshold: a.threshold }); return { ok: true, passed: r.passed, detail: r.detail, state: r.state }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  return TOOLS;
}
