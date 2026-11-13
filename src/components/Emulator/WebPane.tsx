import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Globe, X, Download, Loader2 } from 'lucide-react';

const border = '1px solid var(--glass-border, #e2e8f0)';
const post = (path: string, body?: any) => fetch('/api/web/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const tool = async (name: string, args: any = {}) => { try { return await (await post('tool/' + name, args)).json(); } catch (e) { return { ok: false }; } };

const SPECIAL: Record<string, string> = { Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };

// Live view of the Playwright browser: polls screenshots, click/scroll/type are forwarded to the page.
export const WebPane: React.FC<{ active: boolean; serial: string; busy: boolean }> = ({ active, serial, busy }) => {
  const [status, setStatus] = useState<any>(null);
  const [shot, setShot] = useState('');
  const [vp, setVp] = useState({ w: 1280, h: 800 });
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [devices, setDevices] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/web/status')).json(); if (!stop) setStatus(j); } catch (e) {} if (!stop) setTimeout(tick, 1500); };
    tick();
    fetch('/api/web/devices').then(r => r.json()).then(j => !stop && setDevices(j.devices || [])).catch(() => {});
    return () => { stop = true; };
  }, [active]);

  const open = !!status?.open;
  useEffect(() => {
    if (!active || !open) { setShot(''); return; }
    let stop = false; let last = '';
    (async () => {
      while (!stop) {
        const r = await tool('web_screenshot');
        if (r.ok) {
          const bin = atob(r.imageBase64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const u = URL.createObjectURL(new Blob([arr], { type: 'image/png' }));
          setShot(u); if (last) URL.revokeObjectURL(last); last = u;
          setVp({ w: r.imageWidth || 1280, h: r.imageHeight || 800 });
          setUrl(prev => (editing ? prev : r.url));
        }
        await new Promise(res => setTimeout(res, busy ? 800 : 1500));
      }
      if (last) URL.revokeObjectURL(last);
    })();
    return () => { stop = true; };
  }, [active, open, busy, editing]);

  const go = async () => { setErr(''); const r = await tool('web_navigate', { url: url.trim() || 'about:blank' }); if (!r.ok) setErr(r.error || 'Failed'); setEditing(false); };
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
      <div style={{ marginTop: 8 }}>{status.stage || 'Installing Chromium…'}</div>
    </div>
  );
  if (!status.installed) return (
    <div style={{ margin: 'auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 320 }}>
      <Globe size={32} color="var(--text-muted)" />
      <div style={{ fontWeight: 800, fontSize: 15 }}>Web testing needs Chromium</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>One-time download of about 150 MB. It is not bundled with the app.</div>
      {status.error && <div style={{ fontSize: 12, color: '#ef4444' }}>{status.error}</div>}
      <button onClick={() => post('install')} style={{ ...btn, background: '#4f46e5', color: '#fff', border: 'none', padding: '9px 18px', fontWeight: 700, fontSize: 13 }}><Download size={14} /> Install Chromium</button>
    </div>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn} disabled={!open} onClick={() => tool('web_history', { action: 'back' })} title="Back"><ArrowLeft size={14} /></button>
        <button style={btn} disabled={!open} onClick={() => tool('web_history', { action: 'forward' })} title="Forward"><ArrowRight size={14} /></button>
        <button style={btn} disabled={!open} onClick={() => tool('web_history', { action: 'reload' })} title="Reload"><RotateCw size={14} /></button>
        <input value={url} placeholder="Enter a URL and press Enter" onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
          onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }}
          style={{ flex: 1, minWidth: 160, padding: '6px 12px', borderRadius: 999, border, fontSize: 12.5, background: 'var(--glass-soft, #f1f5f9)', color: 'var(--text-main)', outline: 'none' }} />
        <select value={status.device || ''} onChange={e => post('config', { device: e.target.value })} style={{ ...btn, width: 'auto' }} title="Device emulation">
          <option value="">Desktop</option>
          {devices.filter(d => /Pixel|iPhone|iPad|Galaxy/.test(d)).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {open && <button style={btn} onClick={() => post('close')} title="Close browser"><X size={14} /></button>}
      </div>
      {err && <div style={{ fontSize: 12, color: '#b91c1c' }}>{err}</div>}
      <div tabIndex={0} onKeyDown={onKey} style={{ flex: 1, minHeight: 0, border, borderRadius: 14, overflow: 'hidden', background: 'rgba(15,23,42,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}
        onWheel={e => { if (open) tool('web_eval', { expression: `window.scrollBy(0, ${Math.round(e.deltaY)})` }); }}>
        {shot
          ? <img ref={imgRef} src={shot} onClick={onClick} draggable={false} alt="Browser" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: 'pointer' }} />
          : <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <Globe size={28} />
              <div>{open ? 'Loading…' : 'Browser is closed'}</div>
              {!open && <button style={{ ...btn, background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', fontWeight: 700 }} onClick={() => tool('web_navigate', { url: 'about:blank' })}>Open browser</button>}
            </div>}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Click, scroll and type here to control the page. The agent uses the same browser.</div>
    </div>
  );
};
