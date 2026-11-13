import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTest, englishStep, redactSecrets, resolveSecrets } from './format.js';
import { runMany, junit } from './runner.js';

test('plain English becomes deterministic steps', () => {
  assert.deepEqual(englishStep('click "Login"', 'web'), { tool: 'web_click', args: { selector: 'text="Login"' } });
  assert.deepEqual(englishStep('expect no "Error"', 'web'), { tool: 'web_assert_text', args: { text: 'Error', visible: false } });
  assert.equal(englishStep('do something clever', 'web'), null);
  assert.deepEqual(englishStep('tap "Save"', 'phone'), { tool: 'tap_element', args: { text: 'Save' } });
});
test('YAML with plain steps reports how many need the AI', () => {
  const t = parseTest('name: x\ntarget: web\nsteps:\n  - open example.com\n  - think hard about it\n  - check: {id: A, title: B}\n');
  assert.equal(t.needsAi, 1); assert.equal(t.steps.length, 3); assert.equal(t.steps[2].check.id, 'A');
});
test('secrets are redacted on record and resolved on replay', () => {
  const r = redactSecrets({ value: 'hunter2' }, ['admin', 'hunter2']);
  assert.equal(r.value, '{{login:1}}');
  assert.equal(resolveSecrets(r, ['admin', 'hunter2']).value, 'hunter2');
  assert.equal(resolveSecrets({ v: '{{env:NOPE_X}}' }, [], {}).v, '{{env:NOPE_X}}');
});
test('devices run in parallel, tests shard across them, JUnit is produced', async () => {
  const seen = [];
  const mk = (name, fn) => ({ name, handler: fn });
  const tools = {
    screenshot: mk('screenshot', async () => ({ ok: false })),
    key: mk('key', async (a) => { seen.push([a.serial, Date.now()]); await new Promise(r => setTimeout(r, 300)); return { ok: true }; }),
    assert_text: mk('assert_text', async (a) => ({ ok: true, passed: a.text !== 'bad', detail: a.text }))
  };
  const t = (n, text) => ({ id: n, name: n, target: 'phone', steps: [{ tool: 'key', args: { key: 'home' } }, { tool: 'assert_text', args: { text } }] });
  const t0 = Date.now();
  const res = await runMany({ tools, tests: [t('a', 'ok'), t('b', 'bad'), t('c', 'ok'), t('d', 'ok')], serials: ['s1', 's2'], shard: true, retries: 0 });
  assert.equal(res.length, 4);
  assert.ok(Date.now() - t0 < 4 * 300 * 0.9 + 1500, 'two devices must overlap');
  assert.equal(new Set(res.map(r => r.serial)).size, 2);
  assert.equal(res.find(r => r.test === 'b').status, 'failed');
  const x = junit(res);
  assert.match(x, /failures="1"/);
});
