import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Briefcase, ArrowLeft, Globe, Smartphone, Trash2, Plus, Paperclip, X, Download, Save, Eye, EyeOff, Play, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { loadSecret, saveSecret, loginSecretName } from '../Emulator/secrets';
import { readBriefFiles } from '../Emulator/readFiles';
import { AutomatedTests } from './AutomatedTests';
import { ProjectMemory } from './ProjectMemory';
import { countCases } from '../Emulator/TestBrief';

type PFile = { name: string; text: string };
interface Module { name: string; cases: string; files: PFile[]; updatedAt?: string }
interface Project { context?: string; contextData?: any; id: string; name: string; targets: { web: string; app: string }; notes: string; docs: PFile[]; modules: Module[]; updatedAt: string }
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
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [addErr, setAddErr] = useState('');
  const create = async () => {
    const j = await (await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) })).json();
    if (!j.success) return setAddErr(j.message || 'Could not create');
    setAdding(false); setNewName(''); setAddErr(''); setOpenId(j.projectId);
  };
  const addBox = adding ? (
    <div className="glass-panel" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input autoFocus value={newName} onChange={e => { setNewName(e.target.value); setAddErr(''); }} onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) create(); if (e.key === 'Escape') setAdding(false); }} placeholder="Project name, e.g. Rysen HQ" style={{ ...inp, resize: 'none', flex: 1, minWidth: 200 }} />
      <button className="btn-primary" disabled={!newName.trim()} onClick={create}>Create project</button>
      <button className="btn-secondary" onClick={() => { setAdding(false); setAddErr(''); }}>Cancel</button>
      {addErr && <span style={{ color: '#b91c1c', fontSize: 12, fontWeight: 700 }}>{addErr}</span>}
    </div>
  ) : null;
  if (openId) return <Detail id={openId} onBack={() => setOpenId('')} onRun={onRun} />;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={22} color="#fff" /></div>
        <div><h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)' }}>Projects</h1><p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Everything about a product in one place: test cases, documents, logins and reports.</p></div>
        <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}><Plus size={14} /> Add project</button>
      </div>
      {addBox}
      {list === null ? <div style={muted}>Loading…</div> : list.length === 0 ? (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
          <Briefcase size={34} color="#6366f1" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>No projects yet</div>
          <div style={{ ...muted, maxWidth: 460, margin: '0 auto' }}>A project is created automatically the first time you start a test: open <b>Test Websites</b> or <b>Test Apps</b>, turn on <b>Test mode</b>, fill the test brief and press <b>Start test</b>. Next time you only pick the project.</div>
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
  const [tab, setTab] = useState<'overview' | 'features' | 'memory' | 'auto' | 'reports'>('overview');
  const [openMods, setOpenMods] = useState<Record<number, boolean>>({});
  const [ctxEdit, setCtxEdit] = useState(false), [ctxText, setCtxText] = useState(''), [ctxBusy, setCtxBusy] = useState(false);

  useEffect(() => {
    fetch('/api/projects/' + id).then(r => r.json()).then(j => { if (j.success) { setP(j.project); setRuns(j.runs || []); } });
    loadSecret(loginSecretName(id)).then(setLogin);
  }, [id]);
  // the memory is written by the tests while this page is open: pick up the newest copy whenever its tab is shown
  const refreshMemory = () => fetch('/api/projects/' + id).then(r => r.json()).then(j => { if (j.success) { setP(prev => (prev ? { ...prev, context: j.project.context, contextData: j.project.contextData } : j.project)); setRuns(j.runs || []); } });
  useEffect(() => { if (tab === 'memory' || tab === 'reports') refreshMemory(); }, [tab]);
  if (!p) return <div style={muted}>Loading…</div>;
  const edit = (fn: (x: Project) => Project) => { setP(fn(p)); setDirty(true); setMsg(''); };
  const save = async () => {
    const j = await (await fetch('/api/projects/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, context: undefined, contextData: undefined }) })).json(); // the memory is saved by the tests and by Edit context, never overwritten by this form
    await saveSecret(loginSecretName(id), login);
    if (j.success) { setP(prev => ({ ...j.project, context: prev?.context ?? j.project.context, contextData: prev?.contextData ?? j.project.contextData })); setDirty(false); setMsg('Saved.'); }
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

  const issueTotal = Object.values((p.contextData?.features || {}) as Record<string, any>).reduce((t: number, f: any) => t + (f.issues?.length || 0), 0);
  const featCount = Object.keys(p.contextData?.features || {}).length;
  const tabs: { id: typeof tab; label: string; badge?: string | number; warn?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'features', label: 'Features', badge: p.modules.length },
    { id: 'memory', label: 'Memory', badge: issueTotal ? issueTotal + ' open' : featCount || undefined, warn: issueTotal > 0 },
    { id: 'auto', label: 'Automated tests' },
    { id: 'reports', label: 'Reports', badge: runs.length }
  ];
  const saveContext = async () => {
    setCtxBusy(true);
    try {
      const j = await (await fetch('/api/projects/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: ctxText }) })).json();
      if (j.success) { setP(prev => (prev ? { ...prev, context: j.project.context, contextData: j.project.contextData } : prev)); setCtxEdit(false); setMsg('Context saved.'); }
    } finally { setCtxBusy(false); }
  };

  return (
    <div>
      <div style={{ position: 'sticky', top: -24, zIndex: 5, background: 'var(--bg-deep)', paddingTop: 4, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={14} /> Projects</button>
          <input value={p.name} onChange={e => edit(x => ({ ...x, name: e.target.value }))} style={{ ...inp, resize: 'none', width: 'auto', flex: 1, minWidth: 200, fontSize: 18, fontWeight: 800 }} />
          <button className="btn-primary" disabled={!p.targets.web && !p.modules.length} onClick={() => run('web')} title="Open Test Websites with this project filled in"><Globe size={14} /> Test on Web</button>
          <button className="btn-primary" onClick={() => run('phone')} title="Open Test Apps with this project filled in"><Smartphone size={14} /> Test on Android</button>
          <button className="btn-primary" disabled={!dirty} onClick={save} style={{ background: dirty ? undefined : '#94a3b8' }}><Save size={14} /> Save</button>
          {msg && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>{msg}</span>}
        </div>
        <div style={{ display: 'flex', gap: 2, borderBottom: border, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', color: tab === t.id ? '#4f46e5' : 'var(--text-muted)', borderBottom: tab === t.id ? '2.5px solid #4f46e5' : '2.5px solid transparent', marginBottom: -1 }}>
              {t.label}
              {t.badge !== undefined && t.badge !== 0 && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '0 7px', background: t.warn ? 'rgba(220,38,38,0.12)' : 'rgba(120,120,128,0.15)', color: t.warn ? '#dc2626' : 'var(--text-muted)' }}>{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <>
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

        <Card title="PRD / NOTES / DOCUMENTS">
          <textarea style={{ ...inp, minHeight: 90 }} value={p.notes} onChange={e => edit(x => ({ ...x, notes: e.target.value }))} placeholder="Requirements, environment, known issues, anything the tester should know" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => docRef.current?.click()}><Paperclip size={12} /> Add documents</button>
            {p.docs.map(d => <span key={d.name} style={chip}>{d.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => edit(x => ({ ...x, docs: x.docs.filter(z => z.name !== d.name) }))} /></span>)}
            <input ref={docRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.yaml,.yml,.xml,.docx" style={{ display: 'none' }} onChange={e => { addDocs(e.target.files); e.target.value = ''; }} />
          </div>
        </Card>
        <div style={{ textAlign: 'right' }}><button className="btn-secondary" style={{ color: '#b91c1c' }} onClick={remove}><Trash2 size={13} /> Delete project</button></div>
      </>}

      {tab === 'features' && (
        <Card title={`FEATURES / MODULES AND TEST CASES (${p.modules.length})`} right={<button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => { edit(x => ({ ...x, modules: [...x.modules, { name: 'New module', cases: '', files: [] }] })); setOpenMods(o => ({ ...o, [p.modules.length]: true })); }}><Plus size={12} /> Add module</button>}>
          {p.modules.length === 0 && <div style={muted}>No modules yet. They are added when you start a test, or press Add module.</div>}
          {p.modules.map((m, i) => {
            const open = !!openMods[i], n = countCases(m.cases || ''), mem = p.contextData?.features?.[m.name], issues = mem?.issues?.length || 0;
            return (
              <div key={i} style={{ border, borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', flexWrap: 'wrap' }}>
                  <button onClick={() => setOpenMods(o => ({ ...o, [i]: !o[i] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', color: 'var(--text-muted)', padding: 2 }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                  {open
                    ? <input style={{ ...inp, resize: 'none', width: 'auto', flex: 1, minWidth: 160, fontWeight: 700 }} value={m.name} onChange={e => setMod(i, { name: e.target.value })} />
                    : <button onClick={() => setOpenMods(o => ({ ...o, [i]: true }))} style={{ flex: 1, minWidth: 140, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: 'var(--text-main)' }}>{m.name}</button>}
                  {!open && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{n ? n + ' case' + (n > 1 ? 's' : '') : 'no cases'}{m.files.length ? ` · ${m.files.length} file${m.files.length > 1 ? 's' : ''}` : ''}</span>}
                  {issues > 0 && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '0 8px', background: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>{issues} open</span>}
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => run('web', m)}><Play size={11} /> Web</button>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => run('phone', m)}><Play size={11} /> Android</button>
                  {open && <button className="btn-secondary" style={{ padding: '4px 8px' }} title="Delete module" onClick={() => edit(x => ({ ...x, modules: x.modules.filter((_, k) => k !== i) }))}><Trash2 size={13} /></button>}
                </div>
                {open && (
                  <div style={{ padding: '0 12px 12px' }}>
                    <textarea style={{ ...inp, minHeight: 100 }} value={m.cases} onChange={e => setMod(i, { cases: e.target.value })} placeholder="Test cases (markdown or plain text)" />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                      <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => { modFileIdx.current = i; modFileRef.current?.click(); }}><Paperclip size={12} /> Add test case files</button>
                      {m.files.map(d => <span key={d.name} style={chip}>{d.name}<X size={11} style={{ cursor: 'pointer' }} onClick={() => setMod(i, { files: m.files.filter(z => z.name !== d.name) })} /></span>)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <input ref={modFileRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.yaml,.yml,.xml,.feature,.docx" style={{ display: 'none' }} onChange={e => { addModFiles(e.target.files); e.target.value = ''; }} />
        </Card>
      )}

      {tab === 'memory' && (
        <Card title="PROJECT MEMORY: LEARNED FROM TESTS, FEATURE BY FEATURE" right={!ctxEdit && <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => { setCtxText(p.context || ''); setCtxEdit(true); }}><Pencil size={12} /> Edit context file</button>}>
          <div style={{ ...muted, marginBottom: 8 }}>Updated after every test case and sent to the AI with the next test, so it goes straight to the known screens and re-checks the open issues.</div>
          {ctxEdit ? (
            <>
              <textarea style={{ ...inp, minHeight: 300, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5, lineHeight: 1.5 }} value={ctxText} onChange={e => setCtxText(e.target.value)} />
              <div style={{ ...muted, fontSize: 11.5, margin: '4px 0 8px' }}>The part between the sf:auto markers is rewritten by the tests. Write your own notes outside the markers (below the block) and they are never touched.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" disabled={ctxBusy} onClick={saveContext}>{ctxBusy ? 'Saving…' : 'Save'}</button>
                <button className="btn-secondary" onClick={() => setCtxEdit(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <ProjectMemory data={p.contextData} />
              {(() => { const mine = (p.context || '').replace(/<!-- sf:auto:start -->[\s\S]*?<!-- sf:auto:end -->/, '').trim(); return mine ? <div style={{ borderTop: border, marginTop: 10, paddingTop: 10 }}><div style={{ ...lbl, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your notes</div><div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{mine}</div></div> : null; })()}
            </>
          )}
        </Card>
      )}

      {tab === 'auto' && (
        <Card title="AUTOMATED TESTS (REPLAY WITHOUT AI)">
          <AutomatedTests projectId={id} login={login}
            onChanged={() => fetch('/api/projects/' + id).then(r => r.json()).then(j => j.success && setRuns(j.runs || []))}
            onLearn={(t) => onRun(t.target, { projectId: id, testMode: true, brief: { product: p.name, module: t.name, target: (t.target === 'web' ? p.targets.web : p.targets.app) || '', login, notes: p.notes, cases: 'Run this test once and save it as an automated test.\n' + t.yaml }, files: [] })} />
        </Card>
      )}

      {tab === 'reports' && (
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
      )}
    </div>
  );
};
