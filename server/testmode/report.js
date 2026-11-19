// Full test report (DOCX + PDF): verdict and metrics, scope and personas, defects, per-case steps / expected / actual with screenshots,
// coverage (what was NOT tested) and improvement suggestions.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ShadingType, PageBreak, BorderStyle, AlignmentType, Footer } from 'docx';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shotPath } from './runs.js';

// ---------- branding ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const logo = (() => { for (const rel of ['../../public/StreamFusion-128.png', '../../dist/StreamFusion-128.png']) { try { return fs.readFileSync(path.join(here, rel)); } catch (e) {} } return null; })();
const BRAND = '4F46E5';

// Product / feature / app are written into the brief as "Product: ...", "Feature / module: ...", "App (name or package): ..."
export function appInfo(run) {
  const t = String(run.instructions || ''), g = (re) => (t.match(re)?.[1] || '').trim();
  const cases = (t.match(/^\s*(?:TC[-\s]?\d+|\d+[.)])/gim) || []).length;
  return {
    product: g(/^Product:\s*(.+)$/im) || String(run.title || '').split(' - ')[0],
    module: g(/^Feature \/ module:\s*(.+)$/im) || String(run.title || '').split(' - ').slice(1).join(' - '),
    target: g(/^(?:App \(name or package\)|URL\(s\)):\s*(.+)$/im),
    isWeb: /^URL\(s\):/im.test(t), cases
  };
}


const COLORS = { pass: '16A34A', fail: 'DC2626', blocked: 'D97706', info: '64748B' };
const SEV_COLOR = { critical: '991B1B', major: 'DC2626', minor: 'D97706', cosmetic: '64748B' };
const SEV_ORDER = ['critical', 'major', 'minor', 'cosmetic'];
const SEV_HELP = { critical: 'blocks the feature or loses data', major: 'feature works wrongly', minor: 'small problem, workaround exists', cosmetic: 'looks wrong only' };
const cap = (s) => String(s || '').replace(/^./, c => c.toUpperCase());

