// The app name the user sees (exe, Start menu and desktop shortcut) carries NO version, so it never goes stale.
// Only the installer file name has the version (StreamFusion-v<version>-Setup.exe). Runs before build:exe.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'package.json');
const raw = fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(raw);
const name = 'StreamFusion';
pkg.build.productName = name;
pkg.build.artifactName = 'StreamFusion-v' + pkg.version + '-Setup.${ext}';
pkg.build.nsis.shortcutName = name;
const out = JSON.stringify(pkg, null, 2) + (raw.endsWith('\n') ? '\n' : '');
if (out !== raw) { fs.writeFileSync(file, out); console.log('[sync-version] names set to', name, '- installer', pkg.build.artifactName); } else console.log('[sync-version] ok');
