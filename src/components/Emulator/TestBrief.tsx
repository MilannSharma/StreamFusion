import React, { useRef, useState } from 'react';
import { X, Play } from 'lucide-react';

export interface Brief { product: string; module: string; target: string; login: string; notes: string; cases: string }
export interface BriefFile { name: string; text: string; kind: 'cases' | 'docs' }
export const EMPTY_BRIEF: Brief = { product: '', module: '', target: '', login: '', notes: '', cases: '' };

export const briefMissing = (b: Brief, files: BriefFile[], isWeb: boolean): string[] => {
  const m: string[] = [];
  if (!b.product.trim()) m.push('project name');
  if (!b.module.trim()) m.push('feature / module');
  if (!b.target.trim()) m.push(isWeb ? 'URL' : 'app name or package');
  if (!b.cases.trim() && !files.some(f => f.kind === 'cases')) m.push('test cases');
  return m;
};

// What the agent receives. Logins and attached documents go to the AI but never into the saved report.
export function composeBrief(b: Brief, files: BriefFile[], isWeb: boolean, history = '') {
  const cases = files.filter(f => f.kind === 'cases'), docs = files.filter(f => f.kind === 'docs');
  const head = `# Test brief\nProduct: ${b.product.trim()}\nFeature / module: ${b.module.trim()}\n${isWeb ? 'URL(s)' : 'App (name or package)'}: ${b.target.trim()}`;
  const summary = head + (b.cases.trim() ? '\n\n## Test cases\n' + b.cases.trim().slice(0, 1800) : '') + (cases.length ? '\n\nTest case files: ' + cases.map(f => f.name).join(', ') : '');
  const full = head
    + (b.login.trim() ? '\n\n## Login / credentials (use these when the app or site asks to sign in)\n' + b.login.trim() : '')
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
const group: React.CSSProperties = { background: FILL, borderRadius: 12, overflow: 'hidden' };
const field: React.CSSProperties = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: 13.5, color: INK, padding: '11px 0', resize: 'none' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12.5, color: '#4f46e5', cursor: 'pointer', fontWeight: 500 };
const chip: React.CSSProperties = { background: 'rgba(79,70,229,0.08)', color: '#4f46e5', borderRadius: 999, padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 };

const Row: React.FC<{ label: string; first?: boolean; children: React.ReactNode }> = ({ label, first, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderTop: first ? 'none' : `1px solid ${LINE}` }}>
    <div style={{ width: 74, flexShrink: 0, fontSize: 13.5, color: INK }}>{label}</div>
    {children}
  </div>
);

interface Props {
  projects: { id: string; name: string }[]; projectId: string; onPickProject: (id: string) => void; modules: string[]; onModule: (name: string) => void;
  isWeb: boolean; brief: Brief; setBrief: (b: Brief) => void; files: BriefFile[];
  addFiles: (list: FileList | null, kind: 'cases' | 'docs') => void; removeFile: (i: number) => void;
}

export const TestBrief: React.FC<Props> = ({ projects, projectId, onPickProject, modules, onModule, isWeb, brief, setBrief, files, addFiles, removeFile }) => {
  const casesRef = useRef<HTMLInputElement>(null), docsRef = useRef<HTMLInputElement>(null);
  const hasExtras = !!(brief.login.trim() || brief.notes.trim() || files.some(f => f.kind === 'docs'));
  const [more, setMore] = useState(hasExtras);
  const set = (k: keyof Brief) => (e: React.ChangeEvent<any>) => setBrief({ ...brief, [k]: e.target.value });
  const accept = '.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.feature,.docx';
  const chips = (kind: 'cases' | 'docs') => files.map((f, i) => f.kind === kind && <span key={i} style={chip}>{f.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => removeFile(i)} /></span>);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT, color: INK }}>
      <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em', padding: '2px 2px 0' }}>New test</div>

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
          <Row label={projects.length ? 'Name' : 'Project'} first={!projects.length}>
            <input style={field} value={brief.product} onChange={set('product')} placeholder="Project name" />
          </Row>
        )}
        <Row label="Module" first={false}>
          <input style={field} list="sf-modules" value={brief.module} onChange={e => { setBrief({ ...brief, module: e.target.value }); onModule(e.target.value); }} placeholder="Feature or module, e.g. Login" />
          <datalist id="sf-modules">{modules.map(m => <option key={m} value={m} />)}</datalist>
        </Row>
        <Row label={isWeb ? 'URL' : 'App'} first={false}>
          <input style={field} value={brief.target} onChange={set('target')} placeholder={isWeb ? 'https://staging.example.com' : 'App name or package'} />
        </Row>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 4px 6px' }}>
          <div style={{ fontSize: 12, color: SUB, flex: 1 }}>Test cases</div>
          <button style={linkBtn} onClick={() => casesRef.current?.click()}>Upload file</button>
          <input ref={casesRef} type="file" multiple accept={accept} style={{ display: 'none' }} onChange={e => { addFiles(e.target.files, 'cases'); e.target.value = ''; }} />
        </div>
        <div style={{ ...group, padding: '4px 14px' }}>
          <textarea style={{ ...field, width: '100%', minHeight: 120, resize: 'vertical', lineHeight: 1.5 }} value={brief.cases} onChange={set('cases')} placeholder={'TC-01  Wrong password shows an error\nOpen the login page, enter a wrong password, press Sign in.'} />
        </div>
        {files.some(f => f.kind === 'cases') && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{chips('cases')}</div>}
      </div>

      {!more ? (
        <button style={{ ...linkBtn, alignSelf: 'flex-start', padding: '0 4px' }} onClick={() => setMore(true)}>Add login, notes or documents</button>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 4px 6px' }}>
            <div style={{ fontSize: 12, color: SUB, flex: 1 }}>Optional</div>
            <button style={linkBtn} onClick={() => docsRef.current?.click()}>Upload document</button>
            <input ref={docsRef} type="file" multiple accept={accept} style={{ display: 'none' }} onChange={e => { addFiles(e.target.files, 'docs'); e.target.value = ''; }} />
          </div>
          <div style={group}>
            <Row label="Login" first><textarea rows={2} style={{ ...field, lineHeight: 1.45 }} value={brief.login} onChange={set('login')} placeholder="admin@example.com / password" /></Row>
            <Row label="Notes"><textarea rows={2} style={{ ...field, lineHeight: 1.45 }} value={brief.notes} onChange={set('notes')} placeholder="PRD, environment, known issues" /></Row>
          </div>
          {files.some(f => f.kind === 'docs') && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{chips('docs')}</div>}
          <div style={{ fontSize: 11.5, color: SUB, padding: '8px 4px 0' }}>Login is stored encrypted on this PC and never appears in reports.</div>
        </div>
      )}
    </div>
  );
};

export const StartBar: React.FC<{ missing: string[]; onStart: () => void }> = ({ missing, onStart }) => (
  <div style={{ padding: '12px 16px', borderTop: `1px solid ${LINE}`, display: 'flex', gap: 12, alignItems: 'center', fontFamily: FONT }}>
    <div style={{ flex: 1, fontSize: 12.5, color: SUB, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{missing.length ? 'Needs ' + missing.join(', ') : 'Ready'}</div>
    <button disabled={missing.length > 0} onClick={onStart}
      style={{ background: missing.length ? 'rgba(120,120,128,0.2)' : '#4f46e5', color: missing.length ? SUB : '#fff', border: 'none', borderRadius: 999, padding: '9px 20px', fontSize: 13.5, fontWeight: 600, cursor: missing.length ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
      <Play size={13} fill="currentColor" /> Start
    </button>
  </div>
);
