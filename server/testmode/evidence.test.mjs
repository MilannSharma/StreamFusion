import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
const { createRun, addCheck, cleanCheck } = await import('../testmode/runs.js');
const { setActiveRun, attachEvidence } = await import('../testmode/evidence.js');
const { batchTool } = await import('../agent/batch.js');
const { buildPdf } = await import('../testmode/report.js');
import zlib from 'zlib';
function mkpng(v) { const w=8,h=8; const raw=Buffer.alloc((w*3+1)*h); for(let y=0;y<h;y++){raw[y*(w*3+1)]=0; for(let x=0;x<w*3;x++) raw[y*(w*3+1)+1+x]=(v*40+x)%256;}
  const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  const crc=(b)=>{let c=~0;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (~c)>>>0;};
  const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]); }
let shotNo = 0;
const TOOLS = {
  screenshot: { handler: async () => ({ ok: true, imageBase64: mkpng(++shotNo).toString('base64') }) },
  ui_tree: { handler: async () => ({ ok: true, foreground: 'com.x.app', elements: [{ text: 'Login', clickable: true, bounds: [10, 10, 40, 40], cls: 'Button' }] }) },
  tap: { handler: async () => ({ ok: true }) },
  assert_text: { handler: async () => ({ ok: true, passed: true }) },
  assert_no_crash: { handler: async () => ({ ok: true, passed: true }) },
  shell: { handler: async ({ command }) => ({ ok: true, output: /size/.test(command) ? 'Physical size: 1080x2400' : /density/.test(command) ? 'Physical density: 420' : /gfxinfo/.test(command) ? 'Total frames rendered: 100\nJanky frames: 40 (40.00%)' : /meminfo/.test(command) ? 'TOTAL PSS:   204800' : '' }) },
};
const batch = batchTool(TOOLS, 'phone');

test('each case keeps its own screenshots even when all are reported at the end', async () => {
  const run = createRun({ title: 'Demo - Login', serial: 'emulator-5554' });
  setActiveRun(run);
  const grab = async () => TOOLS.screenshot.handler({}).then(r => r.imageBase64);
  // case 1 and case 2 run with their ids, but both are reported at the END (the old bug)
  for (const id of ['TC-01', 'TC-02']) { const r = await batch.handler({ serial: 'x', case: id, steps: [{ tool: 'tap' }, { tool: 'assert_text' }] }); assert.equal(r.ran, 2); }
  assert.equal(run.frames.length, 4);
  const seen = [];
  for (const id of ['TC-01', 'TC-02', 'TC-03']) { const ck = cleanCheck({ id, title: id, status: 'pass', evidence: 'ok' }); const ev = await attachEvidence(run, ck, grab); addCheck(run, { ...ck, ...ev }); if (id === 'TC-03') assert.equal(ev.screenshots.length, 0); else assert.equal(ev.screenshots.length, 2); seen.push(...ev.screenshots.map(s => s.file)); }
  assert.ok(run.health.events.some(e => e.type === 'performance'));
  assert.equal(new Set(seen).size, seen.length); // a frame is never shown on two cases
  assert.ok((await buildPdf(run)).length > 1000);
});
