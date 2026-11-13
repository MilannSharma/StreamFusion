import React, { useEffect, useState } from 'react';

interface Cfg { ramMB: number; cores: number; heapMB: number }

const FIELDS: { key: keyof Cfg; label: string; min: number; max: number; step: number; unit: string; hint: string }[] = [
  { key: 'ramMB', label: 'RAM', min: 1024, max: 8192, step: 256, unit: 'MB', hint: 'Lower = lighter on your PC, but Android may freeze (ANR) with big apps. 2048 is the minimum we recommend.' },
  { key: 'cores', label: 'CPU cores', min: 1, max: 16, step: 1, unit: 'cores', hint: 'Fewer cores = less load on the PC.' },
  { key: 'heapMB', label: 'App heap', min: 128, max: 1024, step: 64, unit: 'MB', hint: 'Per-app memory limit inside Android. Raise it if big apps crash.' }
];

export const ResourcesCard: React.FC = () => {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [defaults, setDefaults] = useState<Cfg | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch('/api/emulator/config').then(r => r.json()).then(j => { setCfg(j.config); setDefaults(j.defaults); setRunning(!!j.running); }).catch(() => {});
  }, []);

  const save = async () => {
    if (!cfg) return;
    const j = await (await fetch('/api/emulator/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })).json();
    setCfg(j.config);
    setSaved(j.restartRequired ? 'Saved. Restart the emulator to apply.' : 'Saved. Applies on next start.');
    setTimeout(() => setSaved(''), 4000);
  };

  if (!cfg) return null;
  return (
    <div style={{ background: 'var(--bg-card, #f8fafc)', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', marginBottom: 4 }}>Emulator resources</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Tune how much of your PC the emulator may use. Changes apply the next time it starts{running ? ' (it is running now)' : ''}.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {FIELDS.map(f => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }} title={f.hint}>
            <span style={{ fontWeight: 700 }}>{f.label} <span style={{ fontWeight: 400, color: '#64748b' }}>({cfg[f.key]} {f.unit})</span></span>
            <input type="range" min={f.min} max={f.max} step={f.step} value={cfg[f.key]} onChange={e => setCfg({ ...cfg, [f.key]: Number(e.target.value) })} />
            <span style={{ color: '#64748b', fontSize: 11 }}>{f.hint}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button onClick={save} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save</button>
        {defaults && <button onClick={() => setCfg(defaults)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>Reset to defaults</button>}
        {saved && <span style={{ fontSize: 12, color: '#16a34a' }}>{saved}</span>}
      </div>
    </div>
  );
};
