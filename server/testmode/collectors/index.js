// Starts and stops the automatic app checks that run for the whole test (traffic capture, APK scan) and keeps them from ever
// breaking a test: each one is guarded, time-limited, and reports what it could not do.
import { guard, cov } from './guard.js';
import { startCapture, stopCapture, flushCapture, repairStaleProxies } from './netproxy.js';
import { analyzeApk } from './apk.js';
import { scanAppLog } from './applog.js';

const SYSTEM_PKG = /^(android$|com\.android\.|com\.google\.android\.(apps\.nexuslauncher|gms|permissioncontroller|packageinstaller|inputmethod|googlequicksearchbox)|com\.sec\.android\.app\.launcher|com\.samsung\.android\.(app\.launcher|honeyboard)|com\.miui\.|com\.oneplus\.|com\.coloros\.|com\.huawei\.android\.launcher)/;
const asked = new WeakMap(); // run -> package names already scanned

export const looksLikePackage = (s) => /^[A-Za-z][\w]*(\.[A-Za-z_][\w]*){2,}$/.test(String(s || '').trim());

// Called once when an app test begins: point the phone at the capture proxy BEFORE the AI touches the app.
export async function startRunCollectors(run, serial, target = '') {
  if (!run || !serial) return;
  await guard(run, 'api', () => startCapture({ run, serial }), 60000);
  if (looksLikePackage(target)) scanPackage(run, serial, target.trim());
}

// Static scan of the installed app (in the background: never blocks the test).
export function scanPackage(run, serial, pkg) {
  if (!run || !pkg || SYSTEM_PKG.test(pkg)) return;
  let set = asked.get(run); if (!set) asked.set(run, (set = new Set()));
  if (set.has(pkg) || set.size >= 2) return; set.add(pkg);
  guard(run, 'apk', () => analyzeApk({ run, serial, pkg }), 240000).catch(() => {});
}

// After every batch of steps
export async function afterBatchCollectors({ run, serial, pkg, caseId }) {
  if (pkg) scanPackage(run, serial, pkg);
  await guard(run, 'applog', () => scanAppLog({ run, serial, pkg, caseId }), 25000);
  flushCapture(run);
}

export async function stopRunCollectors(run) {
  if (!run) return;
  await guard(run, 'api', () => stopCapture(run), 30000);
  const s = run.health?.samples || [];
  if (s.some(x => x.world === 'app') && !s.some(x => x.world === 'app' && x.jankPct != null)) cov(run, 'perf', 'partial', 'The phone gave no frame statistics for this app (it may not draw through the normal screen path), so slow frames could not be measured.');
  else if (s.some(x => x.world === 'app')) cov(run, 'perf', 'ok', '');
}

export { repairStaleProxies };
