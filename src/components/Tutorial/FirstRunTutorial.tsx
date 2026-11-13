import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Check, Download, KeyRound, Loader2, X } from 'lucide-react';
import { Mascot, type MascotMood } from './Mascot';
import { loadKey, saveKey } from '../Emulator/secrets';

export const TUTORIAL_KEY = 'sf_tutorial_done';
export const SAMPLE_URL = 'https://avatars.bible-strong.app';
const SAMPLE_TEST = `Sample test: Avatar Lab (a public demo site)
Open ${SAMPLE_URL} and run these checks:
TC-01: The page loads and shows the heading "Avatars" with a list of avatars. Expected: at least 5 avatars are listed.
TC-02: Click the avatar "Nova". Expected: Nova becomes the selected avatar.
TC-03: Open the "Expressions" tab. Expected: a list of expressions is visible.
TC-04: Open the "Export" tab. Expected: export options are visible.
Tip: the avatar animates all the time, so pause the animation before taking screenshots.`;

const muted: React.CSSProperties = { fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65 };
const stateBox = (ok: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
  background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', color: ok ? '#15803d' : '#b45309', border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`
});

interface Props { onClose: () => void; onGoto: (tab: 'devices' | 'emulator' | 'web' | 'settings' | 'guide') => void; }

export const FirstRunTutorial: React.FC<Props> = ({ onClose, onGoto }) => {
  const [i, setI] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [draft, setDraft] = useState('');
  const [web, setWeb] = useState<any>(null);

  useEffect(() => { loadKey().then(k => setHasKey(!!k)); }, []);
  useEffect(() => {
    let stop = false;
    const tick = async () => { try { const j = await (await fetch('/api/web/status')).json(); if (!stop) setWeb(j); } catch (e) {} if (!stop) setTimeout(tick, 1500); };
    tick();
    return () => { stop = true; };
  }, []);

  const finish = () => { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {} onClose(); };
  const go = (tab: Parameters<Props['onGoto']>[0]) => { finish(); onGoto(tab); };

  const runSample = () => {
    finish();
    onGoto('web');
    setTimeout(() => window.dispatchEvent(new CustomEvent('sf-prefill-chat', { detail: { world: 'web', text: SAMPLE_TEST, testMode: true } })), 600);
  };

  const steps: { mood: MascotMood; title: string; body: React.ReactNode }[] = [
    {
      mood: 'happy', title: 'Hi, welcome to StreamFusion!',
      body: (<>
        <p style={muted}>I will show you around in about a minute. StreamFusion does three things:</p>
        <ul style={{ ...muted, paddingLeft: 20, margin: '8px 0 0' }}>
          <li><b>Screen Mirror</b>: show and control your real Android phone on this PC.</li>
          <li><b>Android Emulator</b>: a virtual phone you can test apps on, with an AI agent.</li>
          <li><b>Web Testing</b>: a real browser the AI can drive to test websites, with PDF reports.</li>
        </ul>
      </>)
    },
    {
      mood: 'listening', title: 'Mirror your real phone',
      body: (<>
        <ol style={{ ...muted, paddingLeft: 20, margin: 0 }}>
          <li>On the phone, turn on <b>Developer options → USB debugging</b>.</li>
          <li>Plug it in with a USB cable and tap <b>Allow</b> on the phone.</li>
          <li>Open <b>Screen Mirror</b> and press <b>Scan for Phone</b>.</li>
        </ol>
        <p style={{ ...muted, marginTop: 10 }}>Wi-Fi mirroring and recording are covered in the User Guide.</p>
        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => go('devices')}>Open Screen Mirror</button>
      </>)
    },
    {
      mood: 'thinking', title: 'Connect the AI (optional)',
      body: (<>
        <p style={muted}>The AI agent can run three ways. Mirroring and the manual emulator work without any of them.</p>
        <ol style={{ ...muted, paddingLeft: 20, margin: '6px 0' }}>
          <li><b>Sign in with Claude</b>: easiest. Uses Claude Code on this PC, no API key.</li>
          <li><b>API key</b>: pay-per-use key from console.anthropic.com.</li>
          <li><b>Connect Claude Code (MCP)</b>: control StreamFusion from your own terminal.</li>
        </ol>
        <div style={{ ...stateBox(hasKey), margin: '8px 0' }}>{hasKey ? <><Check size={14} /> API key saved</> : <><KeyRound size={14} /> Not connected yet</>}</div>
        <button className="btn-secondary" onClick={() => go('settings')}>Open Settings → AI &amp; API</button>
        <p style={{ ...muted, fontSize: 12, marginTop: 8 }}>The chat also has a Connect button any time.</p>
      </>)
    },
    {
      mood: 'working', title: 'Check the web browser',
      body: (<>
        <p style={muted}>Web Testing drives your own Google Chrome (or Edge) in its own window, so you can log in yourself. If neither is installed, StreamFusion downloads Chrome for you.</p>
        <div style={{ margin: '10px 0' }}>
          {!web ? <div style={stateBox(false)}><Loader2 size={14} /> Checking…</div>
            : web.installed ? <div style={stateBox(true)}><Check size={14} /> {web.browser} found, nothing to install</div>
            : web.isInstalling ? <div style={stateBox(false)}><Loader2 size={14} /> {web.stage || 'Installing…'}</div>
            : <button className="btn-primary" onClick={() => fetch('/api/web/install', { method: 'POST' })}><Download size={14} /> Install Chrome</button>}
        </div>
        {web?.error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{web.error}</div>}
        <p style={{ ...muted, fontSize: 12 }}>The Android emulator (about 5.4 GB) is installed later from its own page, only if you need it.</p>
      </>)
    },
    {
      mood: 'celebrate', title: 'Run your first test',
      body: (<>
        <p style={muted}>Let me try a ready-made example on a public demo site, <b>Avatar Lab</b> ({SAMPLE_URL.replace('https://', '')}). I will open Web Testing with 4 test cases already typed in, and Test mode on. Press Send and you will get a PDF/DOCX report with screenshots.</p>
        {(!hasKey || !web?.installed) && <div style={{ ...stateBox(false), margin: '10px 0' }}>{!hasKey ? 'Add the API key (previous step) ' : ''}{!hasKey && !web?.installed ? 'and ' : ''}{!web?.installed ? 'install Chrome ' : ''}first, then send.</div>}
        <button className="btn-primary" style={{ marginTop: 6 }} onClick={runSample}>Try the sample test <ArrowRight size={14} /></button>
      </>)
    },
    {
      mood: 'proud', title: 'You are all set',
      body: (<>
        <ul style={{ ...muted, paddingLeft: 20, margin: 0 }}>
          <li><b>Android Emulator</b> page: install it once, then power on and let the AI test your app.</li>
          <li><b>User Guide</b>: step-by-step help for everything, including writing good test cases.</li>
          <li><b>Settings</b>: AI key, emulator RAM, web options and light or dark theme.</li>
        </ul>
        <p style={{ ...muted, marginTop: 10 }}>You can replay this tour anytime from <b>About</b>.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn-secondary" onClick={() => go('guide')}>Open User Guide</button>
        </div>
      </>)
    }
  ];

  const s = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="mac-glass-modal" style={{ width: 600, maxWidth: '94vw', padding: 28 }} role="dialog" aria-label="Getting started">
        <button onClick={finish} title="Skip tutorial" style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <Mascot mood={s.mood} size={96} />
          <div style={{ flex: 1, minWidth: 0, minHeight: 230 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6366f1', letterSpacing: '0.05em', marginBottom: 4 }}>STEP {i + 1} OF {steps.length}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)', marginBottom: 10 }}>{s.title}</div>
            {s.body}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {steps.map((_, k) => <span key={k} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, background: k === i ? '#4f46e5' : 'rgba(100,116,139,0.35)', transition: 'all .25s' }} />)}
          </div>
          {!last && <button className="btn-secondary" onClick={finish}>Skip</button>}
          {i > 0 && <button className="btn-secondary" onClick={() => setI(i - 1)}><ArrowLeft size={14} /> Back</button>}
          {!last ? <button className="btn-primary" onClick={() => setI(i + 1)}>Next <ArrowRight size={14} /></button> : <button className="btn-primary" onClick={finish}><Check size={14} /> Finish</button>}
        </div>
      </div>
    </div>
  );
};
