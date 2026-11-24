// Runs the unit tests against a throw-away data folder, so tests never write fake reports, projects or baselines into the user's real StreamFusion data.
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-test-'));
const env = { ...process.env, SF_EMULATOR_HOME: dir, SF_DATA_DIR: dir, SF_NO_AUTOSAVE: '1' };
const r = spawnSync(process.execPath, ['--test', 'server/automation/automation.test.mjs', 'server/agent/batch.test.mjs', 'server/testmode/evidence.test.mjs', 'server/testmode/collectors.test.mjs'], { stdio: 'inherit', env, windowsHide: true });
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
process.exit(r.status ?? 1);