const png = (run, rel) => { const p = rel && shotPath(run.id, rel); return p ? fs.readFileSync(p) : null; };
const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const fmtDur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`; };

// ---------- numbers shared by DOCX and PDF ----------
export function analyze(run) {
  const checks = run.checks || [], rep = run.report || {};
  const n = (s) => checks.filter(c => c.status === s).length;
  const pass = n('pass'), fail = n('fail'), blocked = n('blocked'), total = checks.length;
  const t0 = new Date(run.startedAt).getTime(), t1 = new Date(run.finishedAt || Date.now()).getTime();
  const group = (key, fallback) => {
    const m = new Map();
    for (const c of checks) { const k = (c[key] || fallback).trim() || fallback; const g = m.get(k) || { name: k, pass: 0, fail: 0, blocked: 0, total: 0 }; g[c.status] = (g[c.status] || 0) + 1; g.total++; m.set(k, g); }
    return [...m.values()];
  };
  // every failed / blocked check is a defect; the AI can also list problems it saw while a case still passed (rep.defects)
  const defects = [
    ...checks.map((c, i) => ({ c, i })).filter(({ c }) => c.status !== 'pass').map(({ c, i }) => ({
      from: 'check', checkIndex: i, ref: c.id || 'TC-' + (i + 1), title: c.title, severity: c.severity || (c.status === 'fail' ? 'major' : 'minor'), category: c.category || 'functional',
      location: c.location || c.module || '', steps: c.steps || [], expected: c.expected || '', actual: c.actual || c.evidence || '', screenshot: c.screenshot, status: c.status, persona: c.persona || ''
    })),
    ...(rep.defects || []).map((d, i) => ({ from: 'observed', ref: 'OBS-' + (i + 1), ...d, severity: SEV_ORDER.includes(d.severity) ? d.severity : 'minor', status: 'observed' }))
  ].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const bySeverity = SEV_ORDER.map(s => ({ name: s, count: defects.filter(d => d.severity === s).length }));
  const verdict = !total ? 'NO RESULTS' : run.status === 'aborted' ? 'INCOMPLETE' : bySeverity[0].count ? 'FAIL: CRITICAL ISSUES' : fail ? 'FAIL' : blocked ? 'PASS WITH BLOCKED CASES' : 'PASS';
  const steps = run.steps || [];
  return {
    pass, fail, blocked, total, passRate: total ? Math.round(pass / total * 100) : 0, durationMs: t1 - t0, avgMs: total ? Math.round((t1 - t0) / total) : 0,
    actions: steps.length, failedActions: steps.filter(s => !s.ok).length, defects, bySeverity, verdict,
    byModule: group('module', 'General'), byPersona: group('persona', 'General user'), byCategory: group('category', 'functional'),
    personas: rep.personas || [], coverage: rep.coverage || { tested: [], notTested: [] }, suggestions: rep.suggestions || [], risks: rep.risks || []
  };
}

// What is written for one test case: description, steps performed, issues while performing, expected, result with remark, how to fix
export function caseFields(k) {
  const n = (l) => (l || []).map((x, j) => `${j + 1}. ${x}`).join('\n');
  const result = [k.status === 'pass' ? 'Passed.' : k.status === 'fail' ? 'Failed.' : 'Blocked.', k.actual || k.evidence, k.remark && 'Remark: ' + k.remark].filter(Boolean).join(' ');
  return [
    ['Description', k.description || ''], ['Steps performed', n(k.steps)], ['Issues while performing', (k.issues || []).map(x => '• ' + x).join('\n')],
    ['Expected', k.expected || ''], ['Result', result], ['How to fix', k.suggestion || '']
  ].filter(f => f[1]);
}
const caseMeta = (k) => [k.module && 'Feature: ' + k.module, k.persona && 'User: ' + k.persona, k.category && 'Type: ' + k.category, k.severity && k.status !== 'pass' && 'Severity: ' + k.severity, k.location && 'Where: ' + k.location].filter(Boolean).join('  ·  ');

export function appRows(run, a) {
  const i = appInfo(run), dev = run.deviceInfo;
  const feats = (a.coverage.tested.length ? a.coverage.tested : a.byModule.map(m => m.name));
  return [
    ['Project / product', i.product || '-'], ['Feature / module under test', i.module || a.byModule.map(m => m.name).join(', ') || '-'],
    [i.isWeb ? 'Website (URL)' : 'App (name / package)', i.target || '-'], ['Platform', i.isWeb ? 'Web browser' : 'Android'],
    ['Device', i.isWeb ? '-' : `${run.serial}${dev?.model ? ' (' + dev.model + (dev.androidVersion ? ', Android ' + dev.androidVersion : '') + ')' : ''}`],
    ['Features / pages covered', feats.join(', ') || '-'], ['Roles tested', (a.personas.length ? a.personas.map(x => x.name) : a.byPersona.map(x => x.name)).join(', ') || '-'],
    ['Documents used', run.attachments?.length ? run.attachments.map(x => x.name || x).join(', ') : 'None'], ['Report ID', run.id]
  ];
}

// ---------- DOCX ----------
export async function buildDocx(run) {
  const a = analyze(run);
  const P = (text, o = {}) => new Paragraph({ spacing: { after: 90 }, ...(o.align ? { alignment: o.align } : {}), children: [new TextRun({ text: String(text ?? ''), ...o })] });
  const H = (text, level) => new Paragraph({ heading: level, spacing: { before: 240, after: 100 }, children: [new TextRun(text)] });
  const cell = (text, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.PERCENTAGE }, ...(o.fill ? { shading: { type: ShadingType.CLEAR, fill: o.fill } } : {}), children: String(text ?? '').split('\n').map(l => P(l, { size: 18, ...o })) });
  const table = (headers, rows, widths) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { bold: true, fill: 'E2E8F0' })) }),
      ...rows.map(r => new TableRow({ children: r.map((v, i) => (v && typeof v === 'object' ? cell(v.text, widths[i], { bold: true, color: v.color }) : cell(v, widths[i]))) }))]
  });
  const st = (s) => ({ text: cap(s), color: COLORS[s] || SEV_COLOR[s] || COLORS.info });
  const bar = () => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: ['pass', 'fail', 'blocked'].filter(s => a[s] > 0).map(s => new TableCell({ width: { size: Math.max(4, Math.round(a[s] / a.total * 100)), type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: COLORS[s] }, children: [P(`${a[s]} ${s}`, { color: 'FFFFFF', bold: true, size: 16, align: AlignmentType.CENTER })] })) })] });
  const img = (b, max = 240) => { const { w, h } = pngSize(b); const W = Math.min(max, w); return new Paragraph({ children: [new ImageRun({ type: 'png', data: b, transformation: { width: W, height: Math.round(W * h / w) } })] }); };

  const kids = [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [logo ? new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 44, height: 44 } })] }) : P('')] }),
      new TableCell({ width: { size: 92, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: 'StreamFusion', bold: true, size: 34, color: BRAND })] }), P('AI-assisted app and web testing · Test report', { color: '64748B', size: 17 })] })
    ] })] }),
    P(''),
    P('TEST REPORT', { color: '64748B', bold: true, size: 18 }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(run.title)] }),
    P(`${new Date(run.startedAt).toLocaleString()} · ${fmtDur(a.durationMs)} · ${run.id}`, { color: '64748B' }),
    H('1. Result at a glance', HeadingLevel.HEADING_1),
    P(a.verdict, { bold: true, size: 32, color: a.verdict.startsWith('PASS') ? COLORS.pass : a.verdict === 'INCOMPLETE' ? COLORS.blocked : COLORS.fail }),
    ...(a.total ? [bar(), P('')] : []),
    table(['Measure', 'Value'], [
      ['Test cases run', String(a.total)], ['Passed / Failed / Blocked', `${a.pass} / ${a.fail} / ${a.blocked}`], ['Pass rate', a.passRate + '%'],
      ['Defects found', `${a.defects.length} (${a.bySeverity.filter(s => s.count).map(s => s.count + ' ' + s.name).join(', ') || 'none'})`],
      ['Total time / average per case', `${fmtDur(a.durationMs)} / ${fmtDur(a.avgMs)}`], ['Actions performed', `${a.actions}${a.failedActions ? ` (${a.failedActions} failed)` : ''}`],
      ['Tested on', `${run.serial}${run.deviceInfo?.model ? ' (' + run.deviceInfo.model + (run.deviceInfo.androidVersion ? ', Android ' + run.deviceInfo.androidVersion : '') + ')' : ''}`], ['Tested by', run.model]
    ], [38, 62]),
    H('2. Summary', HeadingLevel.HEADING_1),
    P(run.summary || 'No summary was written.')
  ];
  const top = a.defects.slice(0, 5);
  if (top.length) { kids.push(P('Most important findings', { bold: true })); top.forEach(d => kids.push(P(`• [${cap(d.severity)}] ${d.title}${d.location ? ' (' + d.location + ')' : ''}`))); }

  kids.push(H('3. Scope and approach', HeadingLevel.HEADING_1), P('Application under test', { bold: true }), table(['Item', 'Details'], appRows(run, a), [30, 70]), P(''), P('Brief', { bold: true }), P(run.instructions ? String(run.instructions).slice(0, 1500) : 'No brief was recorded.', { size: 18 }));
  if (run.attachments?.length) kids.push(P('Documents used: ' + run.attachments.join(', '), { size: 18, color: '64748B' }));
  const personas = a.personas.length ? a.personas : a.byPersona.map(p => ({ name: p.name, notes: '' }));
  kids.push(P('Tested from the point of view of:', { bold: true }), table(['User / role', 'What this user wants', 'Cases', 'Pass'], personas.map(p => { const g = a.byPersona.find(x => x.name === p.name); return [p.name, p.goal || p.notes || '', g ? String(g.total) : '0', g ? `${g.pass}/${g.total}` : '-']; }), [24, 46, 12, 18]));

  kids.push(H('4. Results breakdown', HeadingLevel.HEADING_1),
    P('By feature / page', { bold: true }), table(['Feature / page', 'Cases', 'Pass', 'Fail', 'Blocked'], a.byModule.map(m => [m.name, String(m.total), String(m.pass), String(m.fail), String(m.blocked)]), [40, 15, 15, 15, 15]),
    P(''), P('By type of check', { bold: true }), table(['Type', 'Cases', 'Pass', 'Fail', 'Blocked'], a.byCategory.map(m => [cap(m.name), String(m.total), String(m.pass), String(m.fail), String(m.blocked)]), [40, 15, 15, 15, 15]));

  kids.push(H('5. Defects', HeadingLevel.HEADING_1));
  if (!a.defects.length) kids.push(P('No defects were found in the cases that were run.'));
  else {
    kids.push(P('Severity: ' + SEV_ORDER.map(s => `${cap(s)} = ${SEV_HELP[s]}`).join('; ') + '.', { size: 17, color: '64748B' }),
      table(['Ref', 'Severity', 'Where (page / button)', 'Problem', 'Expected → Actual'], a.defects.map(d => [d.ref, st(d.severity), d.location || '-', d.title, [d.expected && 'Expected: ' + d.expected, d.actual && 'Actual: ' + d.actual].filter(Boolean).join('\n') || '-']), [8, 11, 20, 26, 35]));
  }

  kids.push(H('6. Test case results', HeadingLevel.HEADING_1),
    table(['#', 'Check', 'Feature', 'User', 'Result'], run.checks.map((k, i) => [k.id || String(i + 1), k.title, k.module || '', k.persona || '', st(k.status)]), [8, 42, 20, 16, 14]));

  kids.push(H('7. Details and evidence', HeadingLevel.HEADING_1));
  const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, NOB = { top: NB, bottom: NB, left: NB, right: NB };
  run.checks.forEach((k, i) => {
    const col = COLORS[k.status] || COLORS.info, code = k.id || String(i + 1);
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, keepNext: true, children: [new TextRun(`${code}. ${k.title}  `), new TextRun({ text: k.status.toUpperCase(), color: col })] }));
    const meta = caseMeta(k); if (meta) kids.push(P(meta, { size: 17, color: '64748B' }));
    const b = png(run, k.screenshot); let im = null; if (b) { try { im = img(b, 105); } catch (e) {} }
    const left = im ? [im, P(`${code} · ${k.status.toUpperCase()}`, { bold: true, size: 15, color: col }), ...(k.remark ? [P(k.remark, { size: 14, italics: true, color: '64748B' })] : [])] : [P('')];
    const right = caseFields(k).flatMap(([label, text]) => [P(label, { bold: true, size: 17, color: '475569' }), ...String(text).split('\n').map(l => P(l, { size: 18 }))]);
    kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { ...NOB, insideHorizontal: NB, insideVertical: NB }, rows: [new TableRow({ cantSplit: false, children: [
      new TableCell({ width: { size: im ? 24 : 2, type: WidthType.PERCENTAGE }, borders: NOB, children: left }),
      new TableCell({ width: { size: im ? 76 : 98, type: WidthType.PERCENTAGE }, borders: NOB, children: right.length ? right : [P('(no details)', { size: 17, color: '94A3B8' })] })] })] }));
  });

  kids.push(H('8. Coverage: what was tested and what was not', HeadingLevel.HEADING_1));
  kids.push(P('Tested', { bold: true }));
  (a.coverage.tested.length ? a.coverage.tested : a.byModule.map(m => m.name)).forEach(t => kids.push(P('✓ ' + t, { size: 18 })));
  kids.push(P('Not tested yet (suggested next)', { bold: true }));
  if (!a.coverage.notTested.length) kids.push(P('The AI did not list any gaps. Check the screens and flows that are not in the test cases above.', { size: 18, color: '64748B' }));
  else kids.push(table(['Area / page / feature', 'Why it was not tested'], a.coverage.notTested.map(x => [x.area, x.reason || '']), [40, 60]));

  kids.push(H('9. Suggestions', HeadingLevel.HEADING_1));
  if (!a.suggestions.length) kids.push(P('No suggestions were recorded.'));
  else for (const type of [...new Set(a.suggestions.map(s => s.type || 'improvement'))]) {
    kids.push(P(cap(type), { bold: true }));
    a.suggestions.filter(s => (s.type || 'improvement') === type).forEach(s => kids.push(P(`• ${s.text}${s.priority ? '  [' + s.priority + ' priority]' : ''}`, { size: 18 })));
  }
  if (a.risks.length) { kids.push(P('Risks', { bold: true })); a.risks.forEach(r => kids.push(P('• ' + r, { size: 18 }))); }
  kids.push(P('Next steps', { bold: true }), P(a.defects.length ? '• Fix the defects above, highest severity first, then re-run the failed cases.' : '• Add the not-tested areas to the next run.', { size: 18 }));

  if (run.steps?.length) {
    kids.push(new Paragraph({ children: [new PageBreak()] }), H('Appendix: action log', HeadingLevel.HEADING_1));
    run.steps.slice(0, 400).forEach((s, i) => kids.push(P(`${i + 1}. ${s.name} ${s.input ? JSON.stringify(s.input).slice(0, 140) : ''} → ${s.ok ? 'ok' : 'FAILED'}${s.summary ? ' (' + String(s.summary).slice(0, 100) + ')' : ''}`, { size: 16 })));
    if (run.steps.length > 400) kids.push(P(`… and ${run.steps.length - 400} more actions.`, { size: 16, color: '64748B' }));
  }
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `StreamFusion · ${run.title}`, size: 15, color: '94A3B8' })] })] });
  return Packer.toBuffer(new Document({ sections: [{ footers: { default: footer }, children: kids }] }));
}

// ---------- PDF ----------
export function buildPdf(run) {
  return new Promise((resolve, reject) => {
    const a = analyze(run);
    const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true });
    const bufs = []; doc.on('data', d => bufs.push(d)); doc.on('end', () => resolve(Buffer.concat(bufs))); doc.on('error', reject);
    const L = 48, W = 499, hex = (s) => '#' + (COLORS[s] || SEV_COLOR[s] || COLORS.info);
    const room = (h) => { if (doc.y + h > 790) doc.addPage(); };
    const h1 = (t) => { room(60); doc.moveDown(0.8).fontSize(15).fillColor('#0f172a').text(t, L, doc.y, { width: W }); doc.moveDown(0.3); };
    const p = (t, o = {}) => { doc.fontSize(o.size || 10).fillColor(o.color || '#334155').text(String(t ?? ''), L, doc.y, { width: W, ...(o.opts || {}) }); };
    const table = (headers, rows, widths) => {
      const xs = []; let x = L; widths.forEach(w => { xs.push(x); x += W * w / 100; });
      const cw = widths.map(w => W * w / 100 - 8);
      const draw = (r, head) => {
        const cells = r.map(v => (v && typeof v === 'object' ? v : { text: String(v ?? '') }));
        const hs = cells.map((c, i) => doc.fontSize(9).heightOfString(c.text || ' ', { width: cw[i] }));
        const h = Math.max(...hs) + 8; room(head ? h + 50 : h);
        const y = doc.y;
        if (head) doc.rect(L, y, W, h).fill('#e2e8f0');
        cells.forEach((c, i) => doc.fontSize(9).fillColor(head ? '#0f172a' : c.color ? '#' + c.color : '#334155').text(c.text, xs[i] + 4, y + 4, { width: cw[i] }));
        doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.4).strokeColor('#cbd5e1').stroke();
        doc.y = y + h;
      };
      draw(headers, true); rows.forEach(r => draw(r, false)); doc.moveDown(0.5);
    };
    const st = (s) => ({ text: cap(s), color: COLORS[s] || SEV_COLOR[s] || COLORS.info });

    if (logo) { try { doc.image(logo, L, 40, { width: 34 }); } catch (e) {} }
    doc.fontSize(18).fillColor('#' + BRAND).text('StreamFusion', L + 44, 42, { width: 300 });
    doc.fontSize(8.5).fillColor('#64748b').text('AI-assisted app and web testing · Test report', L + 44, 63, { width: 300 });
    doc.moveTo(L, 82).lineTo(L + W, 82).lineWidth(1.5).strokeColor('#' + BRAND).stroke();
    doc.fontSize(9).fillColor('#64748b').text('TEST REPORT', L, 96);
    doc.fontSize(22).fillColor('#0f172a').text(run.title, L, doc.y, { width: W });
    p(`${new Date(run.startedAt).toLocaleString()} · ${fmtDur(a.durationMs)} · ${run.id}`, { color: '#64748b', size: 9.5 });
    h1('1. Result at a glance');
    doc.fontSize(20).fillColor(a.verdict.startsWith('PASS') ? hex('pass') : a.verdict === 'INCOMPLETE' ? hex('blocked') : hex('fail')).text(a.verdict, L, doc.y, { width: W }); doc.moveDown(0.3);
    if (a.total) { let x = L; const y = doc.y; for (const s of ['pass', 'fail', 'blocked']) if (a[s]) { const w = W * a[s] / a.total; doc.rect(x, y, w, 16).fill(hex(s)); if (w > 40) doc.fontSize(8).fillColor('#fff').text(`${a[s]} ${s}`, x + 4, y + 4, { width: w - 6 }); x += w; } doc.y = y + 24; }
    table(['Measure', 'Value'], [
      ['Test cases run', String(a.total)], ['Passed / Failed / Blocked', `${a.pass} / ${a.fail} / ${a.blocked}`], ['Pass rate', a.passRate + '%'],
      ['Defects found', `${a.defects.length} (${a.bySeverity.filter(s => s.count).map(s => s.count + ' ' + s.name).join(', ') || 'none'})`],
      ['Total time / average per case', `${fmtDur(a.durationMs)} / ${fmtDur(a.avgMs)}`], ['Actions performed', `${a.actions}${a.failedActions ? ` (${a.failedActions} failed)` : ''}`],
      ['Tested on', `${run.serial}${run.deviceInfo?.model ? ' (' + run.deviceInfo.model + ')' : ''}`], ['Tested by', run.model]
    ], [38, 62]);
    h1('2. Summary'); p(run.summary || 'No summary was written.');
    if (a.defects.length) { doc.moveDown(0.4); p('Most important findings', { color: '#0f172a' }); a.defects.slice(0, 5).forEach(d => p(`• [${cap(d.severity)}] ${d.title}${d.location ? ' (' + d.location + ')' : ''}`)); }

    h1('3. Scope and approach'); p('Application under test', { color: '#0f172a' }); doc.moveDown(0.2);
    table(['Item', 'Details'], appRows(run, a), [30, 70]);
    p('Brief', { color: '#0f172a' }); p(run.instructions ? String(run.instructions).slice(0, 1500) : 'No brief was recorded.', { size: 9 });
    doc.moveDown(0.4); p('Tested from the point of view of:', { color: '#0f172a' });
    table(['User / role', 'What this user wants', 'Cases', 'Pass'], (a.personas.length ? a.personas : a.byPersona.map(x => ({ name: x.name }))).map(x => { const g = a.byPersona.find(y => y.name === x.name); return [x.name, x.goal || x.notes || '', g ? String(g.total) : '0', g ? `${g.pass}/${g.total}` : '-']; }), [24, 46, 12, 18]);

    h1('4. Results breakdown');
    table(['Feature / page', 'Cases', 'Pass', 'Fail', 'Blocked'], a.byModule.map(m => [m.name, String(m.total), String(m.pass), String(m.fail), String(m.blocked)]), [40, 15, 15, 15, 15]);
    table(['Type of check', 'Cases', 'Pass', 'Fail', 'Blocked'], a.byCategory.map(m => [cap(m.name), String(m.total), String(m.pass), String(m.fail), String(m.blocked)]), [40, 15, 15, 15, 15]);

    h1('5. Defects');
    if (!a.defects.length) p('No defects were found in the cases that were run.');
    else { p('Severity: ' + SEV_ORDER.map(s => `${cap(s)} = ${SEV_HELP[s]}`).join('; ') + '.', { size: 8.5, color: '#64748b' }); doc.moveDown(0.3);
      table(['Ref', 'Severity', 'Where (page / button)', 'Problem', 'Expected / Actual'], a.defects.map(d => [d.ref, st(d.severity), d.location || '-', d.title, [d.expected && 'Expected: ' + d.expected, d.actual && 'Actual: ' + d.actual].filter(Boolean).join('\n') || '-']), [8, 11, 20, 26, 35]); }

    h1('6. Test case results');
    table(['#', 'Check', 'Feature', 'User', 'Result'], run.checks.map((k, i) => [k.id || String(i + 1), k.title, k.module || '', k.persona || '', st(k.status)]), [8, 42, 20, 16, 14]);

    h1('7. Details and evidence');
    run.checks.forEach((k, i) => {
      const col = hex(k.status), code = k.id || String(i + 1), b = png(run, k.screenshot), fields = caseFields(k), meta = caseMeta(k);
      let im = null; if (b) { try { const { w, h } = pngSize(b); im = { b, w: 108, h: Math.min(230, 108 * h / w) }; } catch (e) {} }
      const gx = im ? im.w + 14 : 0, tx = L + gx, tw = W - gx;
      const textH = fields.reduce((t, [l, v]) => t + doc.fontSize(8).heightOfString(l, { width: tw }) + doc.fontSize(9).heightOfString(v, { width: tw }) + 5, 0) + (meta ? doc.fontSize(8).heightOfString(meta, { width: W }) + 4 : 0);
      const capH = im ? (k.remark ? doc.fontSize(7.5).heightOfString(k.remark, { width: im.w }) + 4 : 0) : 0;
      const bodyH = Math.max(textH, im ? im.h + capH : 0);
      room(Math.min(bodyH + 40, 520)); doc.moveDown(0.4);
      const y0 = doc.y;
      doc.rect(L, y0, W, 20).fill('#f1f5f9'); doc.rect(L, y0, 3, 20).fill(col);
      doc.fontSize(10.5).fillColor('#0f172a').text(`${code}. ${k.title}`, L + 10, y0 + 5, { width: W - 90, lineBreak: false, ellipsis: true });
      doc.fontSize(9).fillColor(col).text(k.status.toUpperCase(), L + W - 76, y0 + 6, { width: 70, align: 'right', lineBreak: false });
      let y = y0 + 26;
      if (meta) { doc.fontSize(8).fillColor('#64748b').text(meta, L, y, { width: W }); y = doc.y + 4; }
      if (im) {
        try {
          doc.image(im.b, L, y, { width: im.w, height: im.h });
          doc.rect(L, y, im.w, 13).fill(col); doc.fontSize(7.5).fillColor('#ffffff').text(`${code} · ${k.status.toUpperCase()}`, L + 4, y + 3, { width: im.w - 8, lineBreak: false });
          if (k.remark) doc.fontSize(7.5).fillColor('#475569').text(k.remark, L, y + im.h + 3, { width: im.w });
        } catch (e) { doc.fontSize(8).fillColor('#94a3b8').text('(screenshot could not be drawn)', L, y, { width: im.w }); }
      }
      let ty = y;
      for (const [l, v] of fields) {
        doc.fontSize(8).fillColor('#64748b').text(l.toUpperCase(), tx, ty, { width: tw }); ty = doc.y;
        doc.fontSize(9).fillColor(l === 'How to fix' ? '#1d4ed8' : l === 'Issues while performing' ? '#b45309' : '#334155').text(v, tx, ty, { width: tw }); ty = doc.y + 5;
      }
      doc.y = Math.max(ty, im ? y + im.h + capH : 0) + 6;
    });

    h1('8. Coverage: what was tested and what was not');
    p('Tested', { color: '#0f172a' }); (a.coverage.tested.length ? a.coverage.tested : a.byModule.map(m => m.name)).forEach(t => p('+ ' + t, { size: 9.5 }));
    doc.moveDown(0.4); p('Not tested yet (suggested next)', { color: '#0f172a' });
    if (!a.coverage.notTested.length) p('The AI did not list any gaps. Check the screens and flows that are not in the test cases above.', { size: 9, color: '#64748b' });
    else table(['Area / page / feature', 'Why it was not tested'], a.coverage.notTested.map(x => [x.area, x.reason || '']), [40, 60]);

    h1('9. Suggestions');
    if (!a.suggestions.length) p('No suggestions were recorded.');
    else for (const type of [...new Set(a.suggestions.map(s => s.type || 'improvement'))]) { p(cap(type), { color: '#0f172a' }); a.suggestions.filter(s => (s.type || 'improvement') === type).forEach(s => p(`• ${s.text}${s.priority ? '  [' + s.priority + ' priority]' : ''}`, { size: 9.5 })); doc.moveDown(0.3); }
    if (a.risks.length) { p('Risks', { color: '#0f172a' }); a.risks.forEach(r => p('• ' + r, { size: 9.5 })); }
    doc.moveDown(0.3); p('Next steps', { color: '#0f172a' }); p(a.defects.length ? '• Fix the defects above, highest severity first, then re-run the failed cases.' : '• Add the not-tested areas to the next run.', { size: 9.5 });

    if (run.steps?.length) {
      doc.addPage().fontSize(14).fillColor('#0f172a').text('Appendix: action log', L, 48); doc.moveDown(0.3);
      run.steps.slice(0, 400).forEach((s, j) => p(`${j + 1}. ${s.name} ${s.input ? JSON.stringify(s.input).slice(0, 110) : ''} -> ${s.ok ? 'ok' : 'FAILED'}`, { size: 8, color: '#475569' }));
    }
    // page numbers
    const r = doc.bufferedPageRange();
    for (let i = r.start; i < r.start + r.count; i++) { doc.switchToPage(i); doc.page.margins.bottom = 0; doc.fontSize(8).fillColor('#94a3b8').text(`StreamFusion · ${run.title} · page ${i + 1} of ${r.count}`, L, 812, { width: W, align: 'center', lineBreak: false }); }
    doc.end();
  });
}
