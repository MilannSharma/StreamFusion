import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Globe, X, Download, Loader2 } from 'lucide-react';

const border = '1px solid var(--glass-border, #e2e8f0)';
const post = (path: string, body?: any) => fetch('/api/web/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const tool = async (name: string, args: any = {}) => { try { return await (await post('tool/' + name, args)).json(); } catch (e) { return { ok: false }; } };

const SPECIAL: Record<string, string> = { Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };

// Live view of the user's own Chrome (attached over CDP): polls screenshots, click/scroll/type are forwarded to the page.
export const WebPane: React.FC<{ active: boolean; serial: string; busy: boolean }> = ({ active, serial, busy }) => {
  const [status, setStatus] = useState<any>(null);
  const [shot, setShot] = useState('');
  const [vp, setVp] = useState({ w: 1280, h: 800 });
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false); const busyRef = useRef(busy);
  editingRef.current = editing; busyRef.current = busy;
  const [err, setErr] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/web/status')).json(); if (!stop) setStatus(j); } catch (e) {} if (!stop) setTimeout(tick, 1500); };
    tick();
    return () => { stop = true; };
  }, [active]);

  const open = !!status?.open;
  // A freshly opened browser starts on Google instead of a blank page
  const homed = useRef(false);
  useEffect(() => { if (!open) homed.current = false; else if (url === 'about:blank' && !homed.current && !editing) { homed.current = true; tool('web_navigate', { url: 'https://www.google.com' }); } }, [open, url, editing]);
  useEffect(() => {
    if (!active || !open) { setShot(''); return; }
    let stop = false; let last = ''; let lastB64 = '';
    (async () => {
      while (!stop) {
        const r = await tool('web_screenshot');
        if (stop) break;
        if (r.ok) {
          if (r.imageBase64 !== lastB64) { // unchanged page: keep the current image, no re-render
            lastB64 = r.imageBase64;
            const bin = atob(r.imageBase64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const u = URL.createObjectURL(new Blob([arr], { type: 'image/png' }));
            try { const im = new Image(); im.src = u; await im.decode(); } catch (e) {} // decode first so the swap is instant (no flash)
            if (stop) { URL.revokeObjectURL(u); break; }
            setShot(u); if (last) URL.revokeObjectURL(last); last = u;
            if (r.imageWidth) setVp(v => (v.w === r.imageWidth && v.h === r.imageHeight ? v : { w: r.imageWidth, h: r.imageHeight }));
          }
          if (!editingRef.current) setUrl(r.url);
        }
        await new Promise(res => setTimeout(res, busyRef.current ? 900 : 1500));
      }
      if (last) URL.revokeObjectURL(last);
    })();
    return () => { stop = true; };
  }, [active, open]);

  const go = async () => { setErr(''); inputRef.current?.blur(); const r = await tool('web_navigate', { url: url.trim() }); if (!r.ok) setErr(r.error || 'Could not open that address'); };
  const onClick = (e: React.MouseEvent<HTMLImageElement>) => {
    // the image is letterboxed (object-fit: contain), so map through the drawn area
    const r = e.currentTarget.getBoundingClientRect();
    const sc = Math.min(r.width / vp.w, r.height / vp.h);
    const ox = (r.width - vp.w * sc) / 2, oy = (r.height - vp.h * sc) / 2;
    tool('web_click_at', { x: Math.round((e.clientX - r.left - ox) / sc), y: Math.round((e.clientY - r.top - oy) / sc) });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (editing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = SPECIAL[e.key] || (e.key.length === 1 ? e.key : '');
    if (k) { e.preventDefault(); tool('web_press', { key: k }); }
  };
  const btn: React.CSSProperties = { background: 'var(--glass-soft, #f8fafc)', border, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-main, #0f172a)', fontSize: 12 };

  if (!status) return <div style={{ margin: 'auto', color: 'var(--text-muted)' }}>Checking browser…</div>;

  if (status.isInstalling) return (
    <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      <Loader2 size={28} style={{ animation: 'sf-spin 1s linear infinite' }} /><style>{'@keyframes sf-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ marginTop: 8 }}>{status.stage || 'Installing Google Chrome…'}</div>
    </div>
  );
  if (!status.installed) return (
    <div style={{ margin: 'auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 320 }}>
      <Globe size={32} color="var(--text-muted)" />
      <div style={{ fontWeight: 800, fontSize: 15 }}>Web testing needs Google Chrome</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Chrome (or Edge) was not found on this PC. One-time download of the official Chrome installer; it installs just for you, no admin needed.</div>
      {status.error && <div style={{ fontSize: 12, color: '#ef4444' }}>{status.error}</div>}
      <button onClick={() => post('install')} style={{ ...btn, background: '#4f46e5', color: '#fff', border: 'none', padding: '9px 18px', fontWeight: 700, fontSize: 13 }}><Download size={14} /> Install Chrome</button>
    </div>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn} disabled={!open} onClick={() => tool('web_history', { action: 'back' })} title="Back"><ArrowLeft size={14} /></button>
        <button style={btn} disabled={!open} onClick={() => tool('web_history', { action: 'forward' })} title="Forward"><ArrowRight size={14} /></button>
        <button style={btn} disabled={!open} onClick={() => tool('web_history', { action: 'reload' })} title="Reload"><RotateCw size={14} /></button>
        <input ref={inputRef} value={url} placeholder="Search or enter a URL" onFocus={e => { setEditing(true); e.currentTarget.select(); }} onBlur={() => setEditing(false)}
          onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }}
          style={{ flex: 1, minWidth: 160, padding: '6px 12px', borderRadius: 999, border, fontSize: 12.5, background: 'var(--glass-soft, #f1f5f9)', color: 'var(--text-main)', outline: 'none' }} />
        {open && <button style={btn} onClick={() => post('close')} title="Disconnect (your Chrome window stays open)"><X size={14} /></button>}
      </div>
      {err && <div style={{ fontSize: 12, color: '#b91c1c' }}>{err}</div>}
      <div tabIndex={0} onKeyDown={onKey} style={{ flex: 1, minHeight: 0, border, borderRadius: 14, overflow: 'hidden', background: 'rgba(15,23,42,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}
        onWheel={e => { if (open) tool('web_eval', { expression: `window.scrollBy(0, ${Math.round(e.deltaY)})` }); }}>
        {shot
          ? <img ref={imgRef} src={shot} onClick={onClick} draggable={false} alt="Browser" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: 'pointer' }} />
          : <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <Globe size={28} />
              <div>{open ? 'Loading…' : 'Browser is closed'}</div>
              {!open && <button style={{ ...btn, background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', fontWeight: 700 }} onClick={async () => { setErr(''); const r = await tool('web_navigate', { url: 'https://www.google.com' }); if (!r.ok) setErr(r.error || 'Could not open Chrome'); }}>Open {status.browser === 'Microsoft Edge' ? 'Edge' : 'Chrome'}</button>}
              {!open && <div style={{ fontSize: 11.5, maxWidth: 260 }}>Opens your own {status.browser || 'Chrome'} in its own window. Log in or pass any check there yourself; the agent controls the same browser.</div>}
            </div>}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Preview of your Chrome window. You can also work in that window directly; the agent uses the same browser.</div>
    </div>
  );
};
