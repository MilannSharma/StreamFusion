// Assertion helpers shared by the AI tools (assert_*) and the zero-token replay runner:
// screenshot comparison against a stored baseline, crash / ANR detection from logcat.
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
export const baselineDir = (projectId) => path.join(BASE, 'baselines', String(projectId || '_adhoc').replace(/[^\w-]/g, '_'));

// Which project the AI's assertions belong to while it is recording (set by the chat router for Test mode runs).
let ctx = { projectId: null, loginTokens: [] };
export const setContext = (c) => { ctx = { projectId: null, loginTokens: [], ...c }; };
export const getContext = () => ctx;

// ---------- minimal PNG decoder (8-bit, non-interlaced; enough for Playwright and our own screenshots) ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG');
  let p = 8, w = 0, h = 0, depth = 0, ct = 0, inter = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; inter = d[12]; } else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (depth !== 8 || inter || !ch) throw new Error('Unsupported PNG format');
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], ro = y * (stride + 1) + 1, oo = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[oo + x - ch] : 0, b = y ? out[oo - stride + x] : 0, c = x >= ch && y ? out[oo - stride + x - ch] : 0, v = raw[ro + x];
      let r;
      if (ft === 0) r = v; else if (ft === 1) r = v + a; else if (ft === 2) r = v + b; else if (ft === 3) r = v + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[oo + x] = r & 255;
    }
  }
  return { w, h, ch, data: out };
}

// both images are reduced to the same 96x96 grey grid, so a different window size still compares
const GRID = 96;
function grid(img) {
  const g = new Float32Array(GRID * GRID);
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const x0 = Math.floor(gx * img.w / GRID), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * img.w / GRID));
    const y0 = Math.floor(gy * img.h / GRID), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * img.h / GRID));
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * img.w + x) * img.ch;
      s += img.ch >= 3 ? 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] : img.data[i]; n++;
    }
    g[gy * GRID + gx] = s / n;
  }
  return g;
}
export function mismatchRatio(pngA, pngB) {
  const a = grid(decodePng(pngA)), b = grid(decodePng(pngB));
  let bad = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 24) bad++;
  return bad / a.length;
}

// First run stores the baseline; later runs compare against it.
export function compareBaseline({ dir, name, png, threshold = 0.03 }) {
  const safe = String(name || '').replace(/[^\w.-]/g, '_').slice(0, 60);
  if (!safe) throw new Error('A name is required for a screenshot check');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, safe + '.png');
  if (!fs.existsSync(file)) { fs.writeFileSync(file, png); return { passed: true, state: 'baseline_created', mismatch: 0, detail: `Baseline "${safe}" saved. It is compared from the next run on.` }; }
  const m = mismatchRatio(fs.readFileSync(file), png);
  if (m <= threshold) return { passed: true, state: 'match', mismatch: m, detail: `Screen matches baseline "${safe}" (${(m * 100).toFixed(1)}% different, allowed ${(threshold * 100).toFixed(0)}%).` };
  fs.writeFileSync(path.join(dir, safe + '.actual.png'), png);
  return { passed: false, state: 'mismatch', mismatch: m, detail: `Screen differs from baseline "${safe}": ${(m * 100).toFixed(1)}% changed (allowed ${(threshold * 100).toFixed(0)}%). To accept the new look, delete the baseline.` };
}
export const resetBaseline = (dir, name) => { try { fs.rmSync(path.join(dir, String(name).replace(/[^\w.-]/g, '_') + '.png'), { force: true }); } catch (e) {} };

// ---------- crash / ANR ----------
export const clearCrashLog = (adb, serial) => adb(serial, ['logcat', '-b', 'crash', '-c'], 8000).catch(() => {});
export async function crashScan(adb, serial) {
  const crash = await adb(serial, ['logcat', '-b', 'crash', '-d', '-t', '300'], 12000);
  const lines = String(crash.output || '').split(/\r?\n/).filter(l => /FATAL EXCEPTION|Process:|AndroidRuntime|Exception|Error/.test(l)).slice(0, 6);
  const am = await adb(serial, ['logcat', '-d', '-t', '2500', 'ActivityManager:E', '*:S'], 12000);
  const anr = (String(am.output || '').match(/ANR in [^\r\n]+/) || [])[0] || '';
  const crashed = lines.some(l => /FATAL EXCEPTION/.test(l));
  return { crashed, anr: !!anr, lines, anrLine: anr };
}
