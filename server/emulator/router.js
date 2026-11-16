import express from 'express';
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as sdk from './sdk.js';
import { checkPortOpen, scanActiveEmulatorPorts, qemuStatus, checkProcessRunning } from './helpers.js';

export function createEmulatorRouter({ runAdb, rootDir }) {
  const router = express.Router();

  const emulatorBin = path.join(sdk.SDK_ROOT, 'emulator');

  // Live in-memory circular log buffer
  const MAX_LOGS = 250;
  let emulatorLogs = [
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'StreamFusion Android Emulator Log Service initialized'
    }
  ];

  function addEmulatorLog(level, message) {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toLocaleTimeString(),
      level, // 'info' | 'warn' | 'error' | 'success' | 'debug'
      message
    };
    emulatorLogs.push(entry);
    if (emulatorLogs.length > MAX_LOGS) {
      emulatorLogs.shift();
    }
    console.log(`[StreamFusion Emulator][${level.toUpperCase()}] ${message}`);
  }

  // Installation state tracking
  const checkQemuStatus = () => qemuStatus(emulatorBin);

  // ---- Real emulator lifecycle (M1) ----
  sdk.setLogger(addEmulatorLog);

  router.get('/status', async (req, res) => {
    const installed = sdk.isInstalled();
    const adbRes = await runAdb(['devices'], 2000);
    const out = adbRes.output || '';
    const online = out.split(/\r?\n/).some(l => l.startsWith(sdk.SERIAL + '\t') && l.includes('device'));
    res.json({
      success: true, name: 'StreamFusion Android Emulator', installed,
      isInstalling: sdk.state.isInstalling, installProgress: sdk.state.progress,
      installStage: sdk.state.stage, installError: sdk.state.error,
      isRunning: sdk.isProcessAlive(), booting: sdk.state.booting, booted: sdk.state.booted,
      headless: sdk.state.headless, bootMode: sdk.state.bootMode, fastBoot: sdk.hasSnapshot(),
      port5555Open: online, adbConnected: online && sdk.state.booted, serial: sdk.SERIAL, port: sdk.EMULATOR_PORT
    });
  });

  router.get('/config', (req, res) => res.json({ success: true, config: sdk.getConfig(), defaults: sdk.DEFAULT_CONFIG, running: sdk.isProcessAlive() }));
  router.post('/config', (req, res) => {
    const b = req.body || {};
    const patch = {};
    for (const k of ['ramMB', 'cores', 'heapMB']) if (b[k] !== undefined) patch[k] = b[k];
    res.json({ success: true, config: sdk.setConfig(patch), restartRequired: sdk.isProcessAlive() });
  });

  router.get('/hardware', async (req, res) => res.json({ success: true, ...(await sdk.hardwareCheck()) }));

  router.post('/install', (req, res) => {
    if (sdk.state.isInstalling) return res.json({ success: true, message: 'Installation already in progress' });
    sdk.install();
    res.json({ success: true, message: 'Installation started' });
  });

  router.post('/start', async (req, res) => {
    try {
      await sdk.start(runAdb, { headless: !!req.body?.headless, wipe: !!req.body?.wipe, gpu: req.body?.gpu || 'auto' });
      res.json({ success: true, message: sdk.isInstalled() ? 'Emulator starting...' : 'Repairing the emulator, it will start by itself...' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  router.post('/stop', async (req, res) => {
    await sdk.stop(runAdb);
    res.json({ success: true, message: 'Emulator stopped' });
  });

  router.post('/reset', async (req, res) => {
    await sdk.stop(runAdb);
    await new Promise(r => setTimeout(r, 1500));
    try { await sdk.start(runAdb, { wipe: true, headless: sdk.state.headless }); res.json({ success: true, message: 'Resetting to factory state...' }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  router.post('/snapshot/:action', async (req, res) => {
    const { action } = req.params;
    const name = String(req.body?.name || 'default').replace(/[^\w-]/g, '') || 'default';
    if (!['save', 'load', 'del'].includes(action)) return res.status(400).json({ success: false, message: 'Bad action' });
    const r = await sdk.snapshot(runAdb, action, name);
    res.json({ success: r.success, message: (r.output || '').trim() });
  });

  // 2. GET /api/emulator/logs
  router.get('/logs', (req, res) => {
    res.json({
      success: true,
      logs: emulatorLogs
    });
  });

  // 3. POST /api/emulator/logs/clear
  router.post('/logs/clear', (req, res) => {
    emulatorLogs = [
      {
        id: 'cleared-' + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: 'Emulator log buffer cleared by user'
      }
    ];
    res.json({ success: true, message: 'Logs cleared' });
  });

  // 4. GET /api/emulator/diagnostics
  router.get('/diagnostics', async (req, res) => {
    const qemu = await checkQemuStatus();
    const activePorts = await scanActiveEmulatorPorts();
    const isRunning = await checkProcessRunning();
    const port5555 = await checkPortOpen(5555);
    const adbRes = await runAdb(['devices'], 2000);

    res.json({
      success: true,
      qemuInstalled: qemu.available,
      qemuPath: qemu.path,
      activeEmulatorPorts: activePorts,
      isRunning,
      port5555Open: port5555,
      adbDevices: (adbRes.output || '').trim(),
      summary: qemu.available
        ? 'QEMU Engine detected on system'
        : (activePorts.length > 0
            ? `Detected running Android environment on port ${activePorts[0].port} (${activePorts[0].name})`
            : 'No standalone QEMU engine found in PATH. Use 1-Click Auto-Detect or install QEMU.')
    });
  });

  // 5. POST /api/emulator/scan-ports
  router.post('/scan-ports', async (req, res) => {
    addEmulatorLog('info', 'Scanning common Android emulator ADB ports...');
    const activePorts = await scanActiveEmulatorPorts();
    if (activePorts.length > 0) {
      addEmulatorLog('success', `Found ${activePorts.length} active emulator port(s): ${activePorts.map(p => p.port + ' (' + p.name + ')').join(', ')}`);
    } else {
      addEmulatorLog('warn', 'No local Android emulator ports are currently open.');
    }
    res.json({ success: true, activePorts });
  });

  // 6. POST /api/emulator/auto-connect
  // Automatically probes all known ports and connects to the first active emulator!
  router.post('/auto-connect', async (req, res) => {
    addEmulatorLog('info', 'Starting smart emulator auto-connect sequence...');
    const activePorts = await scanActiveEmulatorPorts();

    if (activePorts.length === 0) {
      addEmulatorLog('error', 'Auto-connect failed: No running Android emulator found on ports 5555, 58526, 62001, 7555, 5554.');
      return res.json({
        success: false,
        message: 'No active emulator found. Please start an emulator or install StreamFusion Engine first.'
      });
    }

    const target = activePorts[0];
    const serial = `127.0.0.1:${target.port}`;
    addEmulatorLog('info', `Connecting to ${target.name} at ${serial}...`);

    const result = await runAdb(['connect', serial], 4000);
    const out = result.output || '';
    const isConn = result.success && (out.includes('connected') || out.includes('already connected'));

    if (isConn) {
      addEmulatorLog('success', `Successfully linked to ${target.name} (${serial})!`);
      return res.json({
        success: true,
        serial,
        port: target.port,
        name: target.name,
        message: `Connected to ${target.name} on ${serial}!`,
        output: out
      });
    } else {
      addEmulatorLog('warn', `ADB connect response for ${serial}: ${out}`);
      return res.json({
        success: false,
        serial,
        message: 'Port is open but ADB connection was not completed: ' + out,
        output: out
      });
    }
  });

  // 10. POST /api/emulator/connect
  // Protected against Socket 10061 error
  router.post('/connect', async (req, res) => {
    const port = req.body?.port || 5555;
    const serial = `localhost:${port}`;

    addEmulatorLog('info', `Checking if port ${port} is active...`);
    const isOpen = await checkPortOpen(port);

    if (!isOpen) {
      addEmulatorLog('warn', `Port ${port} is closed. Connection cancelled to prevent socket 10061 error.`);

      // Check if any other emulator port is open to assist the user
      const otherPorts = await scanActiveEmulatorPorts();
      if (otherPorts.length > 0) {
        addEmulatorLog('info', `Found alternate active emulator on port ${otherPorts[0].port} (${otherPorts[0].name})`);
        return res.json({
          success: false,
          portClosed: true,
          alternatePortAvailable: otherPorts[0].port,
          message: `Port ${port} is not open, but ${otherPorts[0].name} was detected on port ${otherPorts[0].port}! Click "Auto-Detect" to connect.`
        });
      }

      return res.json({
        success: false,
        portClosed: true,
        message: `Port ${port} is not active. Please start the emulator engine before connecting.`
      });
    }

    addEmulatorLog('info', `Port ${port} is open! Executing ADB connect ${serial}...`);
    const result = await runAdb(['connect', serial], 4000);
    const out = result.output || '';
    const isConn = result.success && (out.includes('connected') || out.includes('already connected'));

    if (isConn) {
      addEmulatorLog('success', `ADB connected to ${serial}`);
    } else {
      addEmulatorLog('warn', `ADB connect response: ${out}`);
    }

    res.json({
      success: isConn,
      output: out,
      serial
    });
  });

  // 11. POST /api/emulator/install-apk
  // Protected against "device 'localhost:5555' not found" error
  router.post('/install-apk', async (req, res) => {
    const apkPath = (req.body?.apkPath || '').trim();
    let serial = req.body?.serial || 'localhost:5555';

    if (!apkPath) {
      addEmulatorLog('error', 'Install APK rejected: No APK file path provided');
      return res.status(400).json({ success: false, message: 'No APK path provided' });
    }

    if (!fs.existsSync(apkPath)) {
      addEmulatorLog('error', `Install APK rejected: File not found: ${apkPath}`);
      return res.status(404).json({ success: false, message: 'APK file not found on disk: ' + apkPath });
    }

    // Step 1: Pre-verify active ADB connection to avoid "device not found"
    const devicesRes = await runAdb(['devices'], 3000);
    const devicesOut = devicesRes.output || '';
    const hasTargetDevice = devicesOut.includes(serial) && devicesOut.includes('\tdevice');

    if (!hasTargetDevice) {
      // Look for any connected device
      const lines = devicesOut.split(/\r?\n/).filter(l => l.includes('\tdevice'));
      if (lines.length > 0) {
        const fallbackSerial = lines[0].split('\t')[0].trim();
        addEmulatorLog('info', `Target ${serial} not connected. Auto-routing APK install to active device: ${fallbackSerial}`);
        serial = fallbackSerial;
      } else {
        // Test port 5555 first
        const isPortOpen = await checkPortOpen(5555);
        if (isPortOpen) {
          addEmulatorLog('info', 'Attempting fast reconnect on port 5555...');
          await runAdb(['connect', serial], 3000);
        } else {
          addEmulatorLog('error', 'APK installation aborted: No emulator or phone is currently connected to ADB.');
          return res.status(400).json({
            success: false,
            notConnected: true,
            message: 'No connected emulator found. Please start and connect the emulator first before installing APKs.'
          });
        }
      }
    }

    addEmulatorLog('info', `Installing APK "${path.basename(apkPath)}" to ${serial}...`);
    const installRes = await runAdb(['-s', serial, 'install', '-r', apkPath], 120000);
    const out = installRes.output || '';

    if (installRes.success && (out.includes('Success') || !out.includes('Failure'))) {
      addEmulatorLog('success', `APK "${path.basename(apkPath)}" installed successfully on ${serial}!`);
      res.json({
        success: true,
        message: 'APK installed successfully into StreamFusion Emulator!',
        output: out
      });
    } else {
      addEmulatorLog('error', `Failed to install APK: ${out}`);
      res.json({
        success: false,
        message: 'Failed to install APK: ' + out,
        output: out
      });
    }
  });

  // 12. GET /api/emulator/apps
  router.get('/apps', async (req, res) => {
    const serial = req.query?.serial || sdk.SERIAL;
    const pmRes = await runAdb(['-s', serial, 'shell', 'pm', 'list', 'packages', '-3'], 5000);
    if (!pmRes.success) {
      return res.json({ success: true, apps: [] });
    }

    const packages = pmRes.output
      .split(/\r?\n/)
      .map(l => l.replace(/^package:/, '').trim())
      .filter(Boolean);

    res.json({
      success: true,
      apps: packages.map(pkg => ({
        package: pkg,
        name: pkg.split('.').pop() || pkg
      }))
    });
  });

  // 13. POST /api/emulator/launch-app
  router.post('/launch-app', async (req, res) => {
    const pkg = (req.body?.package || '').trim();
    const serial = req.body?.serial || 'localhost:5555';

    if (!pkg) {
      return res.status(400).json({ success: false, message: 'No package provided' });
    }

    addEmulatorLog('info', `Launching application: ${pkg} on ${serial}`);
    const monkeyRes = await runAdb([
      '-s', serial,
      'shell', 'monkey',
      '-p', pkg,
      '-c', 'android.intent.category.LAUNCHER', '1'
    ], 5000);

    res.json({
      success: monkeyRes.success,
      output: monkeyRes.output
    });
  });

  // 14. POST /api/emulator/uninstall-app
  router.post('/uninstall-app', async (req, res) => {
    const pkg = (req.body?.package || '').trim();
    const serial = req.body?.serial || 'localhost:5555';

    if (!pkg) {
      return res.status(400).json({ success: false, message: 'No package provided' });
    }

    addEmulatorLog('info', `Uninstalling application: ${pkg} from ${serial}`);
    const unRes = await runAdb(['-s', serial, 'uninstall', pkg], 15000);
    res.json({
      success: unRes.success && unRes.output.includes('Success'),
      output: unRes.output
    });
  });

  return router;
}
