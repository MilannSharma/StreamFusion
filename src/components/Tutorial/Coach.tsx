import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, HelpCircle } from 'lucide-react';
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
  target?: string;                // data-guide="..." of the real button/field to point at: the guide travels there and highlights it
  onEnter?: () => void;           // runs when this step is shown (e.g. open the panel that holds the target)
}

// Finds the real element a step points at and follows it (scroll, resize, re-render) until the step changes.
type Rect = { top: number; left: number; width: number; height: number };
const useSpot = (target?: string): Rect | null => {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    setRect(null);
    if (!target) return;
    let scrolled = false;
    const find = () => {
      const els = Array.from(document.querySelectorAll('[data-guide="' + target + '"]')) as HTMLElement[];
      const el = els.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (!el) { setRect(r => (r ? null : r)); return; }
      if (!scrolled) { scrolled = true; const b = el.getBoundingClientRect(); if (b.top < 60 || b.bottom > window.innerHeight - 60) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} } }
      const r = el.getBoundingClientRect();
      setRect(o => (o && Math.abs(o.top - r.top) < 1 && Math.abs(o.left - r.left) < 1 && Math.abs(o.width - r.width) < 1 && Math.abs(o.height - r.height) < 1 ? o : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    find(); const t = setInterval(find, 250);
    return () => clearInterval(t);
  }, [target]);
  return rect;
};
export interface CoachGuide { id: string; enabled?: boolean; steps: CoachStep[]; doneTitle: string; doneBody: string; label?: string; hint?: string; tourOnly?: boolean }

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
  const open = (g: CoachGuide) => !g.tourOnly && g.enabled !== false && !getFlag(g.id);
  // Help button: pick any task and walk through it with Back / Next, whenever you want (not tied to the page)
  const [menu, setMenu] = useState(false);
  const [tour, setTour] = useState<{ id: string; idx: number } | null>(null);
  const nextIdx = (g: CoachGuide) => g.steps.findIndex((_, i) => !isDone(g, i));

  // a guide that was on screen and then got fully done: say well done once, then never show it again
  useEffect(() => {
    if (!active) return;
    for (const g of guides) {
      if (!open(g)) continue;
      const idx = nextIdx(g);
      if (idx >= 0) { shown.current[g.id] = true; }
      else if (shown.current[g.id]) { shown.current[g.id] = false; setFlag(g.id, 'done'); }
    }
  });
  useEffect(() => { if (!celebrate) return; const t = setTimeout(() => setCelebrate(null), 4500); return () => clearTimeout(t); }, [celebrate]);

  const curG = guides.find(g => open(g) && nextIdx(g) >= 0);
  const tgNow = tour ? guides.find(g => g.id === tour.id) : null;
  const stepNow: CoachStep | null = menu || celebrate ? null : tgNow && tour ? tgNow.steps[tour.idx] : null; // guides never pop up by themselves: only the ? button opens them
  const spot = useSpot(active && stepNow?.done !== true ? stepNow?.target : undefined);
  const enterKey = tour ? tour.id + ':' + tour.idx : '';
  useEffect(() => { if (tour) tgNow?.steps[tour.idx]?.onEnter?.(); }, [enterKey]);

  if (!active) return null;
  const current = curG;
  // the card sits next to the highlighted button (right, left, below or above, whichever fits), or in the corner when there is nothing to point at
  const place = (r: Rect | null): React.CSSProperties => {
    if (!r) return { right: 22, bottom: 48 };
    const W = Math.min(360, window.innerWidth - 32), H = 250, vw = window.innerWidth, vh = window.innerHeight, gap = 18;
    const clampTop = (t: number) => Math.max(8, Math.min(vh - H - 8, t));
    if (r.left + r.width + gap + W <= vw - 8) return { left: r.left + r.width + gap, top: clampTop(r.top + r.height / 2 - H / 2) };
    if (r.left - gap - W >= 8) return { left: r.left - gap - W, top: clampTop(r.top + r.height / 2 - H / 2) };
    const left = Math.max(8, Math.min(vw - W - 8, r.left + r.width / 2 - W / 2));
    if (r.top + r.height + gap + H <= vh - 8) return { left, top: r.top + r.height + gap };
    return { left, top: Math.max(8, r.top - gap - H) };
  };
  const ring = spot && (
    <div style={{ position: 'fixed', top: spot.top - 6, left: spot.left - 6, width: spot.width + 12, height: spot.height + 12, borderRadius: 14, border: '3px solid #818cf8', pointerEvents: 'none', zIndex: 8995,
      boxShadow: '0 0 0 9999px rgba(15,23,42,0.45), 0 0 26px 6px rgba(129,140,248,0.75)', animation: 'sf-ring 1.4s ease-in-out infinite', transition: 'top .35s ease, left .35s ease, width .35s ease, height .35s ease' }}>
      <style>{'@keyframes sf-ring{50%{box-shadow:0 0 0 9999px rgba(15,23,42,0.45),0 0 8px 2px rgba(129,140,248,0.4)}}'}</style>
    </div>
  );
  const card = (children: React.ReactNode, mood: MascotMood, onClose: () => void, at: Rect | null = null) => createPortal(<>
    {ring}
    <div style={{ position: 'fixed', ...place(at), width: 360, maxWidth: 'calc(100vw - 32px)', zIndex: 9000, borderRadius: 18, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
      background: 'var(--glass-strong, rgba(255,255,255,0.92))', border: '1px solid var(--glass-border, #e2e8f0)', boxShadow: '0 18px 48px -12px rgba(30,27,75,0.35)', backdropFilter: 'blur(18px)' }}>
      <Mascot mood={mood} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}><X size={15} /></button>
    </div></>, document.body);

  if (celebrate) return card(<>
    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', display: 'flex', gap: 6, alignItems: 'center' }}><Check size={15} color="#16a34a" /> {celebrate.doneTitle}</div>
    <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)', lineHeight: 1.55, marginTop: 4 }}>{celebrate.doneBody}</div>
  </>, 'celebrate', () => setCelebrate(null));

  const launcher = (
    <button onClick={() => { setMenu(m => !m); setTour(null); }} title="Help: step-by-step guides" aria-label="Help"
      style={{ position: 'fixed', right: 22, bottom: 48, zIndex: 8990, width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px -8px rgba(79,70,229,0.65)', opacity: 0.92 }}>
      <HelpCircle size={20} />
    </button>
  );

  const tg = tour ? guides.find(g => g.id === tour.id) : null;
  if (tg && tour) {
    const st = tg.steps[tour.idx]; const last = tour.idx === tg.steps.length - 1;
    return card(<>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6366f1', letterSpacing: '0.05em' }}>{(tg.label || 'GUIDE').toUpperCase()} · STEP {tour.idx + 1} OF {tg.steps.length}</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-main)', margin: '2px 0 4px' }}>{st.title}{st.done === true && <span style={{ color: '#16a34a', fontSize: 12, marginLeft: 6 }}>✓ done</span>}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)', lineHeight: 1.55 }}>{st.done === true ? 'This is already set up. Nothing to press here. Go to the next step.' : st.body}</div>
      {st.error && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{st.error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        {st.action && st.done !== true && <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12.5 }} disabled={st.action.busy} onClick={st.action.onClick}>{st.action.busy && <Loader2 size={13} style={{ animation: 'sf-spin 1s linear infinite' }} />} {st.action.label}</button>}
        {tour.idx > 0 && <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setTour({ id: tg.id, idx: tour.idx - 1 })}>Back</button>}
        <button className={st.action && st.done !== true ? 'btn-secondary' : 'btn-primary'} style={{ padding: '6px 14px', fontSize: 12.5 }} onClick={() => last ? (setTour(null), setMenu(true)) : setTour({ id: tg.id, idx: tour.idx + 1 })}>{last ? 'Finish' : 'Next'}</button>
      </div>
      {st.note && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>{st.note}</div>}
      <style>{'@keyframes sf-spin{to{transform:rotate(360deg)}}'}</style>
    </>, st.mood || 'listening', () => setTour(null), spot);
  }
  if (menu) return card(<>
    <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-main)', marginBottom: 2 }}>What do you need help with?</div>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Pick one. I will show you each step, one at a time.</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {guides.filter(g => g.enabled !== false).map(g => (
        <button key={g.id} onClick={() => { setMenu(false); setTour({ id: g.id, idx: Math.max(0, g.tourOnly ? 0 : nextIdx(g)) }); }}
          style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 12, border: '1px solid var(--glass-border, #e2e8f0)', background: 'rgba(79,70,229,0.06)', cursor: 'pointer', color: 'var(--text-main)' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{g.label || g.id}</div>
          {g.hint && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{g.hint}</div>}
        </button>
      ))}
    </div></>, 'listening', () => setMenu(false));

  if (true) return createPortal(launcher, document.body); // only the ? button; the guide opens when it is pressed
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
  </>, st.mood || 'listening', skip, spot);
};
