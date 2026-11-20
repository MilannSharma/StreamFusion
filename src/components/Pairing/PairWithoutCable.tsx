import React, { useEffect, useRef, useState } from 'react';
import { X, QrCode, KeyRound, RefreshCw, CheckCircle2, Wifi } from 'lucide-react';

// First connection with no USB cable (Android 11+): the phone's own Wireless debugging screen scans our QR code,
// or the user types the address + 6-digit code that screen shows. Nothing is installed on the phone.
interface Props { onClose: () => void; onConnected: () => void }

const INK = 'var(--text-main, #0f172a)', SUB = 'var(--text-muted, #64748b)', LINE = 'rgba(120,120,128,0.2)';
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${LINE}`, background: 'var(--bg-card, #fff)', color: INK, fontSize: 14, fontFamily: 'inherit' };
const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, color: INK }}>
    <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(79,70,229,0.12)', color: '#4f46e5', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</span>
    <div>{children}</div>
  </div>
);
const post = (url: string, body?: any) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());

export const PairWithoutCable: React.FC<Props> = ({ onClose, onConnected }) => {
  const [tab, setTab] = useState<'qr' | 'code'>('code');
  const [qr, setQr] = useState(''), [sid, setSid] = useState(''), [state, setState] = useState('waiting'), [msg, setMsg] = useState(''), [secs, setSecs] = useState(0);
  const [found, setFound] = useState<string[]>([]), [manual, setManual] = useState(false);
  const [address, setAddress] = useState(''), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [codeMsg, setCodeMsg] = useState('');
  const doneRef = useRef(false);

  const finish = () => { if (doneRef.current) return; doneRef.current = true; onConnected(); setTimeout(onClose, 1400); };
  const startQr = async () => {
    setQr(''); setState('waiting'); setMsg(''); setSecs(0);
    try { const j = await post('/api/wifi/qr/start'); if (j.success) { setQr(j.qr); setSid(j.id); } else { setState('error'); setMsg(j.message || 'Could not start'); } }
    catch (e: any) { setState('error'); setMsg(e.message); }
  };
  useEffect(() => { if (tab === 'qr') startQr(); else post('/api/wifi/qr/cancel').catch(() => {}); }, [tab]);
  useEffect(() => () => { post('/api/wifi/qr/cancel').catch(() => {}); }, []);
  useEffect(() => {
    if (tab !== 'qr' || !sid) return;
    const t = setInterval(async () => {
      try {
        const j = await (await fetch('/api/wifi/qr/status?id=' + sid)).json();
        setState(j.state); setMsg(j.message || ''); setSecs(j.seconds || 0);
        if (j.state === 'done') finish();
      } catch (e) {}
    }, 1500);
    return () => clearInterval(t);
  }, [tab, sid]);

  useEffect(() => { // the phone's pairing screen announces itself on the Wi-Fi: no need to type its address
    if (tab !== 'code') return;
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/wifi/pairing-services')).json(); if (!stop) setFound((j.phones || []).map((x: any) => x.address)); } catch (e) {} };
    tick(); const t = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(t); };
  }, [tab]);
  const pairCode = async () => {
    setBusy(true); setCodeMsg('Pairing…');
    try {
      const j = await post('/api/wifi/pair-code', { address: manual || !found.length ? address : found[0], code });
      if (j.success) { setCodeMsg('Connected'); finish(); } else setCodeMsg(j.message || 'Failed');
    } catch (e: any) { setCodeMsg(e.message); }
    setBusy(false);
  };

  const connected = state === 'done' || codeMsg === 'Connected';
  const tabBtn = (id: 'qr' | 'code', icon: React.ReactNode, label: string) => (
    <button onClick={() => setTab(id)} style={{ flex: 1, border: 'none', cursor: 'pointer', padding: '9px 6px', borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: tab === id ? 650 : 500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: tab === id ? '#4f46e5' : 'rgba(120,120,128,0.1)', color: tab === id ? '#fff' : SUB }}>{icon}{label}</button>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: 520, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wifi size={20} color="#2563eb" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Connect without a cable</div>
            <div style={{ fontSize: 11.5, color: SUB }}>Android 11 or newer · phone and PC on the same Wi-Fi · nothing to install on the phone</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {tabBtn('code', <KeyRound size={15} />, 'Pairing code (works on every phone)')}
          {tabBtn('qr', <QrCode size={15} />, 'Scan QR code')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
          <Step n={1}>One time only: <b>Settings → About phone</b>, tap <b>Build number</b> 7 times.</Step>
          <Step n={2}><b>Settings → Developer options → Wireless debugging</b>: switch it <b>on</b> (allow it on this Wi-Fi).</Step>
          {tab === 'qr'
            ? <Step n={3}>Tap <b>Wireless debugging</b>, then <b>Pair device with QR code</b>. Point <i>that</i> camera at the QR code below. <b>Google Lens or the normal camera will not work</b>, only this screen's own scanner.</Step>
            : <Step n={3}>Tap <b>Wireless debugging</b>, then <b>Pair device with pairing code</b>. A <b>6-digit code</b> appears on the phone. Keep that screen open and type the code below.</Step>}
        </div>

        {tab === 'qr' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 240, height: 240, borderRadius: 14, background: '#fff', border: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              {qr && !connected && state !== 'error' ? <img src={qr} alt="Pairing QR code" width={232} height={232} style={{ opacity: state === 'waiting' ? 1 : 0.25 }} /> : null}
              {connected && <CheckCircle2 size={72} color="#16a34a" />}
              {!qr && state !== 'error' && <RefreshCw size={22} className="pulse" color="#94a3b8" />}
              {(state === 'pairing' || state === 'connecting') && <div style={{ position: 'absolute', fontWeight: 700, color: '#4f46e5' }}>{state === 'pairing' ? 'Pairing…' : 'Connecting…'}</div>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: state === 'error' ? '#dc2626' : connected ? '#16a34a' : INK, textAlign: 'center' }}>
              {connected ? 'Connected. Your phone is now on Wi-Fi.' : msg || 'Waiting for the phone to scan…'}
            </div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 400, padding: '8px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.08)', color: '#dc2626', lineHeight: 1.5 }}>
              If your phone says <b>"Wi-Fi detected"</b> or <b>"Connect to this network"</b>, you used the normal camera. Do not tap that. Open <b>Settings → Developer options → Wireless debugging → Pair device with QR code</b> and scan from there.
            </div>
            {state === 'waiting' && secs > 25 && <div style={{ fontSize: 12, color: SUB, textAlign: 'center', maxWidth: 400 }}>Still waiting. Check that Wireless debugging is on, the phone is on the same Wi-Fi as this PC (not a guest network), and that you scan from the <b>Pair device with QR code</b> screen.</div>}
            {(state === 'error' || state === 'cancelled' || secs > 25) && !connected && <button className="btn-secondary" onClick={startQr} style={{ padding: '7px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} /> New QR code</button>}
            <button onClick={() => setTab('code')} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>No "Pair device with QR code" on your phone? Use the pairing code instead</button>
          </div>
        )}

        {tab === 'code' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, color: found.length && !manual ? '#16a34a' : SUB }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: found.length ? '#22c55e' : '#f59e0b', animation: found.length ? 'none' : 'sfBlink 1.2s ease-in-out infinite' }} />
              <style>{'@keyframes sfBlink{50%{opacity:.3}}'}</style>
              {found.length ? <span>Phone found on this Wi-Fi ({found[0]})</span> : <span>Looking for your phone… keep the pairing-code screen open on it</span>}
              <button onClick={() => setManual(m => !m)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>{manual ? 'Auto' : 'Type address'}</button>
            </div>
            {(manual || !found.length) && manual && <input style={field} value={address} onChange={e => setAddress(e.target.value)} placeholder="Address shown on the phone, e.g. 192.168.1.5:37123" inputMode="decimal" />}
            <input style={{ ...field, letterSpacing: 4, fontWeight: 600 }} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) pairCode(); }} />
            <button className="btn-primary" disabled={busy || code.length !== 6 || (manual && !address.trim())} onClick={pairCode} style={{ padding: '10px 16px', fontSize: 13.5 }}>{busy ? 'Pairing…' : 'Pair and connect'}</button>
            {codeMsg && <div style={{ fontSize: 13, fontWeight: 600, color: codeMsg === 'Connected' ? '#16a34a' : codeMsg === 'Pairing…' ? SUB : '#dc2626' }}>{codeMsg === 'Connected' ? 'Connected. Your phone is now on Wi-Fi.' : codeMsg}</div>}
            <div style={{ fontSize: 12, color: SUB }}>The address and code change every time the pairing screen opens. If it fails, close that screen on the phone, open it again and use the new ones.</div>
          </div>
        )}

        <div style={{ fontSize: 11.5, color: SUB, marginTop: 14, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          The phone is remembered after this, so next time it reconnects by itself on the same Wi-Fi. Wireless debugging stops when the phone leaves this Wi-Fi.
        </div>
      </div>
    </div>
  );
};
