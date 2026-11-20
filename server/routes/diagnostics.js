// "Fix my connection": real checks, one step at a time (the UI animates each step as it runs), each with what is wrong and a fix when there is one.
import express from 'express';
import fs from 'fs';
import os from 'os';
import { execFile, spawn } from 'child_process';

const lanIps = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
const net24 = (ip) => String(ip).split('.').slice(0, 3).join('.');
const isEmulator = (s) => /^(emulator-|localhost:|127\.0\.0\.1:)/.test(String(s));
const run = (file, args, opts = {}) => new Promise((resolve) => execFile(file, args, { timeout: 6000, encoding: 'utf8', windowsHide: true, ...opts }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim() })));

export function createDiagnosticsRouter({ runAdb, adbExe, scrcpyExe, scrcpyBin, getSaved = () => [], reconnectSaved = async () => {} }) {
  const router = express.Router();

  // phones adb can see now (emulators left out)
  async function phones() {
    const r = await runAdb(['devices', '-l'], 5000);
    const out = [];
    for (const line of String(r.output || '').split(/\r?\n/)) {
      const m = line.trim().match(/^(\S+)\s+(device|offline|unauthorized|recovery|no permissions)\b(.*)$/);
      if (!m || isEmulator(m[1])) continue;
      const model = (m[3].match(/model:(\S+)/) || [])[1];
      out.push({ serial: m[1], state: m[2], isWifi: /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(m[1]), model: model ? model.replace(/_/g, ' ') : m[1] });
    }
    return out;
  }
  const ok = (detail) => ({ status: 'ok', detail });
  const warn = (detail, fixes = []) => ({ status: 'warn', detail, fixes });
  const fail = (detail, fixes = []) => ({ status: 'fail', detail, fixes });

  const STEPS = {
    async adb() {
      const v = await runAdb(['version'], 4000);
      if (!v.success) return fail('ADB could not start: ' + (v.output || 'unknown error') + '. Antivirus can block adb.exe.', [{ id: 'restart_adb', label: 'Restart ADB' }]);
      const ver = (v.output.match(/Android Debug Bridge version ([\d.]+)/) || [])[1] || '';
      const d = await runAdb(['devices'], 6000); // this also starts the adb server if it is not running
      if (!d.success && /cannot connect|daemon|refused/i.test(d.output || '')) return fail('ADB is installed but its background service will not answer.', [{ id: 'restart_adb', label: 'Restart ADB' }]);
      return ok('ADB ' + ver + ' is running');
    },
    async usb() {
      if (process.platform !== 'win32') return ok('Skipped (not Windows)');
      const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', "Get-PnpDevice -PresentOnly | Where-Object { $_.Status -eq 'Error' -or $_.Status -eq 'Unknown' } | Select-Object -ExpandProperty FriendlyName"], { timeout: 12000 });
      const bad = r.out.split(/\r?\n/).map(x => x.trim()).filter(x => /android|adb|mtp|portable|phone|composite|samsung|xiaomi|redmi|poco|oppo|vivo|realme|oneplus|motorola|pixel|huawei|honor|usb/i.test(x));
      if (bad.length) return warn('Windows reports a driver problem with: ' + [...new Set(bad)].slice(0, 3).join(', ') + '. Install the phone maker\'s USB driver, or try another cable and port.', [{ id: 'open_devmgr', label: 'Open Device Manager' }]);
      return ok('No USB driver problems found');
    },
    async devices() {
      const list = await phones();
      if (!list.length) return warn('No phone is visible to this PC. For a cable: use a data cable, set USB mode to File transfer, and switch on USB debugging. For Wi-Fi: use "Connect without cable".', [{ id: 'pair', label: 'Connect without cable' }]);
      const unauth = list.filter(p => p.state === 'unauthorized'), off = list.filter(p => p.state === 'offline'), good = list.filter(p => p.state === 'device');
      if (unauth.length) return fail(`${unauth[0].model} is waiting for permission. Unlock it and tap Allow on the "Allow USB debugging?" box (tick "Always allow"). No box? On the phone: Developer options, Revoke USB debugging authorizations, then plug in again.`, [{ id: 'restart_adb', label: 'Ask the phone again' }]);
      if (off.length) return warn(`${off[0].model} is listed but offline: the link dropped.`, off.map(p => ({ id: 'reconnect', serial: p.serial, label: 'Reconnect ' + p.model })));
      return ok(good.map(p => `${p.model} (${p.isWifi ? 'Wi-Fi' : 'USB'})`).join(', ') + ' ready');
    },
    async network() {
      const saved = getSaved();
      const live = await phones();
      const lan = lanIps();
      if (!saved.length) return ok('No saved Wi-Fi phone yet. ' + (lan.length ? 'This PC is on ' + lan[0] : 'This PC has no network address.'));
      if (!lan.length) return fail('This PC has no network address: it is not connected to Wi-Fi or a network.');
      const msgs = []; const fixes = []; let anyBad = false;
      for (const s of saved) {
        const ips = (Array.isArray(s.ips) && s.ips.length ? s.ips : [{ ip: s.ip }]).map(a => a.ip);
        const connected = live.some(p => p.state === 'device' && (ips.some(ip => p.serial.startsWith(ip + ':')) || p.model === s.model));
        const name = s.nickname || s.displayName || s.model;
        if (connected) { msgs.push(`${name} is connected`); continue; }
        anyBad = true;
        const sameNet = ips.some(ip => lan.some(l => net24(l) === net24(ip)));
        if (!sameNet) msgs.push(`${name} was last on ${ips[0]} but this PC is on ${lan[0]}: they look like different networks. Put both on the same Wi-Fi (a guest Wi-Fi or a hotspot counts as different).`);
        else { msgs.push(`${name} is on this network but not answering. Switch on Wireless debugging (or plug it in once), and wake the phone.`); fixes.push({ id: 'reconnect_saved', label: 'Try reconnecting now' }); }
      }
      return anyBad ? warn(msgs.join(' '), fixes) : ok(msgs.join(', '));
    },
    async mdns() {
      const r = await runAdb(['mdns', 'check'], 5000);
      return /mdns daemon version/i.test(r.output || '') ? ok('Network discovery works (needed for pairing and reconnecting after a port change)') : warn('Network discovery (mDNS) is not answering. Pairing by code and reconnecting after the port changes may fail. A firewall or VPN is the usual cause.');
    },
    async engine() {
      if (!scrcpyExe || (scrcpyExe.includes(':') || scrcpyExe.includes('\\') || scrcpyExe.includes('/')) && !fs.existsSync(scrcpyExe)) return fail('The mirror engine (scrcpy) file is missing. Antivirus may have removed it: reinstall StreamFusion.');
      const r = await run(scrcpyExe, ['--version'], { cwd: scrcpyBin, timeout: 5000 });
      const v = (r.out.match(/scrcpy (\d[\d.]*)/) || [])[1];
      return v ? ok('Mirror engine scrcpy ' + v + ' is ready') : fail('The mirror engine does not start' + (r.err ? ': ' + r.err.slice(0, 120) : '') + '. Antivirus can block it.');
    },
    async phone() {
      const good = (await phones()).find(p => p.state === 'device');
      if (!good) return { status: 'skip', detail: 'No phone to check yet' };
      const [bat, pow] = await Promise.all([runAdb(['-s', good.serial, 'shell', 'dumpsys', 'battery'], 4000), runAdb(['-s', good.serial, 'shell', 'dumpsys', 'power'], 4000)]);
      const level = parseInt((bat.output.match(/level:\s*(\d+)/) || [])[1] || '-1', 10);
      const screenOff = /Display Power: state=OFF/i.test(pow.output) || /mWakefulness=(Asleep|Dozing)/i.test(pow.output);
      const issues = [];
      const fixes = [];
      if (screenOff) { issues.push('its screen is off, so mirroring shows black'); fixes.push({ id: 'wake', serial: good.serial, label: 'Wake the screen' }); }
      if (level >= 0 && level < 15) issues.push(`battery is low (${level}%)`);
      return issues.length ? warn(`${good.model}: ${issues.join(' and ')}.`, fixes) : ok(`${good.model} is awake${level >= 0 ? ', battery ' + level + '%' : ''}`);
    }
  };

  router.get('/step/:id', async (req, res) => {
    const fn = STEPS[req.params.id];
    if (!fn) return res.status(404).json({ success: false, message: 'Unknown step' });
    try { res.json({ success: true, id: req.params.id, ...(await fn()) }); }
    catch (e) { res.json({ success: true, id: req.params.id, status: 'warn', detail: 'This check could not finish: ' + e.message }); }
  });

  router.post('/fix/:id', async (req, res) => {
    const serial = String(req.body?.serial || '');
    try {
      switch (req.params.id) {
        case 'restart_adb': await runAdb(['kill-server'], 6000); await runAdb(['start-server'], 10000); return res.json({ success: true, message: 'ADB restarted' });
        case 'reconnect': { if (!serial) break; await runAdb(['disconnect', serial], 4000); const r = await runAdb(['connect', serial], 8000); return res.json({ success: /connected to/i.test(r.output) && !/unable|fail|cannot/i.test(r.output), message: r.output }); }
        case 'reconnect_saved': await reconnectSaved(); return res.json({ success: true, message: 'Tried every saved address' });
        case 'wake': if (!serial) break; await runAdb(['-s', serial, 'shell', 'input', 'keyevent', '224'], 4000); return res.json({ success: true, message: 'Woke the screen' });
        case 'open_devmgr': if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', 'devmgmt.msc'], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); return res.json({ success: true, message: 'Opened Device Manager' });
      }
      res.json({ success: false, message: 'Nothing to do' });
    } catch (e) { res.json({ success: false, message: e.message }); }
  });

  return router;
}
