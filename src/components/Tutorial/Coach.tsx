import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { Mascot, type MascotMood } from './Mascot';

// Page guides with the avatar: a small card that walks the user through a task step by step.
// - Steps with `done` complete by themselves (the card moves on when the app state changes); steps without `done` have a Next button.
// - Stays until the task is finished. "Skip guide" or finishing it hides it for good (stored in localStorage).
export interface CoachStep {
  title: string;
  body: React.ReactNode;
  mood?: MascotMood;
  done?: boolean;                 // undefined = manual step (Next button)
  action?: { label: string; onClick: () => void; busy?: boolean };
  error?: string | null;
  note?: React.ReactNode;         // small extra line (e.g. an alternative)
}
export interface CoachGuide { id: string; enabled?: boolean; steps: CoachStep[]; doneTitle: string; doneBody: string }

const KEY = 'sf_coach_';
const getFlag = (id: string) => { try { return localStorage.getItem(KEY + id) || ''; } catch (e) { return ''; } };
const setFlag = (id: string, v: string) => { try { localStorage.setItem(KEY + id, v); } catch (e) {} };
export const resetCoaches = () => { try { Object.keys(localStorage).filter(k => k.startsWith(KEY)).forEach(k => localStorage.removeItem(k)); } catch (e) {} window.dispatchEvent(new Event('sf-coach-reset')); };

export const Coach: React.FC<{ guides: CoachGuide[]; active?: boolean }> = ({ guides, active = true }) => {
  const [, force] = useState(0);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [celebrate, setCelebrate] = useState<CoachGuide | null>(null);
  const shown = useRef<Record<string, boolean>>({});
  useEffect(() => { const h = () => { shown.current = {}; setManual({}); force(n => n + 1); }; window.addEventListener('sf-coach-reset', h); return () => window.removeEventListener('sf-coach-reset', h); }, []);

  const isDone = (g: CoachGuide, i: number) => (g.steps[i].done === undefined ? !!manual[g.id + ':' + i] || !!getFlag('m_' + g.id + i) : !!g.steps[i].done);
  const open = (g: CoachGuide) => g.enabled !== false && !getFlag(g.id);
  const nextIdx = (g: CoachGuide) => g.steps.findIndex((_, i) => !isDone(g, i));

  // a guide that was on screen and then got fully done: say well done once, then never show it again
  useEffect(() => {
    if (!active) return;
    for (const g of guides) {
      if (!open(g)) continue;
      const idx = nextIdx(g);
      if (idx >= 0) { shown.current[g.id] = true; }
      else if (shown.current[g.id]) { shown.current[g.id] = false; setFlag(g.id, 'done'); setCelebrate(g); }
    }
  });
  useEffect(() => { if (!celebrate) return; const t = setTimeout(() => setCelebrate(null), 4500); return () => clearTimeout(t); }, [celebrate]);

  if (!active) return null;
  const current = guides.find(g => open(g) && nextIdx(g) >= 0);
  const card = (children: React.ReactNode, mood: MascotMood, onClose: () => void) => (
    <div style={{ position: 'fixed', right: 22, bottom: 48, width: 360, maxWidth: 'calc(100vw - 32px)', zIndex: 9000, borderRadius: 18, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
      background: 'var(--glass-strong, rgba(255,255,255,0.92))', border: '1px solid var(--glass-border, #e2e8f0)', boxShadow: '0 18px 48px -12px rgba(30,27,75,0.35)', backdropFilter: 'blur(18px)' }}>
      <Mascot mood={mood} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}><X size={15} /></button>
    </div>
  );

  if (celebrate) return card(<>
    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', display: 'flex', gap: 6, alignItems: 'center' }}><Check size={15} color="#16a34a" /> {celebrate.doneTitle}</div>
    <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)', lineHeight: 1.55, marginTop: 4 }}>{celebrate.doneBody}</div>
  </>, 'celebrate', () => setCelebrate(null));

  if (!current) return null;
  const idx = nextIdx(current);
  const st = current.steps[idx];
  const skip = () => { setFlag(current.id, 'skip'); force(n => n + 1); };
  return card(<>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6366f1', letterSpacing: '0.05em' }}>STEP {idx + 1} OF {current.steps.length}</div>
    <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-main)', margin: '2px 0 4px' }}>{st.title}</div>
    <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)', lineHeight: 1.55 }}>{st.body}</div>
    {st.error && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{st.error}</div>}
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
      {st.action && <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12.5 }} disabled={st.action.busy} onClick={st.action.onClick}>{st.action.busy && <Loader2 size={13} style={{ animation: 'sf-spin 1s linear infinite' }} />} {st.action.label}</button>}
      {st.done === undefined && <button className={st.action ? 'btn-secondary' : 'btn-primary'} style={{ padding: '6px 14px', fontSize: 12.5 }} onClick={() => { setFlag('m_' + current.id + idx, '1'); setManual(m => ({ ...m, [current.id + ':' + idx]: true })); }}>{idx === current.steps.length - 1 ? 'Done' : 'Next'}</button>}
      <button onClick={skip} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11.5, marginLeft: 'auto', textDecoration: 'underline' }}>Skip guide</button>
    </div>
    {st.note && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>{st.note}</div>}
    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>{current.steps.map((_, i) => <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, background: i < idx || isDone(current, i) ? '#22c55e' : i === idx ? '#4f46e5' : 'rgba(100,116,139,0.35)', transition: 'all .25s' }} />)}</div>
    <style>{'@keyframes sf-spin{to{transform:rotate(360deg)}}'}</style>
  </>, st.mood || 'listening', skip);
};
