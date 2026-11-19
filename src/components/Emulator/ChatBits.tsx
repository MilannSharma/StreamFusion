import React, { useState } from 'react';
import { Copy, Check, Trash2, Search, ChevronRight, ChevronDown, RotateCcw, Play, Pencil, MessageSquare } from 'lucide-react';

const border = '1px solid var(--border-color, #e2e8f0)';
const MUTED = 'var(--text-muted, #64748b)';

// ---------- safe markdown (never injects HTML): headings, bold, italic, `code`, code blocks, lists, tables, quotes, links, rules ----------
const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<)]+|(?<![\w*])\*[^*\s][^*\n]*?\*(?![\w*])|(?<![\w_])_[^_\s][^_\n]*?_(?![\w_]))/g;
const inline = (s: string, key: string): React.ReactNode[] => {
  const out: React.ReactNode[] = []; let last = 0, m: RegExpExecArray | null, i = 0;
  const re = new RegExp(INLINE_RE.source, 'g');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0], k = key + '_' + i++;
    if (t[0] === '`') out.push(<code key={k} style={{ background: 'rgba(120,120,128,0.18)', padding: '1px 5px', borderRadius: 5, fontSize: '0.92em', fontFamily: 'JetBrains Mono, Consolas, monospace' }}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**') || t.startsWith('__')) out.push(<b key={k}>{inline(t.slice(2, -2), k)}</b>);
    else if (t[0] === '[') { const mm = /^\[([^\]]+)\]\((.+)\)$/.exec(t)!; out.push(<a key={k} href={mm[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5' }}>{mm[1]}</a>); }
    else if (t.startsWith('http')) out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', wordBreak: 'break-all' }}>{t}</a>);
    else out.push(<i key={k}>{inline(t.slice(1, -1), k)}</i>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
};

export const CopyBtn: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => {
  const [ok, setOk] = useState(false);
  return <button title="Copy" onClick={() => { try { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); } catch (e) {} }}
    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, padding: 2, display: 'inline-flex', ...style }}>{ok ? <Check size={13} /> : <Copy size={13} />}</button>;
};

const cells = (ln: string) => ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const isTableSep = (ln: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(ln) && ln.includes('-');

export const Markdown: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/```/);
  return <>{parts.map((p, pi) => {
    if (pi % 2 === 1) {
      const code = p.replace(/^[\w+-]*\n/, '').replace(/\n$/, '');
      return <div key={pi} style={{ position: 'relative', margin: '6px 0' }}>
        <pre style={{ margin: 0, background: '#0f172a', color: '#e2e8f0', padding: '10px 12px', borderRadius: 8, fontSize: 12, overflowX: 'auto', fontFamily: 'JetBrains Mono, Consolas, monospace' }}>{code}</pre>
        <CopyBtn text={code} style={{ position: 'absolute', top: 4, right: 4, color: '#94a3b8' }} />
      </div>;
    }
    const lines = p.split('\n'); const nodes: React.ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i], k = pi + '_' + i;
      if (ln.trim() === '') { nodes.push(<div key={k} style={{ height: 6 }} />); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { nodes.push(<hr key={k} style={{ border: 'none', borderTop: border, margin: '8px 0' }} />); i++; continue; }
      const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(ln);
      if (h) { const lv = h[1].length; nodes.push(<div key={k} style={{ fontWeight: 700, fontSize: lv === 1 ? '1.18em' : lv === 2 ? '1.1em' : '1.02em', margin: '8px 0 3px' }}>{inline(h[2], k)}</div>); i++; continue; }
      if (ln.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(ln); i += 2; const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
        nodes.push(<div key={k} style={{ overflowX: 'auto', margin: '6px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{head.map((c, j) => <th key={j} style={{ border, padding: '4px 8px', background: 'rgba(120,120,128,0.12)', textAlign: 'left' }}>{inline(c, k + 'h' + j)}</th>)}</tr></thead>
          <tbody>{rows.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j} style={{ border, padding: '4px 8px', verticalAlign: 'top' }}>{inline(c, k + a + '_' + j)}</td>)}</tr>)}</tbody></table></div>);
        continue;
      }
      if (/^\s*>\s?/.test(ln)) {
        const q: string[] = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        nodes.push(<div key={k} style={{ borderLeft: '3px solid #a5b4fc', paddingLeft: 10, margin: '4px 0', color: MUTED }}>{q.map((l, j) => <div key={j}>{inline(l, k + j)}</div>)}</div>); continue;
      }
      const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(ln);
      if (li) {
        const ordered = /\d/.test(li[2]); const items: { t: string; d: number }[] = [];
        while (i < lines.length) { const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]); if (!m) break; items.push({ t: m[3], d: Math.min(2, Math.floor(m[1].length / 2)) }); i++; }
        const Tag: any = ordered ? 'ol' : 'ul';
        nodes.push(<Tag key={k} style={{ margin: '4px 0', paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ marginLeft: it.d * 16 }}>{inline(it.t, k + 'i' + j)}</li>)}</Tag>); continue;
      }
      nodes.push(<div key={k}>{inline(ln, k)}</div>); i++;
    }
    return <React.Fragment key={pi}>{nodes}</React.Fragment>;
  })}</>;
};

// ---------- consecutive tool calls collapse into one expandable row ----------
export const ToolGroup: React.FC<{ tools: { id: string; name: string; input: any; state: 'running' | 'ok' | 'error'; summary?: string }[] }> = ({ tools }) => {
  const [open, setOpen] = useState(false);
  const running = tools.find(t => t.state === 'running');
  const failed = tools.filter(t => t.state === 'error').length;
  const last = running || tools[tools.length - 1];
  const color = running ? '#d97706' : failed ? '#dc2626' : '#16a34a';
  return (
    <div style={{ fontSize: 11.5, border, borderLeft: `3px solid ${color}`, borderRadius: 8, background: 'var(--bg-card, #fff)', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', cursor: 'pointer' }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span style={{ fontWeight: 700 }}>{tools.length} step{tools.length > 1 ? 's' : ''}</span>
        <span style={{ color: MUTED, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
          {running ? 'running ' + last.name + '…' : 'last: ' + last.name}</span>
        <span style={{ color, fontWeight: 700 }}>{running ? '●' : failed ? failed + ' failed' : '✓'}</span>
      </div>
      {open && <div style={{ borderTop: border, padding: '4px 9px', maxHeight: 220, overflowY: 'auto', fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
        {tools.map(t => <div key={t.id} style={{ padding: '2px 0' }}>
          <span style={{ color: t.state === 'ok' ? '#16a34a' : t.state === 'error' ? '#dc2626' : '#d97706' }}>{t.state === 'ok' ? '✓' : t.state === 'error' ? '✗' : '…'}</span> <b>{t.name}</b>
          <span style={{ color: MUTED }}> {JSON.stringify(t.input || {}).slice(0, 100)}</span>
          {t.summary && <div style={{ color: MUTED, paddingLeft: 14 }}>{t.summary}</div>}
        </div>)}
      </div>}
    </div>
  );
};

// ---------- History panel: fills the chat area, like a session list ----------
export interface ChatSummary { id: string; title: string; world: string; status: string; updatedAt: number; isTest: boolean; messages: number; pass: number; fail: number; total: number; preview: string }

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'now'; if (s < 3600) return Math.round(s / 60) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h';
  if (s < 86400 * 30) return Math.round(s / 86400) + 'd'; return new Date(t).toLocaleDateString();
};

const HistRow: React.FC<{ c: ChatSummary; current: boolean; live: boolean; onOpen: () => void; onContinue: () => void; onRename: () => void; onDelete: () => void }> = ({ c, current, live, onOpen, onContinue, onRename, onDelete }) => {
  const [hover, setHover] = useState(false);
  const interrupted = c.status === 'running' && !live;
  const act: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, padding: 3, display: 'inline-flex', borderRadius: 6 };
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ padding: '9px 12px', borderRadius: 10, cursor: 'pointer', background: current ? 'rgba(79,70,229,0.14)' : hover ? 'rgba(120,120,128,0.10)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: current ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
        {hover ? <>
          <button title="Rename" style={act} onClick={e => { e.stopPropagation(); onRename(); }}><Pencil size={14} /></button>
          <button title="Delete" style={act} onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 size={14} /></button>
        </> : <span style={{ fontSize: 12, color: MUTED }}>{live ? 'running' : ago(c.updatedAt)}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: MUTED }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {interrupted && <b style={{ color: '#d97706' }}>Interrupted · </b>}
          {c.isTest && c.total > 0 ? <><span style={{ color: '#16a34a' }}>{c.pass} pass</span> · <span style={{ color: c.fail ? '#dc2626' : MUTED }}>{c.fail} fail</span></> : (c.preview || c.messages + ' messages')}
        </div>
        {!live && <button onClick={e => { e.stopPropagation(); onContinue(); }}
          style={{ background: interrupted ? '#4f46e5' : 'transparent', color: interrupted ? '#fff' : '#4f46e5', border: interrupted ? 'none' : '1px solid #4f46e5', borderRadius: 999, padding: '2px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Play size={10} fill="currentColor" /> {interrupted ? 'Resume' : 'Continue'}</button>}
      </div>
    </div>
  );
};

export const HistoryPanel: React.FC<{ chats: ChatSummary[]; currentId: string; liveId: string | null; onOpen: (id: string) => void; onContinue: (id: string, interrupted: boolean) => void; onRename: (id: string, title: string) => void; onDelete: (id: string) => void; onNew: () => void; onClose: () => void }> = ({ chats, currentId, liveId, onOpen, onContinue, onRename, onDelete, onNew, onClose }) => {
  const [q, setQ] = useState('');
  const list = chats.filter(c => !q.trim() || (c.title + ' ' + c.preview).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-card, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 12px 6px', padding: '8px 12px', border, borderRadius: 10, background: 'rgba(120,120,128,0.08)' }}>
        <Search size={14} color="#94a3b8" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats…" autoFocus style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, flex: 1, minWidth: 0, color: 'inherit' }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 8px 10px' }}>
        {chats.length === 0 ? (
          <div style={{ height: '100%', minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', color: MUTED, padding: 20 }}>
            <MessageSquare size={34} strokeWidth={1.5} />
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>No chats yet</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 250 }}>Your chats and tests are saved here automatically. You can come back and continue any of them.</div>
            <button onClick={onNew} style={{ marginTop: 6, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Start a new chat</button>
          </div>
        ) : list.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTED, padding: 16, textAlign: 'center' }}>No chat matches “{q}”.</div>
        ) : list.map(c => (
          <HistRow key={c.id} c={c} current={c.id === currentId} live={c.id === liveId} onOpen={() => onOpen(c.id)}
            onContinue={() => onContinue(c.id, c.status === 'running' && c.id !== liveId)}
            onRename={() => { const t = window.prompt('Rename chat', c.title); if (t && t.trim()) onRename(c.id, t.trim()); }}
            onDelete={() => { if (window.confirm('Delete this chat?')) onDelete(c.id); }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: border }}>
        <button onClick={onClose} style={{ flex: 1, background: 'transparent', border, borderRadius: 10, padding: '8px', fontSize: 13, cursor: 'pointer', color: 'inherit' }}>Back to chat</button>
        <button onClick={onNew} style={{ flex: 1, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, padding: '8px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New chat</button>
      </div>
    </div>
  );
};

export const ResumeBanner: React.FC<{ onResume: () => void; done: number; onDismiss: () => void }> = ({ onResume, done, onDismiss }) => (
  <div style={{ padding: '8px 12px', borderTop: border, background: '#fffbeb', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
    <RotateCcw size={14} color="#b45309" />
    <div style={{ flex: 1, minWidth: 0, color: '#92400e' }}><b>This test was interrupted.</b> {done ? done + ' case' + (done > 1 ? 's' : '') + ' already done will not be repeated.' : 'It can continue from the start of the brief.'}</div>
    <button onClick={onResume} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Play size={11} fill="currentColor" /> Resume test</button>
    <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
  </div>
);
