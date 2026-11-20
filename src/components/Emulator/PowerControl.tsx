import React, { useState } from 'react';
import { Power, Download, Loader2, Square } from 'lucide-react';
import type { EmulatorApi } from './useEmulator';

const WINDOW_KEY = 'sf_emu_show_window';
export const getShowWindow = (): boolean => { try { return localStorage.getItem(WINDOW_KEY) === '1'; } catch (e) { return false; } };
const setShowWindowPref = (v: boolean) => { try { localStorage.setItem(WINDOW_KEY, v ? '1' : '0'); } catch (e) {} };

// Start with the user's window preference (default: no separate window, the phone is shown inside StreamFusion).
export const startEmulator = (emu: EmulatorApi) => emu.start({ headless: !getShowWindow() });

const spin = <style>{'@keyframes sf-spin{to{transform:rotate(360deg)}}.sf-spin{animation:sf-spin 1s linear infinite}'}</style>;

interface Props {
  emu: EmulatorApi;
  dark?: boolean;      // rendered on a dark surface (phone frame)
  onStarted?: () => void;
}

export const PowerPanel: React.FC<Props> = ({ emu, dark, onStarted }) => {
  const { status, phase, busy } = emu;
  const [showWin, setShowWin] = useState(getShowWindow());
  const fg = dark ? '#e2e8f0' : 'var(--text-main, #0f172a)';
  const muted = dark ? '#94a3b8' : 'var(--text-muted, #64748b)';

  const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', color: fg, padding: 16 };
  const bigBtn = (bg: string): React.CSSProperties => ({
    width: 76, height: 76, borderRadius: '50%', border: 'none', cursor: busy ? 'wait' : 'pointer', background: bg, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(79,70,229,0.45)'
  });

  if (phase === 'not_installed') return (
    <div style={wrap}>
      <Download size={30} color={muted} />
      <div style={{ fontWeight: 800, fontSize: 15 }}>Emulator not installed</div>
      <div style={{ fontSize: 12, color: muted, maxWidth: 240, lineHeight: 1.5 }}>One-time download (about 5.4 GB on disk). It is not bundled with the app.</div>
      {status.installError && <div style={{ fontSize: 12, color: '#ef4444', maxWidth: 260 }}>{status.installError}</div>}
      <button data-guide="emu-install" onClick={() => emu.start()} disabled={busy} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Install emulator</button>
    </div>
  );

  if (phase === 'installing') return (
    <div style={{ ...wrap, width: '100%' }}>{spin}
      <Loader2 size={28} className="sf-spin" color="#818cf8" />
      <div style={{ fontWeight: 800, fontSize: 14 }}>Installing… {status.installProgress}%</div>
      <div style={{ width: '80%', maxWidth: 260, height: 6, borderRadius: 4, background: dark ? '#1e293b' : '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${status.installProgress}%`, height: '100%', background: '#4f46e5', transition: 'width .4s' }} />
      </div>
      <div style={{ fontSize: 11.5, color: muted, maxWidth: 260 }}>{status.installStage}</div>
    </div>
  );

  if (phase === 'booting') return (
    <div style={wrap}>{spin}
      <Loader2 size={34} className="sf-spin" color="#818cf8" />
      <div style={{ fontWeight: 800, fontSize: 15 }}>{status.bootMode === 'quick' ? 'Resuming Android…' : 'Starting Android…'}</div>
      <div style={{ fontSize: 12, color: muted, maxWidth: 250, lineHeight: 1.5 }}>
        {status.bootMode === 'quick'
          ? 'Resuming the saved state. This usually takes under a minute.'
          : 'First start: Android is preparing itself and can take several minutes. Later starts resume a saved state and are much faster. Please power off from here (not by closing the app) so the state is saved.'}
      </div>
      <button onClick={() => emu.stop()} style={{ background: 'none', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: fg, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
    </div>
  );

  if (phase === 'saving') return (
    <div style={wrap}>{spin}
      <Loader2 size={30} className="sf-spin" color="#818cf8" />
      <div style={{ fontWeight: 800, fontSize: 15 }}>Saving your apps and data…</div>
      <div style={{ fontSize: 12, color: muted, maxWidth: 240, lineHeight: 1.5 }}>Installed apps stay on the phone. The next start resumes from here.</div>
    </div>
  );

  if (phase === 'running') return (
    <div style={wrap}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#22c55e' }}>● Running</div>
      <button onClick={() => emu.stop()} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><Square size={13} /> Power off</button>
    </div>
  );

  // stopped
  return (
    <div style={wrap}>
      <button data-guide="emu-power" onClick={async () => { const ok = await startEmulator(emu); if (ok) onStarted?.(); }} disabled={busy || !emu.reachable} style={bigBtn('linear-gradient(135deg,#6366f1,#4f46e5)')} title="Power on the emulator">
        <Power size={32} />
      </button>
      <div style={{ fontWeight: 800, fontSize: 15 }}>Power on</div>
      <div style={{ fontSize: 12, color: muted }}>{emu.reachable ? 'Android 14 virtual phone' : 'StreamFusion server is not reachable'}</div>
      <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: muted, cursor: 'pointer', width: 'auto' }}>
        <input type="checkbox" style={{ width: 'auto', margin: 0, flex: '0 0 auto' }} checked={showWin} onChange={e => { setShowWin(e.target.checked); setShowWindowPref(e.target.checked); }} />
        <span style={{ whiteSpace: 'nowrap' }}>Also show emulator window</span>
      </label>
    </div>
  );
};
