import React, { useCallback, useEffect, useState } from 'react';
import { Play, Plus, Trash2, Pencil, Sparkles, Terminal, Check, X as XIcon } from 'lucide-react';

interface T { id: string; name: string; target: 'web' | 'phone'; description: string; steps: number; needsAi: number; checks: number; source: string; updatedAt: string; yaml: string; lastRun: { status: string; at: string; runId: string; serial?: string } | null }
interface Dev { serial: string; displayName?: string; model?: string }

const border = '1px solid var(--border-color, #e2e8f0)';
const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9, border, fontSize: 12.5, fontFamily: 'Consolas, monospace', background: 'var(--bg-input, #fff)', color: 'var(--text-main)', resize: 'vertical' };
const col = (s?: string) => (s === 'passed' || s === 'pass' ? '#16a34a' : s === 'failed' || s === 'fail' ? '#dc2626' : '#d97706');
const small: React.CSSProperties = { padding: '3px 10px', fontSize: 11.5 };

const TEMPLATE = `name: Login works
target: web          # web or phone
steps:
  - open https://example.com/login
  - fill: { field: Email, value: "me@example.com" }
  - fill: { field: Password, value: "{{env:SF_PASSWORD}}" }   # secrets: {{env:NAME}}, never typed in clear
  - click "Sign in"
  - check: { id: TC-01, title: Dashboard opens }
  - expect "Dashboard"
  - expect no "Invalid password"
`;

