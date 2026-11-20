import React, { useEffect, useRef, useState } from 'react';
import { Wrench, CheckCircle2, AlertTriangle, XCircle, RefreshCw, MinusCircle, ChevronDown, ChevronRight } from 'lucide-react';

// Step by step troubleshooter: each check really runs on the server one after another (checking, hunting, processing…),
// every row ends as OK / warning / problem with what is wrong, and a fix button when one exists.
type Status = 'wait' | 'run' | 'ok' | 'warn' | 'fail' | 'skip';
interface Fix { id: string; label: string; serial?: string }
interface Row { id: string; title: string; doing: string; status: Status; detail: string; fixes: Fix[] }

const STEPS: { id: string; title: string; doing: string }[] = [
  { id: 'adb', title: 'ADB (the phone link)', doing: 'Checking ADB…' },
  { id: 'usb', title: 'USB drivers', doing: 'Hunting for USB driver problems…' },
  { id: 'devices', title: 'Your phone', doing: 'Looking for your phone…' },
  { id: 'network', title: 'Wi-Fi networks', doing: 'Comparing the PC and phone networks…' },
  { id: 'mdns', title: 'Network discovery', doing: 'Testing network discovery…' },
  { id: 'engine', title: 'Mirror engine', doing: 'Checking the mirror engine…' },
  { id: 'phone', title: 'Phone health', doing: 'Checking the phone…' }
];
const fresh = (): Row[] => STEPS.map(s => ({ ...s, status: 'wait', detail: '', fixes: [] }));
const COLOR: Record<string, string> = { ok: '#16a34a', warn: '#d97706', fail: '#dc2626', skip: '#94a3b8', run: '#4f46e5', wait: '#94a3b8' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const INK = 'var(--text-main, #0f172a)', SUB = 'var(--text-muted, #64748b)', LINE = 'rgba(120,120,128,0.2)';

interface Props { isOpen: boolean; onClose: () => void; onRefreshDevices: () => void; onToast: (msg: string, icon?: string) => void; onOpenPair?: () => void }

export const FixConnectionModal: React.FC<Props> = ({ isOpen, onClose, onRefreshDevices, onToast, onOpenPair }) => {
  const [rows, setRows] = useState<Row[]>(fresh);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'processing' | 'done' | 'fixing'>('idle');
  const [busyFix, setBusyFix] = useState('');
  const [tips, setTips] = useState(false);
  const runId = useRef(0);

  const patch = (id: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)));

  const runChecks = async () => {
    const my = ++runId.current;
    setRows(fresh()); setPhase('checking');
    for (const s of STEPS) {
      if (runId.current !== my) return;
      patch(s.id, { status: 'run' });
      const t0 = Date.now();
      let res: any = { status: 'warn', detail: 'The check did not answer.' };
      try { res = await (await fetch('/api/diagnostics/step/' + s.id)).json(); } catch (e: any) { res = { status: 'fail', detail: 'StreamFusion\'s background service did not answer (' + e.message + ').' }; }
      const left = 550 - (Date.now() - t0); if (left > 0) await sleep(left); // each step stays visible long enough to read
      if (runId.current !== my) return;
      patch(s.id, { status: (['ok', 'warn', 'fail', 'skip'].includes(res.status) ? res.status : 'warn') as Status, detail: res.detail || '', fixes: res.fixes || [] });
    }
    setPhase('processing'); await sleep(600);
    if (runId.current === my) setPhase('done');
  };

  useEffect(() => { if (isOpen) runChecks(); else { runId.current++; setPhase('idle'); } }, [isOpen]);

  const applyFix = async (f: Fix): Promise<boolean> => {
    if (f.id === 'pair') { onOpenPair?.(); return true; }
    const key = f.id + (f.serial || ''); setBusyFix(key);
    try {
      const j = await (await fetch('/api/diagnostics/fix/' + f.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial: f.serial }) })).json();
      if (!j.success && j.message) onToast(j.message, '⚠️');
      return !!j.success;
    } catch (e: any) { onToast('Fix failed: ' + e.message, '❌'); return false; }
    finally { setBusyFix(''); }
  };
  const fixOne = async (f: Fix) => { const ok = await applyFix(f); if (f.id !== 'pair' && f.id !== 'open_devmgr') { onRefreshDevices(); runChecks(); } else if (!ok) onToast('Could not do that', '⚠️'); };

  const allFixes = Array.from(new Map(rows.flatMap(r => r.fixes).filter(f => f.id !== 'pair' && f.id !== 'open_devmgr').map(f => [f.id + (f.serial || ''), f])).values());
  const fixAll = async () => {
    setPhase('fixing');
    for (const f of allFixes) await applyFix(f);
    onRefreshDevices(); await sleep(800); await runChecks();
  };

  const problems = rows.filter(r => r.status === 'fail').length, warns = rows.filter(r => r.status === 'warn').length;
  const running = rows.find(r => r.status === 'run');
  const headline = phase === 'fixing' ? 'Applying fixes…' : phase === 'processing' ? 'Processing the results…' : phase === 'checking' ? (running?.doing || 'Starting…') : '';
  const busy = phase === 'checking' || phase === 'processing' || phase === 'fixing';
  const done = rows.filter(r => r.status !== 'wait' && r.status !== 'run').length;

  if (!isOpen) return null;
  const icon = (s: Status) => s === 'run' ? <span className="fx-spin" style={{ width: 18, height: 18, border: '2.5px solid rgba(79,70,229,0.25)', borderTopColor: '#4f46e5', borderRadius: '50%', display: 'inline-block' }} />
    : s === 'ok' ? <CheckCircle2 className="fx-pop" size={19} color={COLOR.ok} /> : s === 'warn' ? <AlertTriangle className="fx-pop" size={19} color={COLOR.warn} /> : s === 'fail' ? <XCircle className="fx-pop" size={19} color={COLOR.fail} />
    : s === 'skip' ? <MinusCircle size={19} color={COLOR.skip} /> : <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(120,120,128,0.3)', display: 'inline-block', margin: '0 5px' }} />;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{`@keyframes fxSpin{to{transform:rotate(360deg)}}@keyframes fxPop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}@keyframes fxPulse{0%{transform:scale(.8);opacity:.55}100%{transform:scale(2.1);opacity:0}}@keyframes fxIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}.fx-spin{animation:fxSpin .8s linear infinite}.fx-pop{animation:fxPop .35s ease-out}`}</style>
      <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, maxHeight: '92vh', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)' }}>
        {/* header with a radar while it works */}
        <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(135deg,#1e293b,#0f172a)', color: '#fff' }}>
          <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
            {busy && [0, 0.6, 1.2].map(d => <span key={d} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(96,165,250,0.7)', animation: `fxPulse 1.8s ease-out ${d}s infinite` }} />)}
            <div style={{ position: 'absolute', inset: 4, borderRadius: 12, background: 'rgba(37,99,235,0.25)', border: '1px solid rgba(59,130,246,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wrench size={19} color="#60a5fa" /></div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Fix my connection</div>
            <div key={headline || phase} style={{ fontSize: 12.5, color: '#94a3b8', animation: 'fxIn .25s ease-out', minHeight: 18 }}>
              {busy ? headline : problems ? `${problems} problem${problems > 1 ? 's' : ''} found` : warns ? `${warns} thing${warns > 1 ? 's' : ''} to look at` : phase === 'done' ? 'Everything looks good' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        {/* progress */}
        <div style={{ height: 3, background: 'rgba(120,120,128,0.15)' }}><div style={{ height: '100%', width: `${Math.round(done / STEPS.length * 100)}%`, background: problems ? COLOR.fail : warns ? COLOR.warn : '#4f46e5', transition: 'width .4s ease' }} /></div>

        <div style={{ padding: '6px 20px 14px', overflowY: 'auto', flex: 1 }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: `1px solid ${LINE}`, opacity: r.status === 'wait' ? 0.45 : 1, transition: 'opacity .3s' }}>
              <div style={{ width: 22, display: 'flex', justifyContent: 'center', paddingTop: 1 }}>{icon(r.status)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 650, color: INK }}>{r.title}{r.status === 'run' && <span style={{ fontWeight: 400, color: SUB }}> · {r.doing}</span>}</div>
                {r.detail && <div key={r.detail} style={{ fontSize: 12.5, lineHeight: 1.5, color: r.status === 'ok' ? SUB : COLOR[r.status], marginTop: 2, animation: 'fxIn .3s ease-out' }}>{r.detail}</div>}
                {r.fixes.length > 0 && !busy && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {r.fixes.map(f => <button key={f.id + (f.serial || '')} className="btn-primary" disabled={!!busyFix} onClick={() => fixOne(f)} style={{ padding: '5px 12px', fontSize: 12 }}>{busyFix === f.id + (f.serial || '') ? 'Working…' : f.label}</button>)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {phase === 'done' && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, animation: 'fxIn .3s ease-out', background: problems ? 'rgba(220,38,38,0.1)' : warns ? 'rgba(217,119,6,0.1)' : 'rgba(22,163,74,0.1)', color: problems ? COLOR.fail : warns ? COLOR.warn : COLOR.ok, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 180 }}>{problems ? `${problems} problem${problems > 1 ? 's' : ''}${warns ? ` and ${warns} warning${warns > 1 ? 's' : ''}` : ''}: see the red rows.` : warns ? 'Nothing is broken, but check the yellow rows.' : 'No problems found. If something still fails, tell me what you see.'}</span>
              {allFixes.length > 1 && <button className="btn-primary" onClick={fixAll} style={{ padding: '6px 14px', fontSize: 12.5 }}>Fix all ({allFixes.length})</button>}
            </div>
          )}

          <button onClick={() => setTips(t => !t)} style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: SUB, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'inherit', padding: 0 }}>
            {tips ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Phone checklist (all brands)
          </button>
          {tips && <div style={{ fontSize: 12.5, color: SUB, lineHeight: 1.7, marginTop: 6 }}>
            1. Unlock the phone and tap <b>Allow</b> on the "Allow USB debugging?" box.<br />
            2. No box? Unplug, wait 2 seconds, plug into a <b>different USB port</b> (a back port is best).<br />
            3. <b>Developer options → USB debugging</b> must be on, and USB mode should be <b>File transfer</b>.<br />
            4. <b>Xiaomi / Redmi / POCO:</b> also turn on "USB debugging (Security settings)".<br />
            5. <b>Vivo / iQOO / Realme:</b> turn on OTG if the phone asks for it.<br />
            6. Wi-Fi: phone and PC must be on the <b>same network</b>, not a guest Wi-Fi.
          </div>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={runChecks} disabled={busy} className="btn-secondary" style={{ padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} className={busy ? 'fx-spin' : ''} /> Check again</button>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '7px 18px' }}>Close</button>
        </div>
      </div>
    </div>
  );
};
