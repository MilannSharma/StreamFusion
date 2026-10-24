import express from 'express';

export function createNotificationsRouter({ runAdb }) {
  const router = express.Router();
  const seenNotificationKeys = new Set();

  router.get('/', async (req, res) => {
    const { serial } = req.query;
    if (!serial) {
      return res.json({ success: false, message: 'Missing serial parameter' });
    }

    try {
      const result = await runAdb(['-s', serial, 'shell', 'dumpsys', 'notification', '--noredact'], 5000);
      if (!result.success && !result.output) {
        return res.json({ success: true, notifications: [] });
      }

      const output = result.output;
      const records = output.split(/NotificationRecord\(/g).slice(1);
      const notifications = [];

      for (const record of records) {
        const pkgMatch = record.match(/pkg=([a-zA-Z0-9_.]+)/);
        if (!pkgMatch) continue;
        const pkg = pkgMatch[1];

        // Skip internal low-level android system noise unless important
        if (pkg === 'com.android.systemui' && !record.includes('android.title=String')) continue;

        let title = '';
        let text = '';

        const titleMatch = record.match(/android\.title=String\s*\((.*?)\)(?:\r?\n|$)/);
        if (titleMatch) title = titleMatch[1].trim();

        const textMatch = record.match(/android\.text=String\s*\((.*?)\)(?:\r?\n|$)/);
        if (textMatch) text = textMatch[1].trim();

        // If no title and no text, skip
        if (!title && !text) continue;

        const idMatch = record.match(/id=(-?\d+)/);
        const notifId = idMatch ? idMatch[1] : '';
        const key = `${pkg}:${notifId}:${title}`;

        const isNew = !seenNotificationKeys.has(key);
        seenNotificationKeys.add(key);

        // Keep seenNotificationKeys capped to prevent memory leak
        if (seenNotificationKeys.size > 1000) {
          const firstKeys = Array.from(seenNotificationKeys).slice(0, 300);
          firstKeys.forEach(k => seenNotificationKeys.delete(k));
        }

        notifications.push({
          id: key,
          pkg,
          title: title || pkg,
          text: text || '',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isNew
        });
      }

      // Return recent 30 notifications
      res.json({ success: true, notifications: notifications.slice(0, 30) });
    } catch (e) {
      res.json({ success: false, message: e.message, notifications: [] });
    }
  });

  return router;
}
