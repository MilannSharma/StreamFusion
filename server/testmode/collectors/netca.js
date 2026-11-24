// The local certificate authority used to read HTTPS traffic of the TEST EMULATOR, and how it is installed there.
// The CA is only ever installed on a rooted test emulator. It is never installed on a real phone.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import tls from 'tls';
import forge from 'node-forge';
import { adb, sh } from '../adbref.js';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
export const NET_DIR = path.join(BASE, 'netproxy');
const CA_FILE = path.join(NET_DIR, 'ca.json');
const pki = forge.pki;

let ca = null;
const leafCache = new Map();

function newKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
  return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }), pub: publicKey.export({ type: 'spki', format: 'pem' }) };
}
const serialHex = () => '01' + crypto.randomBytes(8).toString('hex');

export function ensureCa() {
  if (ca) return ca;
  try {
    const j = JSON.parse(fs.readFileSync(CA_FILE, 'utf8'));
    const cert = pki.certificateFromPem(j.certPem);
    if (new Date(cert.validity.notAfter).getTime() > Date.now() + 30 * 86400000) { ca = { ...j, cert, key: pki.privateKeyFromPem(j.keyPem) }; return ca; }
  } catch (e) {}
  const kp = newKeyPair(), leaf = newKeyPair();
  const cert = pki.createCertificate();
  cert.publicKey = pki.publicKeyFromPem(kp.pub); cert.serialNumber = serialHex();
  cert.validity.notBefore = new Date(Date.now() - 86400000); cert.validity.notAfter = new Date(Date.now() + 5 * 365 * 86400000);
  const attrs = [{ name: 'commonName', value: 'StreamFusion Test CA' }, { name: 'organizationName', value: 'StreamFusion (test emulator only)' }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'basicConstraints', cA: true, critical: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }, { name: 'subjectKeyIdentifier' }]);
  const key = pki.privateKeyFromPem(kp.priv);
  cert.sign(key, forge.md.sha256.create());
  const data = { certPem: pki.certificateToPem(cert), keyPem: kp.priv, leafKeyPem: leaf.priv, leafPubPem: leaf.pub };
  fs.mkdirSync(NET_DIR, { recursive: true });
  fs.writeFileSync(CA_FILE, JSON.stringify(data), { mode: 0o600 });
  ca = { ...data, cert, key };
  return ca;
}

// The certificate shown to the app for one host. One shared key for all hosts keeps this fast; only the signing is repeated.
export function secureContextFor(hostRaw) {
  const host = String(hostRaw || 'localhost').toLowerCase();
  if (leafCache.has(host)) return leafCache.get(host);
  const c = ensureCa(), cert = pki.createCertificate();
  cert.publicKey = pki.publicKeyFromPem(c.leafPubPem); cert.serialNumber = serialHex();
  cert.validity.notBefore = new Date(Date.now() - 86400000); cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  cert.setSubject([{ name: 'commonName', value: host.slice(0, 60) }]); cert.setIssuer(c.cert.subject.attributes);
  const isIp = /^[\d.]+$/.test(host) || host.includes(':');
  cert.setExtensions([{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, keyEncipherment: true }, { name: 'extKeyUsage', serverAuth: true }, { name: 'subjectAltName', altNames: [isIp ? { type: 7, ip: host } : { type: 2, value: host }] }]);
  cert.sign(c.key, forge.md.sha256.create());
  const pems = { key: c.leafKeyPem, cert: pki.certificateToPem(cert) + c.certPem };
  const ctx = tls.createSecureContext(pems);
  ctx.pems = pems;
  if (leafCache.size > 400) leafCache.clear();
  leafCache.set(host, ctx);
  return ctx;
}
// the same certificate as plain PEM text (for a tls server that takes key / cert options)
export const leafPems = (host) => secureContextFor(host).pems;

