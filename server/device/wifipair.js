// Cable-free first connection (Android 11+): the phone's own "Wireless debugging" screen pairs with this PC, either by
// scanning the QR code we show (its built-in scanner, not Google Lens) or by typing the 6-digit pairing code it shows.
// adb finds the phone on the same Wi-Fi through mDNS; nothing is installed on the phone.
import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';

const SVC = /^(\S+)\s+_adb-tls-(pairing|connect)\._tcp\.?\s+(\d{1,3}(?:\.\d{1,3}){3}):(\d+)/;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const friendly = (out, fallback) => (!out || /^command failed/i.test(out) ? fallback : out);

// Phones announcing themselves on this network: [{ name, kind: 'pairing' | 'connect', ip, port }]
export async function mdnsServices(runAdb) {
  const r = await runAdb(['mdns', 'services'], 5000);
  return String(r.output || '').split(/\r?\n/).map(l => { const m = SVC.exec(l.trim()); return m ? { name: m[1], kind: m[2], ip: m[3], port: Number(m[4]) } : null; }).filter(Boolean);
}
// Wireless debugging uses a new random port each time it is switched on; this finds the current one for a phone's address.
export const connectPortFor = async (runAdb, ip) => (await mdnsServices(runAdb)).find(s => s.kind === 'connect' && s.ip === ip)?.port || 0;

export function createWifiPairRouter({ runAdb, onConnected = () => {} }) {
  const router = express.Router();
  const sessions = new Map();

  // After pairing: wait for the phone to announce its connect port, then `adb connect`.
  async function connectAfterPair(ip) {
    for (let i = 0; i < 14; i++) {
      const port = await connectPortFor(runAdb, ip);
      if (port) {
        const r = await runAdb(['connect', `${ip}:${port}`], 8000);
        if (/connected to/i.test(r.output) && !/unable|fail|cannot/i.test(r.output)) { onConnected(); return { success: true, serial: `${ip}:${port}` }; }
        return { success: false, message: friendly(r.output, 'Paired, but the connection failed. Press "Connect" on the saved phone in a few seconds.') };
      }
      await sleep(1500);
    }
    return { success: false, message: 'Paired, but the phone did not show its connect address. Keep Wireless debugging switched on and try Scan again.' };
  }

  async function runSession(s) {
    const deadline = s.startedAt + 3 * 60 * 1000;
    while (!s.stop && Date.now() < deadline) {
      const svc = (await mdnsServices(runAdb)).find(x => x.kind === 'pairing' && x.name === s.name);
      if (svc) {
        s.state = 'pairing'; s.message = 'Phone found. Pairing…';
        const r = await runAdb(['pair', `${svc.ip}:${svc.port}`, s.pass], 15000);
        if (!/successfully paired/i.test(r.output)) { s.state = 'error'; s.message = friendly(r.output, 'Pairing failed. Press New QR code and scan again.'); return; }
        s.state = 'connecting'; s.message = 'Paired. Connecting…';
        const c = await connectAfterPair(svc.ip);
        s.state = c.success ? 'done' : 'error'; s.message = c.success ? 'Connected' : c.message; s.serial = c.serial;
        return;
      }
      await sleep(1500);
    }
    if (!s.stop) { s.state = 'error'; s.message = 'Time is up. Press Start again to get a new QR code.'; }
  }
  const cancelAll = () => { for (const s of sessions.values()) { s.stop = true; if (['waiting', 'pairing', 'connecting'].includes(s.state)) s.state = 'cancelled'; } };

  router.post('/qr/start', async (req, res) => {
    try {
      cancelAll();
      const id = crypto.randomBytes(4).toString('hex'), name = 'sf-' + crypto.randomBytes(4).toString('hex'), pass = crypto.randomBytes(5).toString('hex');
      const qr = await QRCode.toDataURL(`WIFI:T:ADB;S:${name};P:${pass};;`, { margin: 2, width: 280, errorCorrectionLevel: 'M' });
      const s = { id, name, pass, state: 'waiting', message: 'Waiting for the phone to scan…', startedAt: Date.now(), stop: false };
      sessions.set(id, s);
      runSession(s).catch(e => { s.state = 'error'; s.message = e.message; });
      res.json({ success: true, id, qr });
    } catch (e) { res.json({ success: false, message: e.message }); }
  });
  router.get('/qr/status', (req, res) => {
    const s = sessions.get(String(req.query.id || ''));
    if (!s) return res.json({ success: false, state: 'error', message: 'Session ended' });
    res.json({ success: true, state: s.state, message: s.message, serial: s.serial, seconds: Math.round((Date.now() - s.startedAt) / 1000) });
  });
  router.post('/qr/cancel', (req, res) => { cancelAll(); res.json({ success: true }); });

  // Phones that have a pairing screen open right now (QR or code): lets the app fill in the address by itself
  router.get('/pairing-services', async (req, res) => {
    const list = (await mdnsServices(runAdb)).filter(x => x.kind === 'pairing');
    res.json({ success: true, phones: list.map(x => ({ ip: x.ip, port: x.port, address: `${x.ip}:${x.port}` })) });
  });

  // Pairing code: the phone shows a 6-digit code on its "Pair device with pairing code" screen. The address is optional:
  // when it is left out, the phone that has that screen open is found on the network.
  router.post('/pair-code', async (req, res) => {
    let address = String(req.body?.address || '').trim(); const code = String(req.body?.code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return res.json({ success: false, message: 'The pairing code is 6 digits.' });
    if (!address) {
      const found = (await mdnsServices(runAdb)).filter(x => x.kind === 'pairing');
      if (found.length !== 1) return res.json({ success: false, message: found.length ? 'More than one phone is waiting. Type the address shown on the phone.' : 'No phone found on this Wi-Fi. Keep the "Pair device with pairing code" screen open on the phone, on the same Wi-Fi as this PC, or type the address shown there.' });
      address = `${found[0].ip}:${found[0].port}`;
    }
    if (!/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(address)) return res.json({ success: false, message: 'Type the address exactly as the phone shows it, like 192.168.1.5:37123' });
    const r = await runAdb(['pair', address, code], 15000);
    if (!/successfully paired/i.test(r.output)) return res.json({ success: false, message: friendly(r.output, 'Pairing failed. The code and address change every time that screen opens: close it on the phone, open it again and use the new code.') });
    res.json(await connectAfterPair(address.split(':')[0]));
  });
  return router;
}
