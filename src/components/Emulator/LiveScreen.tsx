import React, { useEffect, useRef } from 'react';

// Live phone screen: H.264 from the phone (adb screenrecord) decoded in the browser with WebCodecs.
// About 30 fps and ~100 ms behind, unlike screenshot polling (one grab takes about 3 s on many phones).
// Calls onFail() when WebCodecs / the stream is unavailable so the caller can fall back to screenshots.
export const canLiveStream = () => typeof (window as any).VideoDecoder !== 'undefined';

const hex = (n: number) => n.toString(16).padStart(2, '0');
const concat = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

interface Props {
  serial: string; w: number; h: number; paused?: boolean;
  onPlaying: () => void; onFail: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void; onPointerUp?: (e: React.PointerEvent<HTMLElement>) => void;
}

export const LiveScreen: React.FC<Props> = ({ serial, w, h, paused, onPlaying, onFail, canvasRef, style, onPointerDown, onPointerUp }) => {
  const cb = useRef({ onPlaying, onFail }); cb.current = { onPlaying, onFail };
  useEffect(() => {
    if (paused || !canLiveStream()) { if (!canLiveStream()) cb.current.onFail(); return; }
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return cb.current.onFail();
    const ac = new AbortController();
    let stopped = false, shown = false, fails = 0;
    const s = Math.min(1, 1280 / Math.max(w, h));
    const sw = Math.max(16, Math.round((w * s) / 2) * 2), sh = Math.max(16, Math.round((h * s) / 2) * 2);

    // no picture within 6 s (slow phone, screen that never changes, decoder not happy): give up and let the screenshot view take over
    const watchdog = setTimeout(() => { if (!shown && !stopped) { stopped = true; ac.abort(); cb.current.onFail(); } }, 6000);
    const run = async () => {
      while (!stopped) {
        let got = 0;
        const dec: { d: VideoDecoder | null } = { d: null };
        try {
          const r = await fetch(`/api/device/stream.h264?serial=${encodeURIComponent(serial)}&w=${sw}&h=${sh}&mbps=4`, { signal: ac.signal });
          if (!r.ok || !r.body) throw new Error('stream ' + r.status);
          const reader = r.body.getReader();
          let buf = new Uint8Array(0), sps: Uint8Array | null = null, pps: Uint8Array | null = null, ts = 0, needKey = true;
          const VD = (window as any).VideoDecoder, EVC = (window as any).EncodedVideoChunk;
          const feed = (nal: Uint8Array) => { // nal includes its start code
            const sc = nal[2] === 1 ? 3 : 4, type = nal[sc] & 31;
            if (type === 7) { sps = nal; return; }
            if (type === 8) { pps = nal; return; }
            if (type !== 5 && type !== 1) return;
            if (!dec.d) {
              if (!sps || type !== 5) return;
              const codec = `avc1.${hex(sps[sc + 1])}${hex(sps[sc + 2])}${hex(sps[sc + 3])}`;
              dec.d = new VD({
                output: (f: VideoFrame) => {
                  if (canvas.width !== f.displayWidth || canvas.height !== f.displayHeight) { canvas.width = f.displayWidth; canvas.height = f.displayHeight; }
                  ctx.drawImage(f, 0, 0); f.close();
                  if (!shown) { shown = true; cb.current.onPlaying(); }
                },
                error: () => { needKey = true; dec.d = null; }
              });
              dec.d!.configure({ codec, optimizeForLatency: true });
            }
            if (needKey && type !== 5) return;
            let data = nal;
            if (type === 5) { needKey = false; data = concat(concat(sps || new Uint8Array(0), pps || new Uint8Array(0)), nal); }
            if (dec.d!.decodeQueueSize > 8 && type !== 5) return; // drop late delta frames instead of lagging
            dec.d!.decode(new EVC({ type: type === 5 ? 'key' : 'delta', timestamp: (ts += 33333), data }));
          };
          let tm: any = 0;
          for (;;) {
            const { value, done } = await reader.read();
            clearTimeout(tm);
            if (done) break;
            got += value.length;
            buf = concat(buf, value);
            // split on start codes; keep the last (possibly partial) NAL in the buffer
            const starts: number[] = [];
            for (let i = 0; i + 3 < buf.length; i++) if (buf[i] === 0 && buf[i + 1] === 0 && (buf[i + 2] === 1 || (buf[i + 2] === 0 && buf[i + 3] === 1))) { starts.push(i); i += buf[i + 2] === 1 ? 2 : 3; }
            for (let k = 0; k + 1 < starts.length; k++) feed(buf.subarray(starts[k], starts[k + 1]));
            if (starts.length) buf = buf.slice(starts[starts.length - 1]);
            // screenrecord sends nothing while the screen is still, so the last NAL would never complete: flush it after a short pause
            tm = setTimeout(() => { if (buf.length > 5 && !stopped) { try { feed(buf); } catch (e) {} buf = new Uint8Array(0); } }, 30);
          }
          clearTimeout(tm);
        } catch (e) { if (stopped) break; }
        try { dec.d?.close(); } catch (e) {}
        if (stopped) break;
        if (!got) { if (++fails >= 2) { cb.current.onFail(); return; } await new Promise(r => setTimeout(r, 800)); } else fails = 0; // got data: the 3-minute limit ended it, reconnect
      }
    };
    run();
    return () => { stopped = true; clearTimeout(watchdog); ac.abort(); };
  }, [serial, w, h, paused, canvasRef]);

  return <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', touchAction: 'none', userSelect: 'none', cursor: 'pointer', ...style }} />;
};