// OpenSSL's old-style subject hash: the file name Android uses in its certificate folder (<hash>.0)
export function androidHashName() {
  const c = ensureCa();
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pki.pemToDer(c.certPem).getBytes()));
  const tbs = asn1.value[0]; const idx = tbs.value[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC ? 5 : 4;
  const subjectDer = forge.asn1.toDer(tbs.value[idx]).getBytes();
  const md5 = crypto.createHash('md5').update(Buffer.from(subjectDer, 'binary')).digest();
  return md5.readUInt32LE(0).toString(16).padStart(8, '0') + '.0';
}

// Installs the CA into the trusted store of a ROOTED test emulator (temporary, gone after a reboot). Returns { ok, reason }.
export async function installCaOnEmulator(serial) {
  try {
    const c = ensureCa(), name = androidHashName();
    const probe = await sh(serial, `ls /apex/com.android.conscrypt/cacerts/${name} /system/etc/security/cacerts/${name} 2>/dev/null`, 8000);
    if (probe.success && probe.output.includes(name)) return { ok: true, reason: 'already installed' };
    const root = await adb(serial, ['root'], 15000);
    if (/cannot run as root|not permitted/i.test(root.output || '')) return { ok: false, reason: 'This emulator image does not allow root, so its certificate store cannot be changed.' };
    await adb(serial, ['wait-for-device'], 20000);
    const who = await sh(serial, 'id -u', 8000);
    if (!/^0\b/.test(String(who.output).trim())) return { ok: false, reason: 'Could not get root access on the emulator.' };
    fs.mkdirSync(NET_DIR, { recursive: true });
    const crt = path.join(NET_DIR, name), script = path.join(NET_DIR, 'install-ca.sh');
    fs.writeFileSync(crt, c.certPem);
    fs.writeFileSync(script, [
      'set -e', 'D=/data/local/tmp/sf-certs; rm -rf $D; mkdir -p $D',
      'if [ -d /apex/com.android.conscrypt/cacerts ]; then cp /apex/com.android.conscrypt/cacerts/* $D/; else cp /system/etc/security/cacerts/* $D/; fi',
      'mount -t tmpfs tmpfs /system/etc/security/cacerts',
      'cp $D/* /system/etc/security/cacerts/; cp /data/local/tmp/' + name + ' /system/etc/security/cacerts/' + name,
      'chown root:root /system/etc/security/cacerts/*; chmod 644 /system/etc/security/cacerts/*; chcon u:object_r:system_file:s0 /system/etc/security/cacerts/* 2>/dev/null || true',
      'if [ -d /apex/com.android.conscrypt/cacerts ]; then',
      '  for Z in $(pidof zygote zygote64); do for P in $Z $(pgrep -P $Z); do nsenter --mount=/proc/$P/ns/mnt -- /bin/mount --bind /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts 2>/dev/null || true; done; done',
      'fi', 'rm -rf $D', 'echo SF_CA_DONE'
    ].join('\n') + '\n');
    const p1 = await adb(serial, ['push', crt, '/data/local/tmp/' + name], 20000), p2 = await adb(serial, ['push', script, '/data/local/tmp/sf-install-ca.sh'], 20000);
    if (!p1.success || !p2.success) return { ok: false, reason: 'Could not copy the certificate to the emulator.' };
    const run = await sh(serial, 'sh /data/local/tmp/sf-install-ca.sh', 40000);
    await sh(serial, 'rm -f /data/local/tmp/sf-install-ca.sh /data/local/tmp/' + name, 6000);
    if (!/SF_CA_DONE/.test(run.output || '')) return { ok: false, reason: 'Installing the certificate failed: ' + String(run.output || '').split('\n').slice(-2).join(' ').slice(0, 120) };
    const verify = await sh(serial, `ls /apex/com.android.conscrypt/cacerts/${name} /system/etc/security/cacerts/${name} 2>/dev/null`, 8000);
    return verify.output.includes(name) ? { ok: true, reason: 'installed' } : { ok: false, reason: 'The certificate was copied but is not visible to apps on this Android version.' };
  } catch (e) { return { ok: false, reason: String(e.message || e).slice(0, 120) }; }
}
