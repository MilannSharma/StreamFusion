import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Play } from 'lucide-react';
import { ProjectMemory, type ContextData } from '../Projects/ProjectMemory';

export interface Brief { product: string; module: string; target: string; login: string; notes: string; cases: string; persona: string }
export interface BriefFile { name: string; text: string; kind: 'cases' | 'docs' }
export const EMPTY_BRIEF: Brief = { product: '', module: '', target: '', login: '', notes: '', cases: '', persona: '' };
export const PERSONA_SUGGESTIONS = ['Admin', 'Teacher', 'Student', 'Parent', 'Customer', 'Guest'];

// Logins are kept as "User 1: ...", "User 2: ..." lines. Empty slots never reach the AI, the saved secret or the report masking.
export const loginSlots = (login: string): string[] => {
  const v = login.split('\n').map(l => l.replace(/^\s*User\s*\d+\s*:\s*/i, '').trimEnd());
  while (v.length < 3) v.push('');
  return v;
};
export const joinLogins = (slots: string[]) => slots.map((v, i) => `User ${i + 1}: ${v}`).join('\n');
export const cleanLogin = (login: string) => login.split('\n').filter(l => l.replace(/^\s*User\s*\d+\s*:\s*/i, '').trim()).map(l => l.trim()).join('\n');

export const briefMissing = (b: Brief, files: BriefFile[], isWeb: boolean): string[] => {
  const m: string[] = [];
  if (!b.product.trim()) m.push('project name');
  if (!b.module.trim()) m.push('feature / module');
  if (!b.target.trim()) m.push(isWeb ? 'URL' : 'app name or package');
  if (!b.cases.trim() && !files.some(f => f.kind === 'cases')) m.push('test cases');
  return m;
};

// What the agent receives. Logins and attached documents go to the AI but never into the saved report.
export function composeBrief(b: Brief, files: BriefFile[], isWeb: boolean, history = '', context = '') {
  const cases = files.filter(f => f.kind === 'cases'), docs = files.filter(f => f.kind === 'docs');
  const who = b.persona.trim()
    ? `\nTest as (role): ${b.persona.trim()}. Test every case from this role's point of view and use "${b.persona.trim()}" as the persona on each check.`
    : `\nTest as: Auto. Work out the real user roles from this brief and the project context, pick the right role for every case, and name the role used in the persona field of each check.`;
  const head = `# Test brief\nProduct: ${b.product.trim()}\nFeature / module: ${b.module.trim()}\n${isWeb ? 'URL(s)' : 'App (name or package)'}: ${b.target.trim()}${who}`;
  const summary = head + (b.cases.trim() ? '\n\n## Test cases\n' + b.cases.trim().slice(0, 1800) : '') + (cases.length ? '\n\nTest case files: ' + cases.map(f => f.name).join(', ') : '');
  const full = head
    + (cleanLogin(b.login) ? '\n\n## Login / credentials: several users may be given (User 1, User 2, ...). Use the one the test case needs; use User 1 when a case does not say which.\n' + cleanLogin(b.login) : '')
    + (context.trim() ? '\n\n## Saved project context (per feature: how to reach it, cases and results, open issues, quirks; plus roles and what is still untested. Use it first: go straight to the known screens and re-check the open issues)\n' + context.trim() : '')
    + (history ? '\n\n## What earlier runs of this project found (use as context, re-verify fixed items)\n' + history : '')
    + (b.notes.trim() ? '\n\n## PRD / notes / environment\n' + b.notes.trim() : '')
    + (b.cases.trim() ? '\n\n## Test cases\n' + b.cases.trim() : '')
    + cases.map(f => '\n\n## Test cases from file: ' + f.name + '\n' + f.text).join('')
    + docs.map(f => '\n\n## Reference document: ' + f.name + '\n' + f.text).join('');
  return { full, summary, title: (b.product.trim() + ' - ' + b.module.trim()).slice(0, 80) };
}

// ---- design: quiet, grouped, system-style. No borders on fields, hairline dividers, one accent colour. ----
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif';
const INK = 'var(--text-main, #1d1d1f)', SUB = 'var(--text-muted, #86868b)', LINE = 'rgba(60,60,67,0.12)', FILL = 'rgba(120,120,128,0.08)';
const group: React.CSSProperties = { background: FILL, borderRadius: 12 };
const field: React.CSSProperties = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: 13.5, color: INK, padding: '11px 0', resize: 'none' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12.5, color: '#4f46e5', cursor: 'pointer', fontWeight: 500 };
const chip: React.CSSProperties = { background: 'rgba(79,70,229,0.08)', color: '#4f46e5', borderRadius: 999, padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 };

