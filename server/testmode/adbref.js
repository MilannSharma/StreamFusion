// The collectors (app log, APK scan, traffic capture) need adb without going through the AI tools. device/tools.js registers it here.
import { spawnSync } from 'child_process';

let ref = { runAdb: null, adbExe: 'adb.exe' };
export const setAdb = (r) => { ref = { ...ref, ...r }; };
export const adbExePath = () => ref.adbExe;

// Async: adb -s <serial> <args...>  ->  { success, output }
export async function adb(serial, args, timeout = 15000) {
  if (!ref.runAdb) return { success: false, output: 'adb is not available' };
  try { return await ref.runAdb(serial ? ['-s', serial, ...args] : args, timeout); } catch (e) { return { success: false, output: String(e.message || e) }; }
}
export const sh = (serial, command, timeout = 15000) => adb(serial, ['shell', command], timeout);

// Sync (only for process exit handlers, where nothing async can finish)
export function adbSync(serial, args, timeout = 4000) {
  try { const r = spawnSync(ref.adbExe, ['-s', serial, ...args], { timeout, windowsHide: true, encoding: 'utf8' }); return { success: r.status === 0, output: String(r.stdout || '') + String(r.stderr || '') }; } catch (e) { return { success: false, output: String(e.message || e) }; }
}
