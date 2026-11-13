import React, { useRef } from 'react';
import { Paperclip, X, FlaskConical, Play } from 'lucide-react';

export interface Brief { product: string; module: string; target: string; login: string; notes: string; cases: string }
export interface BriefFile { name: string; text: string; kind: 'cases' | 'docs' }
export const EMPTY_BRIEF: Brief = { product: '', module: '', target: '', login: '', notes: '', cases: '' };

export const briefMissing = (b: Brief, files: BriefFile[], isWeb: boolean): string[] => {
  const m: string[] = [];
  if (!b.product.trim()) m.push('product name');
  if (!b.module.trim()) m.push('feature / module');
  if (!b.target.trim()) m.push(isWeb ? 'URL' : 'app name or package');
  if (!b.cases.trim() && !files.some(f => f.kind === 'cases')) m.push('test cases');
  return m;
};

// What the agent receives. Logins and attached documents go to the AI but never into the saved report.
export function composeBrief(b: Brief, files: BriefFile[], isWeb: boolean) {
  const cases = files.filter(f => f.kind === 'cases'), docs = files.filter(f => f.kind === 'docs');
  const head = `# Test brief\nProduct: ${b.product.trim()}\nFeature / module: ${b.module.trim()}\n${isWeb ? 'URL(s)' : 'App (name or package)'}: ${b.target.trim()}`;
  const summary = head + (b.cases.trim() ? '\n\n## Test cases\n' + b.cases.trim().slice(0, 1800) : '') + (cases.length ? '\n\nTest case files: ' + cases.map(f => f.name).join(', ') : '');
  const full = head
    + (b.login.trim() ? '\n\n## Login / credentials (use these when the app or site asks to sign in)\n' + b.login.trim() : '')
    + (b.notes.trim() ? '\n\n## PRD / notes / environment\n' + b.notes.trim() : '')
    + (b.cases.trim() ? '\n\n## Test cases\n' + b.cases.trim() : '')
    + cases.map(f => '\n\n## Test cases from file: ' + f.name + '\n' + f.text).join('')
    + docs.map(f => '\n\n## Reference document: ' + f.name + '\n' + f.text).join('');
  return { full, summary, title: (b.product.trim() + ' - ' + b.module.trim()).slice(0, 80) };
}

const border = '1px solid var(--border-color, #e2e8f0)';
const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 9, border, fontSize: 12.5, fontFamily: 'inherit', background: 'var(--bg-input, #fff)', color: 'var(--text-main, #0f172a)', resize: 'vertical' };
const chip: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 6, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5 };

interface Props {
  isWeb: boolean; brief: Brief; setBrief: (b: Brief) => void; files: BriefFile[];
  addFiles: (list: FileList | null, kind: 'cases' | 'docs') => void; removeFile: (i: number) => void;
}

export const TestBrief: React.FC<Props> = ({ isWeb, brief, setBrief, files, addFiles, removeFile }) => {
  const casesRef = useRef<HTMLInputElement>(null), docsRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof Brief) => (e: React.ChangeEvent<any>) => setBrief({ ...brief, [k]: e.target.value });
  const accept = '.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.feature,.docx';
  const fileChips = (kind: 'cases' | 'docs') => files.map((f, i) => f.kind === kind && <span key={i} style={chip}>{f.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => removeFile(i)} /></span>);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4f46e5', fontWeight: 800, fontSize: 13.5 }}><FlaskConical size={15} /> Test brief</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', lineHeight: 1.5, marginTop: -4 }}>The test starts only when the fields marked * are filled. The better the brief, the better the report.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><div style={lbl}>Product name *</div><input style={inp} value={brief.product} onChange={set('product')} placeholder="e.g. Rysen HQ" /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={lbl}>Feature / module *</div><input style={inp} value={brief.module} onChange={set('module')} placeholder="e.g. Login, Fee collection" /></div>
      </div>
      <div><div style={lbl}>{isWeb ? 'URL(s) to test *' : 'App to test *'}</div><input style={inp} value={brief.target} onChange={set('target')} placeholder={isWeb ? 'https://staging.example.com (one or more, comma separated)' : 'App name or package, e.g. com.example.app (installed on the phone)'} /></div>
      <div>
        <div style={lbl}>Test cases * <span style={{ fontWeight: 500, color: 'var(--text-muted, #64748b)' }}>paste markdown, type normally, or upload</span></div>
        <textarea style={{ ...inp, minHeight: 110 }} value={brief.cases} onChange={set('cases')} placeholder={'TC-01: Login with a wrong password\nSteps: open the login page, enter a wrong password, press Sign in\nExpected: an error message is shown'} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
          <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => casesRef.current?.click()}><Paperclip size={12} /> Upload test cases</button>
          {fileChips('cases')}
          <input ref={casesRef} type="file" multiple accept={accept} style={{ display: 'none' }} onChange={e => { addFiles(e.target.files, 'cases'); e.target.value = ''; }} />
        </div>
      </div>
      <div><div style={lbl}>Login / credentials <span style={{ fontWeight: 500, color: 'var(--text-muted, #64748b)' }}>optional, not saved in the report</span></div>
        <textarea style={{ ...inp, minHeight: 52 }} value={brief.login} onChange={set('login')} placeholder={'admin: admin@example.com / password123\nteacher: t@example.com / password456'} /></div>
      <div>
        <div style={lbl}>PRD / extra notes <span style={{ fontWeight: 500, color: 'var(--text-muted, #64748b)' }}>optional: requirements, environment, known issues</span></div>
        <textarea style={{ ...inp, minHeight: 52 }} value={brief.notes} onChange={set('notes')} placeholder="Paste PRD text or notes here" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
          <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => docsRef.current?.click()}><Paperclip size={12} /> Upload PRD / docs</button>
          {fileChips('docs')}
          <input ref={docsRef} type="file" multiple accept={accept} style={{ display: 'none' }} onChange={e => { addFiles(e.target.files, 'docs'); e.target.value = ''; }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginTop: 3 }}>Word (.docx), Markdown and text files work. For PDF, paste the text.</div>
      </div>
    </div>
  );
};

export const StartBar: React.FC<{ missing: string[]; onStart: () => void }> = ({ missing, onStart }) => (
  <div style={{ padding: 10, borderTop: border, display: 'flex', gap: 10, alignItems: 'center' }}>
    <div style={{ flex: 1, fontSize: 12, color: missing.length ? '#b45309' : '#15803d', lineHeight: 1.4 }}>{missing.length ? 'Still needed: ' + missing.join(', ') : 'Ready. The agent will run every test case and write the report.'}</div>
    <button className="btn-primary" disabled={missing.length > 0} onClick={onStart}><Play size={14} /> Start test</button>
  </div>
);