const RED = '#dc2626';
const Row: React.FC<{ label: string; first?: boolean; bad?: boolean; children: React.ReactNode }> = ({ label, first, bad, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderTop: first ? 'none' : `1px solid ${LINE}`, boxShadow: bad ? `inset 3px 0 0 ${RED}` : 'none', background: bad ? 'rgba(220,38,38,0.06)' : 'transparent' }}>
    <div style={{ width: 74, flexShrink: 0, fontSize: 13.5, color: bad ? RED : INK }}>{label}</div>
    {children}
  </div>
);

// Pick an app that is already on the phone, or upload an .apk to install it there
const AppPicker: React.FC<{ serial: string; onPick: (pkg: string) => void; onNote?: (m: string) => void }> = ({ serial, onPick, onNote }) => {
  const [apps, setApps] = useState<{ package: string; label: string }[] | null>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [q, setQ] = useState(''), [note, setNote] = useState('');
  const apkRef = useRef<HTMLInputElement>(null), anchor = useRef<HTMLDivElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const place = () => { const r = anchor.current?.getBoundingClientRect(); if (!r) return; const w = 260, h = 280; setPos({ left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top: r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6 }); };
  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!menuRef.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('mousedown', onDoc);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('mousedown', onDoc); };
  }, [open]);
  const load = async () => {
    setOpen(o => !o);
    if (apps) return;
    try { setApps(((await (await fetch('/api/devices/' + encodeURIComponent(serial) + '/apps')).json()).apps || [])); } catch (e) { setApps([]); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setNote('');
    try {
      const r = await (await fetch('/api/devices/' + encodeURIComponent(serial) + '/install-apk', { method: 'POST', headers: { 'Content-Type': 'application/vnd.android.package-archive' }, body: file })).json();
      if (r.success) { if (r.package) onPick(r.package); setApps(null); setNote(r.package ? 'Installed ' + r.package : 'Updated on the phone'); }
      else setNote('Install failed: ' + (r.message || 'unknown error'));
    } catch (e: any) { setNote('Install failed: ' + e.message); }
    setBusy(false);
  };
  const shown = (apps || []).filter(a => !q || (a.label + a.package).toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={anchor} style={{ position: 'relative', display: 'flex', gap: 10, flexShrink: 0 }}>
      <button style={linkBtn} onClick={load}>Installed</button>
      <button style={linkBtn} disabled={busy} onClick={() => apkRef.current?.click()}>{busy ? 'Installing…' : 'APK'}</button>
      {note && <div style={{ position: 'absolute', right: 0, top: 'calc(100% - 2px)', fontSize: 11, color: SUB, whiteSpace: 'nowrap', background: 'var(--bg-card, #fff)', padding: '2px 6px', borderRadius: 6, zIndex: 5 }}>{note}</div>}
      <input ref={apkRef} type="file" accept=".apk" style={{ display: 'none' }} onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 100000, width: 260, maxHeight: 280, overflowY: 'auto', background: 'var(--bg-card, #fff)', border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.18)', padding: 6 }}>
          <input autoFocus style={{ ...field, width: '100%', padding: '6px 8px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search apps" />
          {apps === null && <div style={{ padding: 10, fontSize: 12, color: SUB }}>Loading…</div>}
          {apps && !shown.length && <div style={{ padding: 10, fontSize: 12, color: SUB }}>No apps found</div>}
          {shown.map(a => (
            <div key={a.package} onClick={() => { onPick(a.package); setOpen(false); setQ(''); }} style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: INK }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.10)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div>{a.label}</div><div style={{ fontSize: 11, color: SUB }}>{a.package}</div>
            </div>
          ))}
        </div>, document.body
      )}
    </div>
  );
};

export const STEPS = ['Target', 'Test cases', 'Login & notes'];
export const stepOfMissing = (label: string) => (label === 'test cases' ? 1 : 0);
export const countCases = (t: string) => {
  const byId = t.split('\n').filter(l => /^\s*(TC[-_ ]?\d+|case\s*\d+|\d+[.)]\s)/i.test(l)).length;
  return byId || t.split(/\n\s*\n/).filter(x => x.trim()).length;
};

