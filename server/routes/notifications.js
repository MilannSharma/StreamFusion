import express from 'express';
import fs from 'fs';
import path from 'path';
import { friendlyApp } from './appnames.js';

// Parse `dumpsys notification --noredact` into user-facing notifications.
// Ongoing / foreground-service / group-summary / system noise ("USB debugging on", "Charging via USB") is dropped.
export function parseNotifications(output) {
  const records = String(output || '').split(/NotificationRecord\(/g).slice(1);
  const out = [];
  for (const record of records) {
    const pkg = (record.match(/pkg=([a-zA-Z0-9_.]+)/) || [])[1];
    if (!pkg) continue;
    const title = ((record.match(/android\.title=String\s*\((.*?)\)(?:\r?\n|$)/) || [])[1] || '').trim();
    const text = ((record.match(/android\.text=String\s*\((.*?)\)(?:\r?\n|$)/) || [])[1] || '').trim();
    if (!title && !text) continue;
    const flags = parseInt((record.match(/flags=0x([0-9a-fA-F]+)/) || [])[1] || '0', 16);
    const ongoing = !!(flags & 0x2) || !!(flags & 0x40) || !!(flags & 0x200); // ONGOING_EVENT, FOREGROUND_SERVICE, GROUP_SUMMARY
    const system = pkg === 'android' || pkg === 'com.android.systemui' || pkg === 'com.android.providers.downloads' || pkg === 'com.google.android.gms';
    const id = (record.match(/\bid=(-?\d+)/) || [])[1] || '';
    const tag = (record.match(/\btag=([^\s]+)/) || [])[1] || '';
    out.push({ key: `${pkg}:${id}:${tag}`, pkg, app: friendlyApp(pkg), title: title || friendlyApp(pkg), text, ongoing, system });
  }
  return out;
}

export function createNotificationsRouter({ runAdb, dataDir }) {
  const router = express.Router();
  const seenNotificationKeys = new Set();

  // Manual list (also used by the UI)
  router.get('/', async (req, res) => {
    const { serial } = req.query;
    if (!serial) return res.json({ success: false, message: 'Missing serial parameter' });
    try {
      const result = await runAdb(['-s', serial, 'shell', 'dumpsys', 'notification', '--noredact'], 6000);
      if (!result.success && !result.output) return res.json({ success: true, notifications: [] });
      const list = parseNotifications(result.output).filter(n => !n.ongoing && !n.system).slice(0, 30).map(n => {
        const isNew = !seenNotificationKeys.has(n.key + '|' + n.title + '|' + n.text);
        seenNotificationKeys.add(n.key + '|' + n.title + '|' + n.text);
        if (seenNotificationKeys.size > 1000) Array.from(seenNotificationKeys).slice(0, 300).forEach(k => seenNotificationKeys.delete(k));
        return { id: n.key, pkg: n.pkg, app: n.app, title: n.title, text: n.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isNew };
      });
      res.json({ success: true, notifications: list });
    } catch (e) { res.json({ success: false, message: e.message, notifications: [] }); }
  });

  // ---- Background watcher: runs in the server, so it keeps working while the window is hidden in the tray ----
  // The desktop shell (Electron main process) polls /queue and shows native Windows notifications.
  const queue = []; let seq = 0;
  const lastAt = new Map(); // key -> time of the last alert: counters that update every few seconds (steps, downloads) alert at most every 30 s
  const state = new Map(); // serial -> Map(key -> signature); a serial is "baselined" once it has an entry
  const enabled = () => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).notificationMirroring === true; } catch (e) { return false; } };
  let busy = false, timer = null;
  async function tick() {
    if (busy || !enabled()) { if (!enabled()) state.clear(); return; }
    busy = true;
    try {
      const d = await runAdb(['devices'], 4000);
      const serials = String(d.output || '').split(/\r?\n/).slice(1).map(l => l.trim().split(/\s+/)).filter(p => p[1] === 'device').map(p => p[0]).filter(s => !/^emulator-/.test(s));
      for (const serial of serials) {
        const r = await runAdb(['-s', serial, 'shell', 'dumpsys', 'notification', '--noredact'], 8000);
        if (!r.output) continue;
        const now = parseNotifications(r.output).filter(n => !n.ongoing && !n.system);
        const first = !state.has(serial);
        const prev = state.get(serial) || new Map(), next = new Map();
        for (const n of now) {
          const sig = n.title + '|' + n.text;
          next.set(n.key, sig);
          if (!first && prev.get(n.key) !== sig && Date.now() - (lastAt.get(serial + n.key) || 0) > 30000) { lastAt.set(serial + n.key, Date.now()); queue.push({ seq: ++seq, serial, pkg: n.pkg, app: n.app, title: n.title, text: n.text, at: Date.now() }); if (queue.length > 100) queue.shift(); }
        }
        state.set(serial, next); // the first scan only records what is already there: no flood of old alerts at start
      }
      for (const s of [...state.keys()]) if (!serials.includes(s)) state.delete(s);
    } catch (e) {}
    busy = false;
  }
  router.startWatcher = () => { if (!timer) timer = setInterval(tick, 4000); return router; };
  router.stopWatcher = () => { clearInterval(timer); timer = null; };
  router.get('/queue', (req, res) => { const after = Number(req.query.after) || 0; res.json({ success: true, lastSeq: seq, items: queue.filter(i => i.seq > after) }); });

  return router;
}