export const AutomatedTests: React.FC<{ projectId: string; login: string; onChanged: () => void; onLearn: (t: T) => void }> = ({ projectId, login, onChanged, onLearn }) => {
  const [tests, setTests] = useState<T[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [devs, setDevs] = useState<Dev[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [shard, setShard] = useState(false);
  const [edit, setEdit] = useState<{ id?: string; source: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const load = useCallback(() => fetch(`/api/automation/${projectId}/tests`).then(r => r.json()).then(j => j.success && setTests(j.tests)).catch(() => {}), [projectId]);
  useEffect(() => { load(); fetch('/api/devices').then(r => r.json()).then(j => setDevs(j.devices || [])).catch(() => {}); }, [load]);

  const chosen = tests.filter(t => sel[t.id]);
  const toRun = chosen.length ? chosen : tests;
  const needsPhone = toRun.some(t => t.target === 'phone');
  const serials = Object.keys(picked).filter(s => picked[s]);

  const saveEdit = async () => {
    if (!edit) return;
    const j = await (await fetch(`/api/automation/${projectId}/tests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) })).json();
    if (!j.success) return setMsg(j.message || 'Could not save');
    setEdit(null); setMsg(j.needsAi ? `Saved. ${j.needsAi} step(s) are plain English: press "Learn with AI" once so they run without AI later.` : 'Saved.'); load();
  };
  const del = async (t: T) => { if (!window.confirm(`Delete test "${t.name}"?`)) return; await fetch(`/api/automation/${projectId}/tests/${t.id}`, { method: 'DELETE' }); load(); };
  const run = async () => {
    setRunning(true); setResults(null); setMsg('');
    try {
      const j = await (await fetch(`/api/automation/${projectId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: toRun.map(t => t.id), serials, shard, logins: login }) })).json();
      if (!j.success) setMsg(j.message || 'Run failed'); else setResults(j.results);
    } catch (e: any) { setMsg(e.message); }
    setRunning(false); load(); onChanged();
  };

  return (
    <div>
      {tests.length === 0 && !edit && <div style={muted}>No automated tests yet. After the AI finishes a test, press <b>Save as automated test</b> in the chat, or write one yourself. Saved tests replay with <b>0 AI tokens</b>.</div>}
      {tests.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: border, fontSize: 12.5, flexWrap: 'wrap' }}>
          <input type="checkbox" checked={!!sel[t.id]} onChange={e => setSel({ ...sel, [t.id]: e.target.checked })} />
          <span style={{ flex: 1, minWidth: 180 }}><b>{t.name}</b> <span style={{ color: 'var(--text-muted)' }}>· {t.target === 'web' ? 'Web' : 'Android'} · {t.steps} steps · {t.checks} checks · {t.source}</span></span>
          {t.needsAi > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}>{t.needsAi} step(s) need AI</span>}
          {t.lastRun && <span style={{ fontWeight: 800, color: col(t.lastRun.status) }}>{t.lastRun.status.toUpperCase()}</span>}
          {t.needsAi > 0 && <button className="btn-secondary" style={small} onClick={() => onLearn(t)}><Sparkles size={11} /> Learn with AI</button>}
          <button className="btn-secondary" style={small} onClick={() => setEdit({ id: t.id, source: t.yaml })}><Pencil size={11} /> Edit</button>
          <button className="btn-secondary" style={{ ...small, color: '#b91c1c' }} onClick={() => del(t)}><Trash2 size={11} /></button>
        </div>
      ))}

      {edit && (
        <div style={{ marginTop: 10 }}>
          <textarea value={edit.source} onChange={e => setEdit({ ...edit, source: e.target.value })} rows={14} spellCheck={false} style={inp} />
          <div style={{ ...muted, fontSize: 11.5, margin: '4px 0 8px' }}>YAML or JSON. Plain-English lines work too (<code>click "Login"</code>, <code>expect "Welcome"</code>, <code>open https://…</code>); anything it cannot understand is learned from one AI run.</div>
          <button className="btn-primary" style={small} onClick={saveEdit}><Check size={12} /> Save test</button>{' '}
          <button className="btn-secondary" style={small} onClick={() => setEdit(null)}><XIcon size={12} /> Cancel</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn-primary" disabled={!tests.length || running || (needsPhone && !serials.length)} onClick={run}><Play size={13} /> {running ? 'Running…' : chosen.length ? `Run ${chosen.length} selected` : 'Run all'} · 0 tokens</button>
        <button className="btn-secondary" onClick={() => setEdit({ source: TEMPLATE })}><Plus size={13} /> New test</button>
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('Saved') ? '#16a34a' : '#b91c1c', fontWeight: 700 }}>{msg}</span>}
      </div>

      {needsPhone && (
        <div style={{ marginTop: 10, ...muted }}>
          <b>Run Android tests on:</b>{' '}
          {devs.length === 0 && 'no device connected'}
          {devs.map(d => <label key={d.serial} style={{ marginRight: 12 }}><input type="checkbox" checked={!!picked[d.serial]} onChange={e => setPicked({ ...picked, [d.serial]: e.target.checked })} /> {d.displayName || d.model || d.serial}</label>)}
          {serials.length > 1 && <label style={{ marginLeft: 6 }}><input type="checkbox" checked={shard} onChange={e => setShard(e.target.checked)} /> split tests across devices (faster) instead of running all on each</label>}
        </div>
      )}

      {results && (
        <div style={{ marginTop: 12, border, borderRadius: 10, padding: 10 }}>
          {results.map((r, i) => (
            <div key={i} style={{ marginBottom: 8, fontSize: 12.5 }}>
              <b style={{ color: col(r.status) }}>{r.status === 'passed' ? 'PASS' : 'FAIL'}</b> {r.test} <span style={muted}>[{r.serial || '-'}] {(r.durationMs / 1000).toFixed(1)}s · 0 AI tokens</span>
              {r.error && <div style={{ color: '#b91c1c' }}>{r.error}</div>}
              {(r.checks || []).map((c: any, k: number) => <div key={k} style={{ paddingLeft: 14, color: col(c.status) }}>{c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '·'} {c.id} {c.title}{c.status !== 'pass' ? <span style={{ color: 'var(--text-muted)' }}> — {c.evidence}</span> : null}</div>)}
              {r.runId && <a href={'/api/agent/reports/' + r.runId + '/pdf'} download style={{ paddingLeft: 14, fontSize: 11.5 }}>Download PDF report</a>}
            </div>
          ))}
        </div>
      )}

      <div style={{ ...muted, fontSize: 11.5, marginTop: 12 }}>
        <Terminal size={11} style={{ verticalAlign: -1 }} /> CI / terminal: <code>npm run sf:run -- --project "{'{project name}'}" --junit results.xml</code> or <code>npm run sf:run -- --file test.yaml</code>. Exit code 0 = all passed, 1 = failed.
      </div>
    </div>
  );
};

// shown under a finished report in the chat: keep what the AI just did as a test that replays without AI
export const SaveAsTest: React.FC<{ runId: string; projectId?: string }> = ({ runId, projectId }) => {
  const [ok, setOk] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'saved' | string>('idle');
  useEffect(() => { fetch('/api/automation/recording/' + runId).then(r => r.json()).then(j => setOk(!!j.available)).catch(() => {}); }, [runId]);
  if (!ok || !projectId) return null;
  const save = async () => {
    const j = await (await fetch(`/api/automation/${projectId}/from-run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, name: name.trim() || 'Recorded test' }) })).json();
    setState(j.success ? 'saved' : j.message || 'Could not save');
  };
  if (state === 'saved') return <div style={{ marginTop: 8, fontSize: 12.5, color: '#16a34a', fontWeight: 700 }}>Saved. Run it any time from Projects → Automated tests, with 0 AI tokens.</div>;
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Test name, e.g. Login works" style={{ ...inp, fontFamily: 'inherit', width: 190, padding: '5px 9px' }} />
      <button className="btn-primary" style={small} onClick={save}><Sparkles size={11} /> Save as automated test</button>
      {state !== 'idle' && <span style={{ fontSize: 12, color: '#b91c1c' }}>{state}</span>}
    </div>
  );
};
