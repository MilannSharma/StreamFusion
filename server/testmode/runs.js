// Test Mode: stores each AI test run (checks + evidence screenshots) on disk and builds DOCX / PDF reports.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ShadingType, PageBreak } from 'docx';
import PDFDocument from 'pdfkit';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
export const REPORTS_DIR = path.join(BASE, 'reports');
const ID_RE = /^run-[\w-]+$/;
const COLORS = { pass: '16A34A', fail: 'DC2626', blocked: 'D97706', info: '64748B' };

const runDir = (id) => path.join(REPORTS_DIR, id);
const readRun = (id) => JSON.parse(fs.readFileSync(path.join(runDir(id), 'run.json'), 'utf8'));
const save = (run) => fs.writeFileSync(path.join(runDir(run.id), 'run.json'), JSON.stringify(run, null, 1));

export function createRun({ title, model, serial, attachments = [], instructions = '', deviceInfo = null }) {
  const id = 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.mkdirSync(path.join(runDir(id), 'shots'), { recursive: true });
  const run = { id, title: title || 'Test run', model, serial, startedAt: new Date().toISOString(), finishedAt: null, instructions, attachments: attachments.map(a => a.name), deviceInfo, checks: [], steps: [], summary: '', status: 'running' };
  save(run);
  return run;
}

export function saveShot(run, base64, tag) {
  const file = `shots/${String(run.checks.length + run.steps.length).padStart(3, '0')}-${tag}.png`;
  fs.writeFileSync(path.join(runDir(run.id), file), Buffer.from(base64, 'base64'));
  return file;
}

export function addStep(run, step) { run.steps.push({ t: new Date().toISOString(), ...step }); if (run.steps.length % 5 === 0) save(run); }
export function addCheck(run, check) { run.checks.push({ t: new Date().toISOString(), ...check }); save(run); }
export function finishRun(run, summary, reason) {
  run.finishedAt = new Date().toISOString(); run.summary = summary || run.summary;
  const f = run.checks.filter(c => c.status === 'fail').length;
  run.status = reason && reason !== 'complete' ? 'aborted' : f ? 'failed' : run.checks.length ? 'passed' : 'no-checks';
  save(run);
}

export function listRuns() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs.readdirSync(REPORTS_DIR).filter(d => ID_RE.test(d) && fs.existsSync(path.join(runDir(d), 'run.json'))).sort().reverse().map(d => {
    const r = readRun(d);
    const n = (s) => r.checks.filter(c => c.status === s).length;
    return { id: r.id, title: r.title, startedAt: r.startedAt, status: r.status, total: r.checks.length, pass: n('pass'), fail: n('fail'), blocked: n('blocked') };
  });
}
export const getRun = (id) => (ID_RE.test(id) && fs.existsSync(path.join(runDir(id), 'run.json')) ? readRun(id) : null);
export const shotPath = (id, rel) => { const p = path.join(runDir(id), rel); return ID_RE.test(id) && p.startsWith(runDir(id) + path.sep) && fs.existsSync(p) ? p : null; };

const counts = (r) => ({ pass: r.checks.filter(c => c.status === 'pass').length, fail: r.checks.filter(c => c.status === 'fail').length, blocked: r.checks.filter(c => c.status === 'blocked').length });
const dur = (r) => { const s = Math.round((new Date(r.finishedAt || Date.now()) - new Date(r.startedAt)) / 1000); return `${Math.floor(s / 60)}m ${s % 60}s`; };
const png = (run, rel) => { const p = rel && shotPath(run.id, rel); return p ? fs.readFileSync(p) : null; };
const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

