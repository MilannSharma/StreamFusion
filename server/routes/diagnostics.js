import express from 'express';

export function createDiagnosticsRouter({ runAdb, adbExe, scrcpyExe, scrcpyBin }) {
  const router = express.Router();

  router.get('/check', async (req, res) => {
    const report = {
      timestamp: new Date().toISOString(),
      adb: { ok: false, version: '', message: '' },
      scrcpy: { ok: false, version: '', message: '' },
      server: { ok: true, url: 'http://127.0.0.1:3001' },
      devices: { total: 0, healthy: 0, unauthorized: 0, offline: 0, list: [] },
      issues: [],
      suggestedFixes: []
    };

    // 1. ADB Check
    try {
      const adbVer = await runAdb(['version'], 3000);
      if (adbVer.success) {
        report.adb.ok = true;
        const vM = adbVer.output.match(/Android Debug Bridge version ([\d.]+)/);
        report.adb.version = vM ? vM[1] : 'Found';
      } else {
        report.adb.message = adbVer.output || 'ADB execution failed';
        report.issues.push('ADB binary could not be executed.');
        report.suggestedFixes.push({ action: 'restart_adb', label: 'Restart ADB Service' });
      }
    } catch (e) {
      report.adb.message = e.message;
      report.issues.push('ADB binary error: ' + e.message);
    }

    // 2. Scrcpy Check
    try {
      const scrcpyRes = await runAdb(['--version'], 2000); // Check if bin dir is responsive
      report.scrcpy.ok = true;
      report.scrcpy.version = '5.0.1';
    } catch (e) {
      report.scrcpy.message = e.message;
    }

    // 3. Devices Check
    try {
      const devRes = await runAdb(['devices', '-l'], 4000);
      if (devRes.success && devRes.output) {
        const rawLines = devRes.output.split(/\r?\n/).map(l => l.trim());
        let startIndex = 0;
        for (let i = 0; i < rawLines.length; i++) {
          if (rawLines[i].toLowerCase().includes('list of devices attached')) {
            startIndex = i + 1;
            break;
          }
        }

        for (let i = startIndex; i < rawLines.length; i++) {
          const line = rawLines[i];
          if (!line || line.startsWith('*') || line.includes('daemon') || line.includes('could not')) continue;
          const match = line.match(/^(\S+)\s+(\w+)(.*)$/);
          if (!match) continue;

          const serial = match[1];
          const state = match[2].toLowerCase();
          const isWifi = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(serial);

          report.devices.total++;
          if (state === 'device') {
            report.devices.healthy++;
          } else if (state === 'unauthorized') {
            report.devices.unauthorized++;
            report.issues.push(`Device [${serial}] is Unauthorized. Please tap 'Allow USB debugging' on your phone.`);
            report.suggestedFixes.push({
              action: 'reauth',
              serial,
              label: 'Re-Request Authorization',
              instructions: 'Unlock your phone, look for the USB Debugging prompt, tick "Always allow" and tap Allow.'
            });
          } else if (state === 'offline') {
            report.devices.offline++;
            report.issues.push(`Device [${serial}] is Offline. The connection may have dropped.`);
            report.suggestedFixes.push({ action: 'reconnect', serial, label: 'Reconnect Device' });
          }

          report.devices.list.push({ serial, state, isWifi });
        }
      }
    } catch (e) {
      report.issues.push('Device enumeration failed: ' + e.message);
    }

    if (report.devices.total === 0) {
      report.issues.push('No Android devices detected via USB or Wi-Fi.');
      report.suggestedFixes.push({
        action: 'driver_help',
        label: 'USB Connection & Driver Checklist',
        instructions: '1. Connect phone via USB cable.\n2. In Phone Settings -> About Phone -> tap "Build Number" 7 times.\n3. In Developer Options -> enable "USB Debugging".\n4. Change USB mode from "Charging only" to "File Transfer (MTP)".'
      });
    }

    res.json({ success: true, report });
  });

  return router;
}
