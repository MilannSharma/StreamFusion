import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Briefcase, ArrowLeft, Globe, Smartphone, Trash2, Plus, Paperclip, X, Download, Save, Eye, EyeOff, Play } from 'lucide-react';
import { loadSecret, saveSecret, loginSecretName } from '../Emulator/secrets';
import { readBriefFiles } from '../Emulator/readFiles';
import { AutomatedTests } from './AutomatedTests';

type PFile = { name: string; text: string };
interface Module { name: string; cases: string; files: PFile[]; updatedAt?: string }
interface Project { id: string; name: string; targets: { web: string; app: string }; notes: string; docs: PFile[]; modules: Module[]; updatedAt: string }
interface Summary { id: string; name: string; updatedAt: string; targets: { web: string; app: string }; modules: number; docs: number; runs: number; lastRun: { status: string; at: string } | null }

const border = '1px solid var(--border-color, #e2e8f0)';
const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 };
const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: 3 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9, border, fontSize: 13, fontFamily: 'inherit', background: 'var(--bg-input, #fff)', color: 'var(--text-main)', resize: 'vertical' };
const chip: React.CSSProperties = { background: 'var(--bg-card, #fff)', border, borderRadius: 6, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5 };
const Card: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <div className="glass-panel" style={{ padding: 20, marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', letterSpacing: '0.04em' }}>{title}</div><div style={{ marginLeft: 'auto' }}>{right}</div></div>
    {children}
  </div>
);
const statusColor = (s?: string) => (s === 'passed' ? '#16a34a' : s === 'failed' ? '#dc2626' : '#d97706');
const ago = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

export const ProjectsPage: React.FC<{ onRun: (world: 'web' | 'phone', detail: any) => void }> = ({ onRun }) => {
  const [list, setList] = useState<Summary[] | null>(null);
  const [openId, setOpenId] = useState('');
  const refresh = useCallback(() => fetch('/api/projects').then(r => r.json()).then(j => setList(j.projects || [])).catch(() => setList([])), []);
  useEffect(() => { refresh(); }, [refresh, openId]);
  if (openId) return <Detail id={openId} onBack={() => setOpenId('')} onRun={onRun} />;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={22} color="#fff" /></div>
        <div><h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)' }}>Projects</h1><p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Everything about a product in one place: test cases, documents, logins and reports.</p></div>
      </div>
      {list === null ? <div style={muted}>Loading…</div> : list.length === 0 ? (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
          <Briefcase size={34} color="#6366f1" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>No projects yet</div>
          <div style={{ ...muted, maxWidth: 460, margin: '0 auto' }}>A project is created automatically the first time you start a test: open <b>Web Testing</b> or <b>Android Emulator</b>, turn on <b>Test mode</b>, fill the test brief and press <b>Start test</b>. Next time you only pick the project.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
          {list.map(p => (
            <div key={p.id} className="glass-panel" onClick={() => setOpenId(p.id)} style={{ padding: 18, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                {p.lastRun && <span style={{ fontSize: 11, fontWeight: 800, color: statusColor(p.lastRun.status) }}>{p.lastRun.status.toUpperCase()}</span>}
              </div>
              <div style={{ ...muted, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {p.targets.web && <span style={{ display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Globe size={12} /> {p.targets.web}</span>}
                {p.targets.app && <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Smartphone size={12} /> {p.targets.app}</span>}
              </div>
              <div style={{ ...muted, marginTop: 10, fontSize: 12 }}>{p.modules} module{p.modules === 1 ? '' : 's'} · {p.docs} doc{p.docs === 1 ? '' : 's'} · {p.runs} report{p.runs === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint, #94a3b8)', marginTop: 4 }}>Updated {ago(p.updatedAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Detail: React.FC<{ id: string; onBack: () => void; onRun: (world: 'web' | 'phone', detail: any) => void }> = ({ id, onBack, onRun }) => {
  const [p, setP] = useState<Project | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [login, setLogin] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const docRef = useRef<HTMLInputElement>(null);
  const modFileRef = useRef<HTMLInputElement>(null);
  const modFileIdx = useRef(0);

  useEffect(() => {
    fetch('/api/projects/' + id).then(r => r.json()).then(j => { if (j.success) { setP(j.project); setRuns(j.runs || []); } });
    loadSecret(loginSecretName(id)).then(setLogin);
  }, [id]);
  if (!p) return <div style={muted}>Loading…</div>;
  const edit = (fn: (x: Project) => Project) => { setP(fn(p)); setDirty(true); setMsg(''); };
  const save = async () => {
    const j = await (await fetch('/api/projects/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })).json();
    await saveSecret(loginSecretName(id), login);
    if (j.success) { setP(j.project); setDirty(false); setMsg('Saved.'); }
  };
  const remove = async () => {
    if (!window.confirm('Delete project "' + p.name + '"? Its saved test cases, documents and login are removed. Finished reports stay.')) return;
    await fetch('/api/projects/' + id, { method: 'DELETE' }); await saveSecret(loginSecretName(id), ''); onBack();
  };
  const run = (world: 'web' | 'phone', m?: Module) => {
    if (dirty) save();
    onRun(world, {
      projectId: id, testMode: true,
      brief: { product: p.name, module: m?.name || (p.modules.length === 1 ? p.modules[0].name : ''), target: (world === 'web' ? p.targets.web : p.targets.app) || '', login, notes: p.notes, cases: m?.cases ?? (p.modules.length === 1 ? p.modules[0].cases : '') },
      files: [...p.docs.map(d => ({ ...d, kind: 'docs' })), ...((m || (p.modules.length === 1 ? p.modules[0] : null))?.files || []).map(d => ({ ...d, kind: 'cases' }))]
    });
  };
  const addDocs = async (list: FileList | null) => { const out = await readBriefFiles(list, 'docs', setMsg); edit(x => ({ ...x, docs: [...x.docs.filter(d => !out.some(o => o.name === d.name)), ...out.map(o => ({ name: o.name, text: o.text }))] })); };
  const addModFiles = async (list: FileList | null) => { const out = await readBriefFiles(list, 'cases', setMsg); const i = modFileIdx.current; edit(x => ({ ...x, modules: x.modules.map((m, k) => (k === i ? { ...m, files: [...m.files.filter(d => !out.some(o => o.name === d.name)), ...out.map(o => ({ name: o.name, text: o.text }))] } : m)) })); };
  const setMod = (i: number, patch: Partial<Module>) => edit(x => ({ ...x, modules: x.modules.map((m, k) => (k === i ? { ...m, ...patch } : m)) }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={14} /> Projects</button>
        <input value={p.name} onChange={e => edit(x => ({ ...x, name: e.target.value }))} style={{ ...inp, resize: 'none', width: 'auto', flex: 1, minWidth: 200, fontSize: 18, fontWeight: 800 }} />
        <button className="btn-primary" disabled={!p.targets.web && !p.modules.length} onClick={() => run('web')} title="Open Web Testing with this project filled in"><Globe size={14} /> Test on Web</button>
        <button className="btn-primary" onClick={() => run('phone')} title="Open the Android Emulator with this project filled in"><Smartphone size={14} /> Test on Android</button>
        <button className="btn-primary" disabled={!dirty} onClick={save} style={{ background: dirty ? undefined : '#94a3b8' }}><Save size={14} /> Save</button>
        {msg && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>{msg}</span>}
      </div>

      <Card title="WHAT TO TEST">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}><div style={lbl}>Website URL(s)</div><input style={{ ...inp, resize: 'none' }} value={p.targets.web} onChange={e => edit(x => ({ ...x, targets: { ...x.targets, web: e.target.value } }))} placeholder="https://staging.example.com" /></div>
          <div style={{ flex: 1, minWidth: 240 }}><div style={lbl}>Android app (name or package)</div><input style={{ ...inp, resize: 'none' }} value={p.targets.app} onChange={e => edit(x => ({ ...x, targets: { ...x.targets, app: e.target.value } }))} placeholder="com.example.app" /></div>
        </div>
      </Card>

      <Card title="LOGIN / CREDENTIALS" right={<button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => setShowLogin(v => !v)}>{showLogin ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}</button>}>
        {showLogin
          ? <textarea style={{ ...inp, minHeight: 70 }} value={login} onChange={e => { setLogin(e.target.value); setDirty(true); }} placeholder={'admin: admin@example.com / password\nteacher: t@example.com / password'} />
          : <div style={muted}>{login ? 'Saved (hidden). Press Show to view or change it.' : 'None saved. Press Show to add one.'}</div>}
        <div style={{ ...muted, fontSize: 11.5, marginTop: 6 }}>Stored encrypted on this PC (the same secure store as your API key). It goes to the AI when you test, and is never written into reports.</div>
      </Card>

      <Card title="PRD / NOTES / CONTEXT">
        <textarea style={{ ...inp, minHeight: 90 }} value={p.notes} onChange={e => edit(x => ({ ...x, notes: e.target.value }))} placeholder="Requirements, environment, known issues, anything the tester should know" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => docRef.current?.click()}><Paperclip size={12} /> Add documents</button>
          {p.docs.map(d => <span key={d.name} style={chip}>{d.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => edit(x => ({ ...x, docs: x.docs.filter(z => z.name !== d.name) }))} /></span>)}
          <input ref={docRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.yaml,.yml,.xml,.docx" style={{ display: 'none' }} onChange={e => { addDocs(e.target.files); e.target.value = ''; }} />
        </div>
      </Card>

      <Card title={`FEATURES / MODULES AND TEST CASES (${p.modules.length})`} right={<button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => edit(x => ({ ...x, modules: [...x.modules, { name: 'New module', cases: '', files: [] }] }))}><Plus size={12} /> Add module</button>}>
        {p.modules.length === 0 && <div style={muted}>No modules yet. They are added when you start a test, or press Add module.</div>}
        {p.modules.map((m, i) => (
          <div key={i} style={{ border, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <input style={{ ...inp, resize: 'none', width: 'auto', flex: 1, minWidth: 160, fontWeight: 700 }} value={m.name} onChange={e => setMod(i, { name: e.target.value })} />
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => run('web', m)}><Play size={11} /> Web</button>
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => run('phone', m)}><Play size={11} /> Android</button>
              <button className="btn-secondary" style={{ padding: '4px 8px' }} title="Delete module" onClick={() => edit(x => ({ ...x, modules: x.modules.filter((_, k) => k !== i) }))}><Trash2 size={13} /></button>
            </div>
            <textarea style={{ ...inp, minHeight: 100 }} value={m.cases} onChange={e => setMod(i, { cases: e.target.value })} placeholder="Test cases (markdown or plain text)" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
              <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => { modFileIdx.current = i; modFileRef.current?.click(); }}><Paperclip size={12} /> Add test case files</button>
              {m.files.map(d => <span key={d.name} style={chip}>{d.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => setMod(i, { files: m.files.filter(z => z.name !== d.name) })} /></span>)}
            </div>
          </div>
        ))}
        <input ref={modFileRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.yaml,.yml,.xml,.feature,.docx" style={{ display: 'none' }} onChange={e => { addModFiles(e.target.files); e.target.value = ''; }} />
      </Card>

      <Card title="AUTOMATED TESTS (REPLAY WITHOUT AI)">
        <AutomatedTests projectId={id} login={login}
          onChanged={() => fetch('/api/projects/' + id).then(r => r.json()).then(j => j.success && setRuns(j.runs || []))}
          onLearn={(t) => onRun(t.target, { projectId: id, testMode: true, brief: { product: p.name, module: t.name, target: (t.target === 'web' ? p.targets.web : p.targets.app) || '', login, notes: p.notes, cases: 'Run this test once and save it as an automated test.\n' + t.yaml }, files: [] })} />
      </Card>

      <Card title={`REPORTS (${runs.length})`}>
        {runs.length === 0 && <div style={muted}>No reports yet. Press Test on Web or Test on Android.</div>}
        {runs.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: border, fontSize: 12.5 }}>
            <span style={{ fontWeight: 800, color: statusColor(r.status), width: 64 }}>{r.status.toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title} <span style={{ color: 'var(--text-muted)' }}>· {r.pass}/{r.total} passed · {ago(r.startedAt)}</span></span>
            <a className="btn-secondary" href={'/api/agent/reports/' + r.id + '/pdf'} download style={{ padding: '3px 10px', fontSize: 11.5, textDecoration: 'none' }}><Download size={11} /> PDF</a>
            <a className="btn-secondary" href={'/api/agent/reports/' + r.id + '/docx'} download style={{ padding: '3px 10px', fontSize: 11.5, textDecoration: 'none' }}><Download size={11} /> DOCX</a>
          </div>
        ))}
      </Card>

      <div style={{ textAlign: 'right' }}><button className="btn-secondary" style={{ color: '#b91c1c' }} onClick={remove}><Trash2 size={13} /> Delete project</button></div>
    </div>
  );
};
