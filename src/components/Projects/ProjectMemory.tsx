import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';

// The project's memory, shown compactly: one collapsed line per feature (open issues first), details only when opened,
// the first few features only until "Show more". The raw markdown file stays editable elsewhere.
export interface FeatureMem {
  cases?: number; pass?: number; fail?: number; blocked?: number; lastDate?: string; runs?: number;
  reach?: string; testData?: string; notes?: string[];
  caseList?: { id?: string; title: string; status: string; date?: string }[];
  issues?: { title: string; severity: string; location?: string; since?: string }[];
  fixed?: { title: string; date?: string }[];
}
export interface ContextData { features?: Record<string, FeatureMem>; personas?: Record<string, string>; notTested?: { area: string; reason?: string }[]; lastRun?: { date: string; pass: number; fail: number; blocked: number } | null }

const SUB = 'var(--text-muted, #86868b)', INK = 'var(--text-main, #1d1d1f)', LINE = 'rgba(120,120,128,0.2)';
const SEV: Record<string, string> = { critical: '#991b1b', major: '#dc2626', minor: '#d97706', cosmetic: '#64748b' };
const ST: Record<string, string> = { pass: '#16a34a', fail: '#dc2626', blocked: '#d97706' };
const pill = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 999, padding: '0 8px', fontSize: 11, fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' });
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: SUB, textTransform: 'uppercase', marginTop: 8, marginBottom: 2 };

const FeatureRow: React.FC<{ name: string; f: FeatureMem; open: boolean; toggle: () => void }> = ({ name, f, open, toggle }) => {
  const issues = f.issues?.length || 0;
  return (
    <div style={{ borderTop: `1px solid ${LINE}` }}>
      <button onClick={toggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: INK }}>
        {open ? <ChevronDown size={14} color={SUB} /> : <ChevronRight size={14} color={SUB} />}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {issues > 0 && <span style={pill('rgba(220,38,38,0.12)', '#dc2626')}><AlertTriangle size={11} /> {issues}</span>}
        {!!f.cases && <span style={{ fontSize: 11, color: SUB, whiteSpace: 'nowrap' }}><span style={{ color: ST.pass, fontWeight: 700 }}>{f.pass || 0}</span>/<span style={{ color: f.fail ? ST.fail : SUB, fontWeight: 700 }}>{f.fail || 0}</span>{f.blocked ? <>/<span style={{ color: ST.blocked, fontWeight: 700 }}>{f.blocked}</span></> : null}</span>}
        {f.lastDate && <span style={{ fontSize: 11, color: SUB, whiteSpace: 'nowrap' }}>{f.lastDate.slice(5)}</span>}
      </button>
      {open && (
        <div style={{ padding: '0 4px 10px 22px', fontSize: 12.5, lineHeight: 1.55, color: INK }}>
          {f.reach && <><div style={label}>How to reach</div><div>{f.reach}</div></>}
          {f.testData && <><div style={label}>Test data that worked</div><div>{f.testData}</div></>}
          {!!f.issues?.length && <><div style={label}>Open issues</div>{f.issues.slice(0, 8).map((i, k) => <div key={k} style={{ display: 'flex', gap: 6 }}><span style={{ color: SEV[i.severity] || SUB, fontWeight: 700, flexShrink: 0 }}>{i.severity}</span><span>{i.title}{i.location ? <span style={{ color: SUB }}> · {i.location}</span> : null}</span></div>)}</>}
          {!!f.notes?.length && <><div style={label}>Tips and quirks</div>{f.notes.slice(0, 8).map((n, k) => <div key={k}>• {n}</div>)}</>}
          {!!f.caseList?.length && <><div style={label}>Cases ({f.caseList.length})</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {f.caseList.slice().sort((a, b) => Number(a.status === 'pass') - Number(b.status === 'pass')).slice(0, 14).map((c, k) => <span key={k} title={c.title} style={{ ...pill('rgba(120,120,128,0.1)', INK), fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: ST[c.status] || SUB, flexShrink: 0 }} />{c.id || c.title}</span>)}
            {f.caseList.length > 14 && <span style={{ fontSize: 11, color: SUB }}>+{f.caseList.length - 14} more</span>}</div></>}
          {!!f.fixed?.length && <><div style={label}>Recently fixed</div><div style={{ color: SUB }}>{f.fixed.slice(0, 4).map(x => x.title).join(' · ')}</div></>}
        </div>
      )}
    </div>
  );
};

