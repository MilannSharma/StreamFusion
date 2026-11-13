import express from 'express';
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { checkPortOpen, scanActiveEmulatorPorts, qemuStatus, checkProcessRunning } from './helpers.js';

export function createEmulatorRouter({ runAdb, rootDir }) {
  const router = express.Router();

  // Locate emulator binaries
  const candidateDirs = [
    process.env.SF_RESOURCES ? path.join(process.env.SF_RESOURCES, 'emulator-bin') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'emulator-bin') : null,
    path.join(rootDir, 'emulator-bin')
  ].filter(Boolean);

  let emulatorBin = path.join(rootDir, 'emulator-bin');
  if (!fs.existsSync(emulatorBin)) {
    try { fs.mkdirSync(emulatorBin, { recursive: true }); } catch (e) {}
  }

  let emulatorExe = path.join(emulatorBin, 'StreamFusionEmulator.exe');
  let emulatorEngineExe = path.join(emulatorBin, 'StreamFusionEngine.exe');

  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(dir, 'StreamFusionEmulator.exe'))) {
      emulatorBin = dir;
      emulatorExe = path.join(dir, 'StreamFusionEmulator.exe');
      emulatorEngineExe = path.join(dir, 'StreamFusionEngine.exe');
      break;
    }
  }

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
  const installMarkerPath = path.join(emulatorBin, 'emulator_installed.json');
  let installState = {
    isInstalling: false,
    progress: 0,
    stage: ''
  };

  function isEmulatorInstalled() {
    return fs.existsSync(installMarkerPath);
  }

  const checkQemuStatus = () => qemuStatus(emulatorBin);

  // Active child process reference
  let activeEmulatorProcess = null;

  // 1. GET /api/emulator/status
  router.get('/status', async (req, res) => {
    const installed = isEmulatorInstalled();
    const isRunning = await checkProcessRunning();
    const port5555Open = await checkPortOpen(5555);

    // Check if ADB detects an emulator connected (on 5555 or emulator-*)
    const adbRes = await runAdb(['devices'], 2000);
    const adbOut = adbRes.output || '';
    const adbConnected = adbOut.includes('localhost:5555') ||
                         adbOut.includes('127.0.0.1:5555') ||
                         adbOut.includes('emulator-') ||
                         adbOut.includes('127.0.0.1:');

    // Extract any active serial
    let detectedSerial = 'localhost:5555';
    const lines = adbOut.split(/\r?\n/);
    for (const l of lines) {
      if (l.includes('\tdevice')) {
        const s = l.split('\t')[0].trim();
        if (s.includes('5555') || s.includes('emulator') || s.includes('127.0.0.1:')) {
          detectedSerial = s;
          break;
        }
      }
    }

    res.json({
      success: true,
      name: 'StreamFusion Android Emulator',
      installed,
      isInstalling: installState.isInstalling,
      installProgress: installState.progress,
      installStage: installState.stage,
      isRunning,
      port5555Open,
      adbConnected,
      serial: detectedSerial,
      port: 5555,
      emulatorExe: installed ? emulatorExe : null
    });
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

  // 7. POST /api/emulator/install
  // Real installer arrives in M1 (Android SDK emulator download). The old simulated installer was removed.
  router.post('/install', (req, res) => {
    addEmulatorLog('warn', 'Install requested but the real installer is not implemented yet (planned: M1)');
    res.status(501).json({ success: false, message: 'Emulator installer not implemented yet (coming in M1).' });
  });

  // 8. POST /api/emulator/start
  router.post('/start', async (req, res) => {
    if (!isEmulatorInstalled()) {
      addEmulatorLog('warn', 'Start attempted before installation');
      return res.status(400).json({
        success: false,
        message: 'StreamFusion Android Emulator is not installed yet. Please click Install.'
      });
    }

    // Diagnostics pre-check
    const qemuCheck = await checkQemuStatus();
    addEmulatorLog('info', `Engine pre-flight: QEMU status = ${qemuCheck.available ? 'Found (' + qemuCheck.path + ')' : 'Not in PATH'}`);

    try {
      if (fs.existsSync(emulatorExe)) {
        addEmulatorLog('info', `Spawning ${path.basename(emulatorExe)} with piped stdio...`);

        if (activeEmulatorProcess) {
          try { activeEmulatorProcess.kill(); } catch (e) {}
        }

        activeEmulatorProcess = spawn(emulatorExe, [], {
          cwd: emulatorBin,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        activeEmulatorProcess.stdout.on('data', (data) => {
          const text = data.toString().trim();
          if (text) {
            addEmulatorLog('info', `[ENGINE STDOUT] ${text}`);
          }
        });

        activeEmulatorProcess.stderr.on('data', (data) => {
          const text = data.toString().trim();
          if (text) {
            addEmulatorLog('error', `[ENGINE STDERR] ${text}`);
          }
        });

        activeEmulatorProcess.on('error', (err) => {
          addEmulatorLog('error', `Engine process error: ${err.message}`);
        });

        activeEmulatorProcess.on('exit', (code, signal) => {
          addEmulatorLog('warn', `Engine process exited with code ${code} (signal: ${signal || 'none'})`);
        });
      } else {
        addEmulatorLog('error', `Binary not found at ${emulatorExe}`);
      }

      // Safe Sentinel Port Poller (Prevents Error 10061 completely)
      addEmulatorLog('info', 'Waiting for port 5555 to open before attempting ADB connection...');
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        const isOpen = await checkPortOpen(5555);
        if (isOpen) {
          clearInterval(pollInterval);
          addEmulatorLog('success', 'Port 5555 is actively listening! Connecting ADB bridge...');
          runAdb(['connect', 'localhost:5555'])
            .then(res => addEmulatorLog('info', `ADB connect result: ${res.output || 'OK'}`))
            .catch(e => addEmulatorLog('error', `ADB connect error: ${e.message}`));
        } else if (attempts >= 8) {
          clearInterval(pollInterval);
          addEmulatorLog('warn', 'Port 5555 did not open within timeout. Check if QEMU or virtualization requires elevated privileges.');
        }
      }, 1500);

      res.json({
        success: true,
        message: 'StreamFusion Android Emulator launch initiated!'
      });
    } catch (e) {
      addEmulatorLog('error', `Failed to launch emulator: ${e.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to launch emulator: ' + e.message
      });
    }
  });

  // 9. POST /api/emulator/stop
  router.post('/stop', async (req, res) => {
    addEmulatorLog('info', 'Stopping StreamFusion Emulator instances...');
    try {
      if (activeEmulatorProcess) {
        try { activeEmulatorProcess.kill(); } catch (e) {}
        activeEmulatorProcess = null;
      }
      exec('taskkill /F /IM StreamFusionEmulator.exe /T', () => {});
      exec('taskkill /F /IM StreamFusionEngine.exe /T', () => {});
      exec('taskkill /F /IM SoulAndroid.exe /T', () => {});
      exec('taskkill /F /IM soul.exe /T', () => {});
      await runAdb(['disconnect', 'localhost:5555'], 2000);
      addEmulatorLog('info', 'StreamFusion Android Emulator processes terminated.');

      res.json({
        success: true,
        message: 'StreamFusion Android Emulator stopped'
      });
    } catch (e) {
      addEmulatorLog('warn', `Stop signal result: ${e.message}`);
      res.json({ success: true, message: 'Stop signal sent' });
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
    const serial = req.query?.serial || 'localhost:5555';
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
