// Runs before `npm run dev`: the API server needs port 3001 and Electron allows one instance.
// An installed/running StreamFusion holds both, which made dev exit instantly with no explanation.
const { execFileSync } = require('child_process');

const PORT = 3001;
const kill = process.argv.includes('--kill');

function listeningPid() {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().split(/\s+/);
      if (m[0] === 'TCP' && m[3] === 'LISTENING' && /:(\d+)$/.test(m[1]) && Number(RegExp.$1) === PORT) return Number(m[4]);
    }
  } catch (e) {}
  return 0;
}
const procName = (pid) => {
  try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).split('","')[0].replace(/"/g, '').trim(); }
  catch (e) { return 'unknown'; }
};

const pid = listeningPid();
if (!pid) process.exit(0);

const name = procName(pid);
if (!kill) {
  console.error(`\n[dev] Port ${PORT} is already in use by "${name}" (PID ${pid}).`);
  console.error('[dev] This is usually the installed StreamFusion app. Close it (tray icon -> Quit), or run:\n');
  console.error('      npm run dev:force     (stops that process and starts dev)\n');
  process.exit(1);
}
console.log(`[dev] Stopping "${name}" (PID ${pid}) and its child processes...`);
try {
  // Kill the whole app tree: Electron keeps the instance lock in its other processes too.
  execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
} catch (e) { console.error('[dev] Could not stop it automatically:', e.message); process.exit(1); }
process.exit(0);