export const ProjectMemory: React.FC<{ data?: ContextData | null }> = ({ data }) => {
  const [q, setQ] = useState(''), [all, setAll] = useState(false), [open, setOpen] = useState<Record<string, boolean>>({}), [gaps, setGaps] = useState(false);
  const feats = useMemo(() => Object.entries(data?.features || {})
    .sort((a, b) => (b[1].issues?.length || 0) - (a[1].issues?.length || 0) || String(b[1].lastDate || '').localeCompare(String(a[1].lastDate || ''))), [data]);
  if (!feats.length && !Object.keys(data?.personas || {}).length) return <div style={{ fontSize: 12.5, color: SUB }}>Nothing learned yet. It fills in feature by feature as tests run.</div>;
  const shown = feats.filter(([n]) => !q || n.toLowerCase().includes(q.toLowerCase()));
  const LIMIT = 6, list = all || q ? shown : shown.slice(0, LIMIT);
  const issueTotal = feats.reduce((t, [, f]) => t + (f.issues?.length || 0), 0);
  const roles = Object.keys(data?.personas || {});
  return (
    <div style={{ color: INK }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, fontSize: 12.5 }}>
        <b>{feats.length} feature{feats.length === 1 ? '' : 's'}</b>
        {issueTotal > 0 ? <span style={pill('rgba(220,38,38,0.12)', '#dc2626')}><AlertTriangle size={11} /> {issueTotal} open issue{issueTotal === 1 ? '' : 's'}</span> : <span style={pill('rgba(22,163,74,0.12)', '#16a34a')}><CheckCircle2 size={11} /> no open issues</span>}
        {data?.lastRun && <span style={{ color: SUB }}>last run {data.lastRun.date}</span>}
        {feats.length > 6 && <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(120,120,128,0.1)', borderRadius: 8, padding: '3px 8px' }}><Search size={12} color={SUB} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a feature" style={{ border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: 12, width: 110, color: INK }} /></label>}
      </div>
      {roles.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>{roles.slice(0, 8).map(r => <span key={r} title={data?.personas?.[r] || ''} style={pill('rgba(79,70,229,0.1)', '#4f46e5')}>{r}</span>)}</div>}
      <div>
        {list.map(([n, f]) => <FeatureRow key={n} name={n} f={f} open={!!open[n]} toggle={() => setOpen(o => ({ ...o, [n]: !o[n] }))} />)}
        {q && !shown.length && <div style={{ fontSize: 12, color: SUB, padding: '8px 2px' }}>No feature matches.</div>}
      </div>
      {!q && shown.length > LIMIT && <button onClick={() => setAll(a => !a)} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 12.5, padding: '6px 2px', fontFamily: 'inherit' }}>{all ? 'Show fewer' : `Show ${shown.length - LIMIT} more`}</button>}
      {!!data?.notTested?.length && (
        <div style={{ borderTop: `1px solid ${LINE}` }}>
          <button onClick={() => setGaps(g => !g)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: INK, fontSize: 13, fontWeight: 600, textAlign: 'left' }}>
            {gaps ? <ChevronDown size={14} color={SUB} /> : <ChevronRight size={14} color={SUB} />} Not tested yet <span style={{ color: SUB, fontWeight: 400 }}>({data.notTested.length})</span>
          </button>
          {gaps && <div style={{ padding: '0 4px 8px 22px', fontSize: 12.5, lineHeight: 1.55 }}>{data.notTested.slice(0, 20).map((n, k) => <div key={k}>• {n.area}{n.reason ? <span style={{ color: SUB }}> ({n.reason})</span> : null}</div>)}</div>}
        </div>
      )}
    </div>
  );
};
