// cache.test.js — fetchCached: verified hits, unverified offline fallback, containment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchCached } from '../src/api.js';

const KEY = 'FixtureKey1';
const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });

function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'fb-cache-test-'));
  const prev = process.env.FIGMA_BRIDGE_CACHE_DIR;
  const realFetch = globalThis.fetch;
  process.env.FIGMA_BRIDGE_CACHE_DIR = root;
  t.after(() => {
    globalThis.fetch = realFetch;
    if (prev === undefined) delete process.env.FIGMA_BRIDGE_CACHE_DIR;
    else process.env.FIGMA_BRIDGE_CACHE_DIR = prev;
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

const online = (lastModified, payload) => async (input) => {
  const url = String(input);
  if (url.includes('?depth=1')) return json({ lastModified });
  return json(payload);
};

test('cold fetch populates the cache, warm fetch is a verified hit', async (t) => {
  harness(t);
  globalThis.fetch = online('T1', { name: 'Doc', document: { children: [] } });
  const cold = await fetchCached(KEY, 'file-depth2', '/files/' + KEY + '?depth=2');
  assert.equal(cold.cached, false);
  assert.equal(cold.unverified, undefined);
  assert.equal(cold.data.name, 'Doc');

  globalThis.fetch = online('T1', { name: 'SHOULD NOT BE USED', document: { children: [] } });
  const warm = await fetchCached(KEY, 'file-depth2', '/files/' + KEY + '?depth=2');
  assert.equal(warm.cached, true);
  assert.equal(warm.unverified, undefined);
  assert.equal(warm.data.name, 'Doc');
  assert.equal(warm.lastModified, 'T1');
});

test('a changed lastModified invalidates the cache', async (t) => {
  harness(t);
  globalThis.fetch = online('T1', { name: 'Doc', document: { children: [] } });
  await fetchCached(KEY, 'file-depth2', '/files/' + KEY + '?depth=2');
  globalThis.fetch = online('T2', { name: 'Doc v2', document: { children: [] } });
  const fresh = await fetchCached(KEY, 'file-depth2', '/files/' + KEY + '?depth=2');
  assert.equal(fresh.cached, false);
  assert.equal(fresh.data.name, 'Doc v2');
});

test('a failing metadata check falls back to the cached copy, flagged unverified', async (t) => {
  harness(t);
  globalThis.fetch = online('T1', { name: 'Doc', document: { children: [] } });
  await fetchCached(KEY, 'file-depth2', '/files/' + KEY + '?depth=2');

  globalThis.fetch = async () => { throw new Error('simulated ENETUNREACH'); };
  const fallback = await fetchCached(KEY, 'file-depth2', '/files/' + KEY + '?depth=2');
  assert.equal(fallback.cached, true);
  assert.equal(fallback.unverified, true);
  assert.equal(fallback.data.name, 'Doc');
  assert.equal(fallback.lastModified, 'T1');
});

test('a failing request with no cache keeps the original error', async (t) => {
  harness(t);
  globalThis.fetch = async () => { throw new Error('simulated ENETUNREACH'); };
  await assert.rejects(() => fetchCached(KEY, 'file-depth2', '/files/' + KEY + '?depth=2'), /ENETUNREACH/);
});

test('cache paths can never escape the cache root', async (t) => {
  const root = harness(t);
  globalThis.fetch = online('T1', { name: 'Doc', document: { children: [] } });
  await assert.rejects(() => fetchCached('..', 'x', '/files/x'), /outside/);
  await assert.rejects(() => fetchCached('../../tmp/evil', 'x', '/files/x'), /outside/);
  await assert.rejects(() => fetchCached('/tmp/evil', 'x', '/files/x'), /outside/);
  assert.equal(root, process.env.FIGMA_BRIDGE_CACHE_DIR);
});
