// changed.test.js — snapshot-based incremental diff: baseline, no-change, modified,
// added+removed. All fetches are stubbed; the cache and snapshots go to a temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getChanged } from '../src/helpers.js';

const KEY = 'ChangeKey1';
const json = (obj) => new Response(JSON.stringify(obj), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'fb-changed-test-'));
  const prev = process.env.FIGMA_BRIDGE_CACHE_DIR;
  const prevKey = process.env.FIGMA_API_KEY;
  const realFetch = globalThis.fetch;
  process.env.FIGMA_BRIDGE_CACHE_DIR = join(root, 'cache');
  process.env.FIGMA_API_KEY = 'test-token';
  t.after(() => {
    globalThis.fetch = realFetch;
    if (prev === undefined) delete process.env.FIGMA_BRIDGE_CACHE_DIR;
    else process.env.FIGMA_BRIDGE_CACHE_DIR = prev;
    if (prevKey === undefined) delete process.env.FIGMA_API_KEY;
    else process.env.FIGMA_API_KEY = prevKey;
    rmSync(root, { recursive: true, force: true });
  });
  return join(root, 'cache');
}

// A minimal file tree: Document → Canvas → frames.
const frame = (id, name, extra = {}) => ({
  id, name, type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
  ...extra,
});
const tree = (lastModified, frames) => ({
  name: 'Doc',
  lastModified,
  document: {
    id: '0:0', name: 'Document', type: 'DOCUMENT',
    children: [{ id: '0:1', name: 'Page 1', type: 'CANVAS', children: frames }],
  },
});

// Serve `state.tree` for every file fetch, whatever the depth.
function stub(state) {
  globalThis.fetch = async () => json(state.tree);
}

test('first call saves a baseline and reports no diff', async (t) => {
  const cache = harness(t);
  stub({ tree: tree('T1', [frame('1:4', 'Screen'), frame('2:0', 'Second')]) });

  const out = await getChanged(KEY);
  assert.match(out, /baseline saved for ChangeKey1 \(depth 2, \d+ nodes/, out);
  assert.match(out, /lastModified T1/);
  assert.ok(existsSync(join(cache, KEY, 'snapshot-tree-d2.json')), 'snapshot must be persisted');
});

test('second call with an unchanged tree reports no changes', async (t) => {
  harness(t);
  stub({ tree: tree('T1', [frame('1:4', 'Screen'), frame('2:0', 'Second')]) });

  await getChanged(KEY);
  const out = await getChanged(KEY);
  assert.match(out, /no changes/, out);
  assert.match(out, /\+0 added, ~0 modified, -0 removed/);
});

test('a modified node is listed with its new name', async (t) => {
  harness(t);
  const state = { tree: tree('T1', [frame('1:4', 'Screen'), frame('2:0', 'Second')]) };
  stub(state);

  await getChanged(KEY);
  state.tree = tree('T2', [frame('1:4', 'Screen'), frame('2:0', 'Second', { opacity: 0.9 })]);
  const out = await getChanged(KEY);
  assert.match(out, /~1 modified/, out);
  assert.match(out, /~ 2:0 "Second" \(FRAME\)/, out);
  assert.match(out, /file lastModified T2/);
  assert.doesNotMatch(out, /~ 1:4/, 'untouched frames must not be listed');
});

test('added and removed nodes are listed against the previous baseline', async (t) => {
  harness(t);
  const state = { tree: tree('T1', [frame('1:4', 'Screen'), frame('2:0', 'Second')]) };
  stub(state);

  await getChanged(KEY);
  state.tree = tree('T3', [frame('1:4', 'Screen'), frame('3:0', 'Fresh')]);
  const out = await getChanged(KEY);
  assert.match(out, /\+1 added, ~0 modified, -1 removed/, out);
  assert.match(out, /\+ 3:0 "Fresh" \(FRAME\)/, out);
  assert.match(out, /- 2:0 "Second" \(FRAME\)/, out);
});

test('a corrupt snapshot falls back to a fresh baseline instead of crashing', async (t) => {
  const cache = harness(t);
  stub({ tree: tree('T1', [frame('1:4', 'Screen')]) });
  const snapDir = join(cache, KEY);
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(snapDir, { recursive: true });
  writeFileSync(join(snapDir, 'snapshot-tree-d2.json'), '{not json', { mode: 0o600 });

  const out = await getChanged(KEY);
  assert.match(out, /baseline saved/, out);
});
