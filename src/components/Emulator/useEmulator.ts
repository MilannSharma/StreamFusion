import { useCallback, useEffect, useRef, useState } from 'react';

export type EmulatorPhase = 'not_installed' | 'installing' | 'stopped' | 'booting' | 'running' | 'saving';

export interface EmulatorStatus {
  installed: boolean;
  isInstalling: boolean;
  installProgress: number;
  installStage: string;
  installError: string | null;
  isRunning: boolean;
  booting: boolean;
  booted: boolean;
  saving: boolean;
  headless: boolean;
  bootMode: 'quick' | 'cold';
  fastBoot: boolean;
  adbConnected: boolean;
  serial: string;
}

const EMPTY: EmulatorStatus = {
  installed: false, isInstalling: false, installProgress: 0, installStage: '', installError: null,
  isRunning: false, booting: false, booted: false, saving: false, headless: false, bootMode: 'cold', fastBoot: false, adbConnected: false, serial: 'emulator-5554'
};

export function phaseOf(s: EmulatorStatus): EmulatorPhase {
  if (s.saving) return 'saving';
  if (s.isInstalling) return 'installing';
  if (!s.installed) return 'not_installed';
  if (s.adbConnected && s.booted) return 'running';
  if (s.isRunning || s.booting) return 'booting';
  return 'stopped';
}

// Single source of truth for the emulator, shared by every screen that needs a power button.
export function useEmulator(onError?: (msg: string) => void) {
  const [status, setStatus] = useState<EmulatorStatus>(EMPTY);
  const [reachable, setReachable] = useState(true);
  const [busy, setBusy] = useState(false); // a start/stop request is in flight
  const timer = useRef<any>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const j = await (await fetch('/api/emulator/status')).json();
      if (!alive.current) return;
      setStatus({ ...EMPTY, ...j });
      setReachable(true);
    } catch (e) { if (alive.current) setReachable(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    const tick = async () => { await refresh(); if (alive.current) timer.current = setTimeout(tick, 1500); };
    tick();
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, [refresh]);

  const post = useCallback(async (path: string, body?: any) => {
    setBusy(true);
    try {
      const r = await fetch('/api/emulator/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const j = await r.json();
      if (!j.success) onError?.(j.message || 'Request failed');
      await refresh();
      return !!j.success;
    } catch (e: any) { onError?.(e.message); return false; }
    finally { setBusy(false); }
  }, [refresh, onError]);

  const install = useCallback(() => post('install'), [post]);
  const start = useCallback((opts?: { headless?: boolean }) => post('start', { headless: !!opts?.headless }), [post]);
  const stop = useCallback(() => post('stop'), [post]);
  const reset = useCallback(() => post('reset'), [post]);

  return { status, phase: phaseOf(status), reachable, busy, refresh, install, start, stop, reset };
}

export type EmulatorApi = ReturnType<typeof useEmulator>;