export async function buildDocx(run) {
  const c = counts(run);
  const P = (text, o = {}) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: String(text), ...o })] });
  const H = (text, level) => new Paragraph({ heading: level, children: [new TextRun(text)] });
  const kids = [
    H(run.title, HeadingLevel.TITLE),
    P(`Run ${run.id} · ${new Date(run.startedAt).toLocaleString()} · duration ${dur(run)}`, { color: '64748B' }),
    P(`Device: ${run.serial}${run.deviceInfo?.model ? ' (' + run.deviceInfo.model + ')' : ''} · AI model: ${run.model}`, { color: '64748B' }),
    H('Summary', HeadingLevel.HEADING_1),
    P(`Result: ${run.status.toUpperCase()} — ${c.pass} passed, ${c.fail} failed, ${c.blocked} blocked, ${run.checks.length} total`, { bold: true, color: COLORS[c.fail ? 'fail' : 'pass'] }),
    P(run.summary || 'No summary was written.'),
    H('Results', HeadingLevel.HEADING_1),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: ['#', 'Check', 'Status'].map(h => new TableCell({ shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' }, children: [P(h, { bold: true })] })) }),
        ...run.checks.map((k, i) => new TableRow({ children: [
          new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, children: [P(k.id || i + 1)] }),
          new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, children: [P(k.title)] }),
          new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [P(k.status.toUpperCase(), { bold: true, color: COLORS[k.status] || COLORS.info })] })
        ] }))
      ]
    }),
    H('Details and evidence', HeadingLevel.HEADING_1)
  ];
  run.checks.forEach((k, i) => {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${k.id || i + 1}. ${k.title} — `), new TextRun({ text: k.status.toUpperCase(), color: COLORS[k.status] || COLORS.info })] }));
    kids.push(P(k.evidence || '(no evidence note)'));
    const b = png(run, k.screenshot);
    if (b) { const { w, h } = pngSize(b); const W = Math.min(260, w); kids.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: b, transformation: { width: W, height: Math.round(W * h / w) } })] })); }
  });
  if (run.steps.length) {
    kids.push(new Paragraph({ children: [new PageBreak()] }), H('Action log', HeadingLevel.HEADING_1));
    run.steps.forEach((s, i) => kids.push(P(`${i + 1}. ${s.name} ${s.input ? JSON.stringify(s.input).slice(0, 140) : ''} → ${s.ok ? 'ok' : 'FAILED'}${s.summary ? ' (' + s.summary + ')' : ''}`, { size: 18 })));
  }
  return Packer.toBuffer(new Document({ sections: [{ children: kids }] }));
}

export function buildPdf(run) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const bufs = []; doc.on('data', d => bufs.push(d)); doc.on('end', () => resolve(Buffer.concat(bufs))); doc.on('error', reject);
    const c = counts(run); const hex = (s) => '#' + (COLORS[s] || COLORS.info);
    doc.fontSize(22).fillColor('#0f172a').text(run.title);
    doc.fontSize(9.5).fillColor('#64748b').text(`Run ${run.id} · ${new Date(run.startedAt).toLocaleString()} · duration ${dur(run)}`)
      .text(`Device: ${run.serial}${run.deviceInfo?.model ? ' (' + run.deviceInfo.model + ')' : ''} · AI model: ${run.model}`).moveDown();
    doc.fontSize(14).fillColor('#0f172a').text('Summary').moveDown(0.3);
    doc.fontSize(11).fillColor(c.fail ? hex('fail') : hex('pass')).text(`${run.status.toUpperCase()} — ${c.pass} passed, ${c.fail} failed, ${c.blocked} blocked, ${run.checks.length} total`);
    doc.fillColor('#334155').text(run.summary || 'No summary was written.').moveDown();
    doc.fontSize(14).fillColor('#0f172a').text('Results').moveDown(0.3);
    run.checks.forEach((k, i) => { doc.fontSize(10.5).fillColor('#334155').text(`${k.id || i + 1}. ${k.title}  `, { continued: true }).fillColor(hex(k.status)).text(k.status.toUpperCase()); });
    doc.moveDown().fontSize(14).fillColor('#0f172a').text('Details and evidence');
    run.checks.forEach((k, i) => {
      doc.moveDown(0.6);
      if (doc.y > 600) doc.addPage();
      doc.fontSize(12).fillColor('#0f172a').text(`${k.id || i + 1}. ${k.title}  `, { continued: true }).fillColor(hex(k.status)).text(k.status.toUpperCase());
      doc.fontSize(10).fillColor('#334155').text(k.evidence || '(no evidence note)');
      const b = png(run, k.screenshot);
      if (b) { const { w, h } = pngSize(b); const W = Math.min(200, w), Hh = W * h / w; if (doc.y + Hh > 780) doc.addPage(); doc.moveDown(0.3); doc.image(b, { width: W }); }
    });
    if (run.steps.length) {
      doc.addPage().fontSize(14).fillColor('#0f172a').text('Action log').moveDown(0.3);
      run.steps.forEach((s, j) => doc.fontSize(8.5).fillColor('#475569').text(`${j + 1}. ${s.name} ${s.input ? JSON.stringify(s.input).slice(0, 120) : ''} → ${s.ok ? 'ok' : 'FAILED'}`));
    }
    doc.end();
  });
}