interface Props {
  serial?: string; onNote?: (msg: string) => void;
  projects: { id: string; name: string }[]; projectId: string; onPickProject: (id: string) => void; modules: string[]; onModule: (name: string) => void;
  isWeb: boolean; brief: Brief; setBrief: (b: Brief) => void; files: BriefFile[];
  addFiles: (list: FileList | null, kind: 'cases' | 'docs') => void; removeFile: (i: number) => void;
  step: number; setStep: (n: number) => void; showErrors: boolean;
  projectContext?: string; projectMemory?: ContextData | null; onSaveContext?: (text: string) => Promise<void> | void;
  savedDocs?: { name: string }[]; savedCaseFiles?: { name: string }[]; toggleFile?: (name: string, kind: 'cases' | 'docs', on: boolean) => void;
}

export const TestBrief: React.FC<Props> = ({ serial, onNote, projects, projectId, onPickProject, modules, onModule, isWeb, brief, setBrief, files, addFiles, removeFile, step, setStep, showErrors, projectContext = '', projectMemory, onSaveContext, savedDocs = [], savedCaseFiles = [], toggleFile }) => {
  const [ctxEdit, setCtxEdit] = useState(false), [ctxText, setCtxText] = useState(''), [ctxBusy, setCtxBusy] = useState(false), [ctxOpen, setCtxOpen] = useState(false);
  const picker = (list: { name: string }[], kind: 'cases' | 'docs', title: string) => list.length > 0 && toggleFile && (
    <div style={{ ...group, padding: '8px 14px', marginTop: 10 }}>
      <div style={{ fontSize: 12, color: SUB, paddingBottom: 4 }}>{title}</div>
      {list.map(f => { const on = files.some(x => x.name === f.name && x.kind === kind); return (
        <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, cursor: 'pointer', color: INK }}>
          <input type="checkbox" checked={on} onChange={e => toggleFile(f.name, kind, e.target.checked)} /> <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          <span style={{ fontSize: 11, color: on ? '#4f46e5' : SUB }}>{on ? 'used in this test' : 'not used'}</span>
        </label>); })}
    </div>
  );
  const casesRef = useRef<HTMLInputElement>(null), docsRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const set = (k: keyof Brief) => (e: React.ChangeEvent<any>) => setBrief({ ...brief, [k]: e.target.value });
  const accept = '.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.feature,.docx';
  const chips = (kind: 'cases' | 'docs') => files.map((f, i) => f.kind === kind && <span key={i} style={chip}>{f.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => removeFile(i)} /></span>);
  const miss = showErrors ? briefMissing(brief, files, isWeb) : [];
  const bad = (l: string) => miss.includes(l);
  const n = countCases(brief.cases);
  const addCase = () => { const k = String(n + 1).padStart(2, '0'); setBrief({ ...brief, cases: (brief.cases.trim() ? brief.cases.replace(/\s*$/, '') + '\n\n' : '') + `TC-${k}  \nSteps: ` }); };
  const caseFiles = files.filter(f => f.kind === 'cases').length;
  const slots = loginSlots(brief.login);
  const setSlot = (i: number, v: string) => { const a = loginSlots(brief.login); a[i] = v; setBrief({ ...brief, login: joinLogins(a) }); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT, color: INK }}>
      <div style={{ display: 'flex', alignItems: 'baseline', padding: '2px 2px 0' }}>
        <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em', flex: 1 }}>New test</div>
        {(brief.product || brief.module || brief.target || brief.cases) && <button style={linkBtn} onClick={() => { onPickProject(''); setStep(0); }}>Clear form</button>}
      </div>

      <div data-guide="form-steps" style={{ display: 'flex', gap: 6 }}>
        {STEPS.map((t, i) => (
          <button key={t} onClick={() => setStep(i)} style={{ flex: 1, border: 'none', cursor: 'pointer', padding: '7px 4px', borderRadius: 10, fontFamily: 'inherit', fontSize: 12, fontWeight: i === step ? 650 : 500, background: i === step ? '#4f46e5' : FILL, color: i === step ? '#fff' : SUB }}>
            <span style={{ opacity: 0.8 }}>{i + 1}</span> {t}
          </button>
        ))}
      </div>

      {step === 0 && <>
        <div style={{ fontSize: 12.5, color: SUB, padding: '0 4px' }}>What are you testing? Pick a saved project to fill this in for you.</div>
        <div style={group}>
          {projects.length > 0 && (
            <Row label="Project" first>
              <select style={{ ...field, cursor: 'pointer' }} value={projectId} onChange={e => onPickProject(e.target.value)}>
                <option value="">New project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Row>
          )}
          {(!projects.length || !projectId) && (
            <Row label={projects.length ? 'Name' : 'Project'} first={!projects.length} bad={bad('project name')}>
              <input style={field} value={brief.product} onChange={set('product')} placeholder="Project name, e.g. My Shop" />
            </Row>
          )}
          <Row label="Module" first={false} bad={bad('feature / module')}>
            <input style={field} list="sf-modules" value={brief.module} onChange={e => { setBrief({ ...brief, module: e.target.value }); onModule(e.target.value); }} placeholder="Feature or module, e.g. Login" />
            <datalist id="sf-modules">{modules.map(m => <option key={m} value={m} />)}</datalist>
          </Row>
          <Row label={isWeb ? 'URL' : 'App'} first={false} bad={bad(isWeb ? 'URL' : 'app name or package')}>
            <input style={field} value={brief.target} onChange={set('target')} placeholder={isWeb ? 'https://staging.example.com' : 'App name or package'} />
            {!isWeb && serial && <AppPicker serial={serial} onPick={pkg => setBrief({ ...brief, target: pkg })} onNote={onNote} />}
          </Row>
        </div>
        {miss.some(l => stepOfMissing(l) === 0) && <div style={{ fontSize: 12, color: RED, padding: '0 4px' }}>Please fill the red fields.</div>}
        {projectId && (
          <div style={{ ...group, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>Project context</div>
              {!ctxEdit && <button style={linkBtn} onClick={() => setCtxOpen(o => !o)}>{ctxOpen ? 'Hide' : 'View'}</button>}
              {!ctxEdit && <button style={linkBtn} onClick={() => { setCtxText(projectContext); setCtxEdit(true); setCtxOpen(true); }}>Edit</button>}
            </div>
            <div style={{ fontSize: 11.5, color: SUB, padding: '2px 0 4px' }}>{projectContext.trim() ? 'Saved for this project and sent to the AI with every test. It updates itself after every test case, feature by feature: how to reach it, cases and results, open issues, tips, and what is still untested.' : 'Empty for now. It fills itself after the first test run, or write your own notes here.'}</div>
            {ctxEdit ? (<>
              <textarea style={{ ...field, width: '100%', minHeight: 180, resize: 'vertical', lineHeight: 1.45, fontSize: 12.5, background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: 8, fontFamily: 'ui-monospace, Consolas, monospace' }} value={ctxText} onChange={e => setCtxText(e.target.value)} />
              <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
                <button style={{ ...linkBtn, fontWeight: 700 }} disabled={ctxBusy} onClick={async () => { setCtxBusy(true); try { await onSaveContext?.(ctxText); } finally { setCtxBusy(false); setCtxEdit(false); } }}>{ctxBusy ? 'Saving…' : 'Save'}</button>
                <button style={linkBtn} onClick={() => setCtxEdit(false)}>Cancel</button>
              </div></>
            ) : ctxOpen && <div style={{ marginTop: 6, maxHeight: 340, overflowY: 'auto' }}>
              <ProjectMemory data={projectMemory} />
              {(() => { const mine = projectContext.replace(/<!-- sf:auto:start -->[\s\S]*?<!-- sf:auto:end -->/, '').trim(); return mine ? <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 8, fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: SUB, textTransform: 'uppercase', marginBottom: 2 }}>Your notes</div>{mine}</div> : null; })()}
            </div>}
          </div>
        )}
      </>}

      {step === 1 && <div>
        <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 4px 6px', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: bad('test cases') ? RED : SUB, flex: 1 }}>Test cases {n > 0 && <span style={{ color: '#4f46e5' }}>· {n} found</span>}</div>
          <button style={linkBtn} onClick={addCase}>+ Add case</button>
          <button style={linkBtn} onClick={() => casesRef.current?.click()}>Upload file</button>
          <input ref={casesRef} type="file" multiple accept={accept} style={{ display: 'none' }} onChange={e => { addFiles(e.target.files, 'cases'); e.target.value = ''; }} />
        </div>
        {caseFiles > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 4px 8px' }}>{chips('cases')}</div>}
        {picker(savedCaseFiles, 'cases', 'Saved test case files of this module: tick the ones to use')}
        <div data-guide="cases-box" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files, 'cases'); }}
          style={{ ...group, padding: '4px 14px', outline: drag ? '2px dashed #4f46e5' : bad('test cases') ? `1.5px solid ${RED}` : 'none', background: drag ? 'rgba(79,70,229,0.08)' : FILL }}>
          <textarea style={{ ...field, width: '100%', minHeight: 150, resize: 'vertical', lineHeight: 1.5 }} value={brief.cases} onChange={set('cases')} placeholder={'TC-01  Wrong password shows an error\nOpen the login page, enter a wrong password, press Sign in.\n\nTC-02  Correct login opens the dashboard\nEnter the right email and password, press Sign in.'} />
        </div>
        <div style={{ fontSize: 11.5, color: SUB, padding: '6px 4px 0' }}>Write it in plain words, one case after another. You can also drag a Word or text file here.</div>
      </div>}

      {step === 2 && <div>
        <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 4px 6px' }}>
          <div style={{ fontSize: 12.5, color: SUB, flex: 1 }}>Optional: logins, if your {isWeb ? 'site' : 'app'} needs them</div>
          <button style={linkBtn} onClick={() => setBrief({ ...brief, login: joinLogins([...loginSlots(brief.login), '']) })}>+ Add user</button>
          <button style={linkBtn} onClick={() => docsRef.current?.click()}>Upload document</button>
          <input ref={docsRef} type="file" multiple accept={accept} style={{ display: 'none' }} onChange={e => { addFiles(e.target.files, 'docs'); e.target.value = ''; }} />
        </div>
        <div style={{ ...group, marginBottom: 12 }}>
          <Row label="Test as" first>
            <input style={field} value={brief.persona} onChange={set('persona')} placeholder="Auto: the AI picks the role for each case" />
            {brief.persona && <button style={linkBtn} onClick={() => setBrief({ ...brief, persona: '' })}>Auto</button>}
          </Row>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 14px 10px 14px' }}>
            {PERSONA_SUGGESTIONS.map(p => <button key={p} onClick={() => setBrief({ ...brief, persona: p })} style={{ ...chip, border: 'none', cursor: 'pointer', background: brief.persona === p ? '#4f46e5' : 'rgba(79,70,229,0.08)', color: brief.persona === p ? '#fff' : '#4f46e5' }}>{p}</button>)}
          </div>
        </div>
        <div style={group}>
          {slots.map((v, i) => (
            <Row key={i} label={'User ' + (i + 1)} first={i === 0}>
              <input style={field} value={v} onChange={e => setSlot(i, e.target.value)} placeholder={i === 0 ? 'email / password, e.g. admin@example.com / Pass@123' : 'optional: another user or role'} />
            </Row>
          ))}
          <Row label="Notes"><textarea rows={2} style={{ ...field, lineHeight: 1.45 }} value={brief.notes} onChange={set('notes')} placeholder="PRD, environment, known issues" /></Row>
        </div>
        {files.some(f => f.kind === 'docs') && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{chips('docs')}</div>}
        {picker(savedDocs, 'docs', 'Saved files of this project (PRD, specs…): tick the ones to use')}
        <div style={{ fontSize: 11.5, color: SUB, padding: '8px 4px 0' }}>Login is stored encrypted on this PC and never appears in reports.</div>
        <div style={{ ...group, marginTop: 14, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 650, marginBottom: 2 }}>Ready to start?</div>
          <div><span style={{ color: SUB }}>Project</span> {brief.product || <i style={{ color: RED }}>missing</i>} · {brief.module || <i style={{ color: RED }}>missing</i>}</div>
          <div><span style={{ color: SUB }}>{isWeb ? 'URL' : 'App'}</span> {brief.target || <i style={{ color: RED }}>missing</i>}</div>
          <div><span style={{ color: SUB }}>Test as</span> {brief.persona || 'Auto (AI picks the role, shown in the chat)'}</div>
          <div><span style={{ color: SUB }}>Test cases</span> {n > 0 || caseFiles ? (n ? n + ' written' : '') + (caseFiles ? (n ? ' + ' : '') + caseFiles + ' file' + (caseFiles > 1 ? 's' : '') : '') : <i style={{ color: RED }}>missing</i>}</div>
        </div>
      </div>}
    </div>
  );
};

export const StartBar: React.FC<{ hint: string; hintBad?: boolean; step: number; onBack: () => void; onNext: () => void; onStart: () => void }> = ({ hint, hintBad, step, onBack, onNext, onStart }) => {
  const last = step === STEPS.length - 1;
  return (
    <div style={{ padding: '12px 16px', borderTop: `1px solid ${LINE}`, display: 'flex', gap: 12, alignItems: 'center', fontFamily: FONT }}>
      {step > 0 && <button onClick={onBack} style={{ ...linkBtn, fontSize: 13 }}>Back</button>}
      <div style={{ flex: 1, fontSize: 12.5, color: hintBad ? RED : SUB, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
      <button data-guide={last ? 'start-test' : 'next-step'} onClick={last ? onStart : onNext}
        style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 999, padding: '9px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
        {last ? <><Play size={13} fill="currentColor" /> Start</> : 'Next'}
      </button>
    </div>
  );
};
