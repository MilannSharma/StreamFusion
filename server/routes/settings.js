import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function createSettingsRouter(dataDir) {
  const router = express.Router();
  const settingsFile = path.join(dataDir, 'settings.json');
  const defaultDownloadDir = path.join(os.homedir(), 'Downloads', 'StreamFusion');

  const defaultSettings = {
    welcomeSeen: false,
    closeToTray: true,
    screenOffMirror: false,
    stayAwake: true,
    clipboardSync: true,
    downloadDir: defaultDownloadDir,
    autoUpdateCheck: true
  };

  function readSettings() {
    try {
      if (fs.existsSync(settingsFile)) {
        const raw = fs.readFileSync(settingsFile, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...defaultSettings, ...parsed };
      }
    } catch (err) {
      console.warn('[StreamFusion Settings] Error reading settings:', err.message);
    }
    return { ...defaultSettings };
  }

  function writeSettings(updated) {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const tmpFile = `${settingsFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(updated, null, 2), 'utf8');
      fs.renameSync(tmpFile, settingsFile);
      return true;
    } catch (err) {
      console.error('[StreamFusion Settings] Failed to write settings:', err);
      return false;
    }
  }

  // GET /api/settings
  router.get('/', (req, res) => {
    res.json(readSettings());
  });

  // POST /api/settings
  router.post('/', (req, res) => {
    const current = readSettings();
    const payload = req.body || {};
    const merged = { ...current, ...payload };
    const success = writeSettings(merged);
    if (success) {
      res.json({ success: true, settings: merged });
    } else {
      res.status(500).json({ error: 'Failed to write settings' });
    }
  });

  return router;
}
