// Saved chat conversations (App Testing + Web Testing), so a chat survives an app restart and an
// interrupted test can be resumed. One JSON file per chat: <data>/chats/<id>.json
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.SF_EMULATOR_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'StreamFusion');
const DIR = path.join(BASE, 'chats');
const ID = /^[\w-]{3,64}$/;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CHATS = 200;

const file = (id) => path.join(DIR, id + '.json');
export const validId = (id) => ID.test(String(id || ''));

const read = (id) => { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch (e) { return null; } };

export function listChats(world) {
  let names = [];
  try { names = fs.readdirSync(DIR).filter(n => n.endsWith('.json')); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    const c = read(n.slice(0, -5));
    if (!c || (world && c.world !== world)) continue;
    const msgs = Array.isArray(c.msgs) ? c.msgs : [];
    const checks = msgs.filter(m => m.kind === 'check');
    out.push({
      id: c.id, projectId: c.test?.projectId || '', title: c.title || 'Chat', world: c.world, status: c.status || 'idle', updatedAt: c.updatedAt, createdAt: c.createdAt,
      isTest: !!c.test, messages: msgs.filter(m => m.kind === 'user' || m.kind === 'agent').length,
      pass: checks.filter(m => m.status === 'pass').length, fail: checks.filter(m => m.status === 'fail').length, total: checks.length,
      preview: String((msgs.filter(m => m.kind === 'agent').pop() || {}).text || '').slice(0, 140)
    });
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, MAX_CHATS);
}

export const getChat = (id) => (validId(id) ? read(id) : null);

export function saveChat(id, body) {
  if (!validId(id)) throw new Error('bad id');
  const msgs = Array.isArray(body.msgs) ? body.msgs.slice(-1500) : [];
  const prev = read(id);
  const c = {
    id, world: body.world === 'web' ? 'web' : 'phone',
    title: prev?.customTitle ? prev.title : String(body.title || 'Chat').slice(0, 120), customTitle: prev?.customTitle || undefined,
    status: ['running', 'idle'].includes(body.status) ? body.status : 'idle',
    createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now(),
    model: body.model ? String(body.model).slice(0, 60) : undefined,
    tokens: body.tokens || undefined,
    // the test brief (never the login): what is needed to continue an interrupted test
    test: body.test ? { title: String(body.test.title || '').slice(0, 120), summary: String(body.test.summary || '').slice(0, 4000), projectId: body.test.projectId ? String(body.test.projectId) : '', full: String(body.test.full || '').slice(0, 200000), target: String(body.test.target || '').slice(0, 500) } : undefined,
    msgs
  };
  const text = JSON.stringify(c);
  if (text.length > MAX_BYTES) c.msgs = msgs.slice(-300);
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = file(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c)); fs.renameSync(tmp, file(id)); // atomic: a crash mid-write never corrupts the chat
  return c;
}

export function renameChat(id, title) {
  const c = getChat(id); const t = String(title || '').trim().slice(0, 120); if (!c || !t) return false;
  c.title = t; c.customTitle = true; fs.writeFileSync(file(id), JSON.stringify(c)); return true;
}

export function deleteChat(id) { if (!validId(id)) return false; try { fs.unlinkSync(file(id)); return true; } catch (e) { return false; } }
