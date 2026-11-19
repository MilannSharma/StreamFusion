import test from 'node:test';
import assert from 'node:assert/strict';
import { batchTool } from './batch.js';

const fake = () => {
  const calls = [];
  const TOOLS = {
    tap: { name: 'tap', handler: async (a) => { calls.push(['tap', a]); return { ok: true }; } },
    assert_text: { name: 'assert_text', handler: async (a) => { calls.push(['assert_text', a]); return { ok: true, passed: a.text === 'Home', detail: 'x' }; } },
    ui_tree: { name: 'ui_tree', handler: async () => ({ ok: true, foreground: 'com.x', elements: [{ text: 'Home', clickable: true, cx: 1, cy: 2 }] }) },
    uninstall_app: { name: 'uninstall_app', dangerous: true, handler: async () => ({ ok: true }) },
    screenshot: { name: 'screenshot', handler: async () => ({ ok: true }) },
    web_click: { name: 'web_click', handler: async () => ({ ok: true }) }
  };
  TOOLS.device_batch = batchTool(TOOLS, 'phone');
  return { TOOLS, calls };
};

test('device_batch runs steps in order, injects serial, returns one observation', async () => {
  const { TOOLS, calls } = fake();
  const r = await TOOLS.device_batch.handler({ serial: 'emulator-5554', steps: [{ tool: 'tap', args: { x: 1, y: 2 } }, { tool: 'assert_text', args: { text: 'Home' } }] });
  assert.equal(r.allPassed, true); assert.equal(r.ran, 2);
  assert.equal(calls[0][1].serial, 'emulator-5554');
  assert.match(r.observe.elements[0], /Home \[tap\] @1,2/);
});
test('device_batch stops at the first failed assert', async () => {
  const { TOOLS, calls } = fake();
  const r = await TOOLS.device_batch.handler({ serial: 's', steps: [{ tool: 'assert_text', args: { text: 'Nope' } }, { tool: 'tap', args: {} }] });
  assert.equal(r.allPassed, false); assert.equal(r.stoppedAt, 0); assert.equal(calls.length, 1);
});
test('device_batch refuses risky tools, screenshots, web tools and itself', async () => {
  const { TOOLS } = fake();
  const r = await TOOLS.device_batch.handler({ serial: 's', stopOnFail: false, observe: false, steps: [{ tool: 'uninstall_app' }, { tool: 'screenshot' }, { tool: 'web_click' }, { tool: 'device_batch' }] });
  assert.equal(r.results.length, 4); assert.ok(r.results.every(x => x.failed));
});
