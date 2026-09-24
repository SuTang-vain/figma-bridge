// figma-tool.test.js — the single `figma` tool: schema shape, mode dispatch, error paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaTool, MODES, FIELD_PRESETS, IMAGE_FORMATS } from '../src/figma-tool.js';

function harness(overrides = {}) {
  const calls = { screens: [], node: [], images: [], changed: [] };
  const tool = createFigmaTool({
    getScreens: async (...args) => { calls.screens.push(args); return overrides.screens || 'SCREENS TEXT'; },
    getNode: async (...args) => { calls.node.push(args); return overrides.node || 'NODE TEXT'; },
    getImages: async (...args) => { calls.images.push(args); return overrides.images || ['/tmp/proj/figma-assets/1-4.png']; },
    getChanged: async (...args) => { calls.changed.push(args); return overrides.changed || 'CHANGED TEXT'; },
    truncate: overrides.truncate || ((text) => ({ text, truncation: { truncated: false }, fullOutputPath: null })),
  });
  return { tool, calls };
}

test('the surface is one compact tool, as promised', () => {
  const { tool } = harness();
  assert.equal(tool.name, 'figma');
  assert.equal(tool.label, 'Figma');
  assert.ok(tool.description.length > 40 && tool.description.includes('truncated'));
  assert.equal(typeof tool.promptSnippet, 'string');
  assert.ok(Array.isArray(tool.promptGuidelines) && tool.promptGuidelines.length > 0);
  assert.equal(typeof tool.execute, 'function');
});

test('the parameter schema requires mode+ref and enumerates the documented values', () => {
  const { tool } = harness();
  const schema = tool.parameters;
  assert.deepEqual(schema.required, ['mode', 'ref']);
  assert.deepEqual(schema.properties.mode.anyOf.map((v) => v.const), MODES);
  assert.deepEqual(schema.properties.fields.anyOf.map((v) => v.const), FIELD_PRESETS);
  assert.deepEqual(schema.properties.format.anyOf.map((v) => v.const), IMAGE_FORMATS);
  assert.equal(schema.properties.nodeId.type, 'string');
  assert.equal(schema.properties.depth.type, 'number');
  assert.equal(schema.additionalProperties, undefined);
});

test('mode=screens forwards ref and depth', async () => {
  const { tool, calls } = harness();
  const res = await tool.execute('id', { mode: 'screens', ref: 'KEY1', depth: 3 }, null, null, { cwd: '/tmp/proj' });
  assert.deepEqual(calls.screens, [['KEY1', { depth: 3 }]]);
  assert.equal(res.content[0].text, 'SCREENS TEXT');
  assert.equal(res.details.mode, 'screens');
});

test('mode=node defaults depth to 2 and fields to all', async () => {
  const { tool, calls } = harness();
  await tool.execute('id', { mode: 'node', ref: 'KEY1', nodeId: '1:4' }, null, null, { cwd: '/tmp/proj' });
  assert.deepEqual(calls.node, [['KEY1', '1:4', { depth: 2, fields: 'all' }]]);
  await tool.execute('id', { mode: 'node', ref: 'KEY1', fields: 'layout+text', depth: 1 }, null, null, {});
  assert.deepEqual(calls.node[1], ['KEY1', undefined, { depth: 1, fields: 'layout+text' }]);
});

test('mode=images resolves outDir against the session cwd and reports saved files', async () => {
  const { tool, calls } = harness();
  const res = await tool.execute('id', { mode: 'images', ref: 'KEY1', nodeIds: ['1:4'], outDir: 'assets', format: 'svg' }, null, null, { cwd: '/tmp/proj' });
  assert.deepEqual(calls.images, [['KEY1', ['1:4'], '/tmp/proj/assets', { format: 'svg', scale: 2 }]]);
  assert.equal(res.content[0].text, 'saved /tmp/proj/figma-assets/1-4.png');
  assert.deepEqual(res.details.saved, ['/tmp/proj/figma-assets/1-4.png']);
});

test('an empty images result is reported instead of failing', async () => {
  const { tool } = harness({ images: [] });
  const res = await tool.execute('id', { mode: 'images', ref: 'KEY1' }, null, null, { cwd: '/tmp/proj' });
  assert.match(res.content[0].text, /no images returned/);
});

test('truncation is applied to text modes and surfaced in details', async () => {
  const { tool } = harness({
    truncate: (text) => ({ text: `${text}\n\n[Output truncated: 1 of 9 lines...]`, truncation: { truncated: true }, fullOutputPath: '/tmp/full.txt' }),
  });
  const res = await tool.execute('id', { mode: 'screens', ref: 'KEY1' }, null, null, { cwd: '/tmp/proj' });
  assert.match(res.content[0].text, /\[Output truncated/);
  assert.equal(res.details.truncated, true);
  assert.equal(res.details.fullOutputPath, '/tmp/full.txt');
});

test('helper failures propagate (pi marks the tool call as errored)', async () => {
  const tool = createFigmaTool({
    getScreens: async () => { throw new Error('invalid fileKey ".."'); },
    getNode: async () => '',
    getImages: async () => [],
    truncate: (t) => ({ text: t, truncation: null, fullOutputPath: null }),
  });
  await assert.rejects(() => tool.execute('id', { mode: 'screens', ref: '..' }, null, null, {}), /invalid fileKey/);
});

test('mode=changed forwards ref and depth through the same truncation path', async () => {
  const { tool, calls } = harness();
  const res = await tool.execute('id', { mode: 'changed', ref: 'Key9', depth: 3 }, null, null, { cwd: '/tmp/proj' });
  assert.equal(res.content[0].text, 'CHANGED TEXT');
  assert.deepEqual(calls.changed, [['Key9', { depth: 3 }]]);
});
