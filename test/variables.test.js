// variables.test.js — design tokens as CSS custom properties: value shapes, aliases,
// name sanitisation/collisions, mode selection, and the Enterprise-gated error paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatVariables, colorToHex, tokenName } from '../src/variables.js';
import { getVariables } from '../src/helpers.js';

const META = {
  variableCollections: {
    c1: {
      id: 'c1', name: 'Primitives', defaultModeId: 'm1',
      modes: [{ modeId: 'm1', name: 'Light' }, { modeId: 'm2', name: 'Dark' }],
    },
    c2: {
      id: 'c2', name: 'Semantics', defaultModeId: 'm3',
      modes: [{ modeId: 'm3', name: 'Default' }],
    },
  },
  variables: {
    v1: { id: 'v1', name: 'color/primary', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 }, m2: { r: 0, g: 0, b: 1, a: 1 } } },
    v2: { id: 'v2', name: 'color/primary/80', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { r: 0, g: 1, b: 0, a: 0.5 }, m2: { r: 0, g: 1, b: 0, a: 0.5 } } },
    v3: { id: 'v3', name: 'color/link', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v1' }, m2: { type: 'VARIABLE_ALIAS', id: 'v1' } } },
    v4: { id: 'v4', name: 'space/md', variableCollectionId: 'c1', resolvedType: 'FLOAT',
      valuesByMode: { m1: 16, m2: 16 } },
    v5: { id: 'v5', name: 'space-md', variableCollectionId: 'c1', resolvedType: 'FLOAT',
      valuesByMode: { m1: 24, m2: 24 } },
    v6: { id: 'v6', name: 'content/title', variableCollectionId: 'c1', resolvedType: 'STRING',
      valuesByMode: { m1: 'Hello', m2: 'Hello' } },
    v7: { id: 'v7', name: 'flag/enabled', variableCollectionId: 'c1', resolvedType: 'BOOLEAN',
      valuesByMode: { m1: true, m2: false } },
    v8: { id: 'v8', name: 'color/broken', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'nope' }, m2: { type: 'VARIABLE_ALIAS', id: 'nope' } } },
    v9: { id: 'v9', name: 'hidden/secret', variableCollectionId: 'c1', resolvedType: 'FLOAT',
      hiddenFromPublishing: true, valuesByMode: { m1: 1, m2: 1 } },
    v10: { id: 'v10', name: 'radius/sm', variableCollectionId: 'c2', resolvedType: 'FLOAT',
      valuesByMode: { m3: 2 } },
    v11: { id: 'v11', name: '2xl/size', variableCollectionId: 'c2', resolvedType: 'FLOAT',
      valuesByMode: { m3: 64 } },
  },
};

test('colorToHex: opaque 6-digit, alpha becomes 8-digit', () => {
  assert.equal(colorToHex({ r: 1, g: 0, b: 0 }), '#FF0000');
  assert.equal(colorToHex({ r: 0, g: 1, b: 0, a: 0.5 }), '#00FF0080');
  assert.equal(colorToHex({ r: 0, g: 0, b: 0, a: 0 }), '#00000000');
});

test('tokenName: sanitises slashes, prefixes leading digits, dedupes collisions', () => {
  const used = new Map();
  assert.equal(tokenName('color/primary', used), 'color-primary');
  assert.equal(tokenName('color/primary', used), 'color-primary-2');
  assert.equal(tokenName('2xl/size', used), 'x-2xl-size');
  assert.equal(tokenName('///', used), 'unnamed');
});

test('formatVariables renders one :root block per collection with resolved aliases', () => {
  const out = formatVariables(META);
  assert.match(out, /collection "Primitives" — mode "Light"/);
  assert.match(out, /collection "Semantics" — mode "Default"/);
  assert.match(out, /--color-primary: #FF0000;/);
  assert.match(out, /--color-primary-80: #00FF0080;/, 'slashed name becomes a nested token, alpha stays in hex');
  assert.match(out, /--color-link: var\(--color-primary\);/, 'alias resolves to the target token');
  assert.match(out, /--space-md: 24;/);
  assert.match(out, /--space-md-2: 16;/, 'colliding names get a deterministic suffix');
  assert.match(out, /--content-title: "Hello";/);
  assert.match(out, /--flag-enabled: true;/);
  assert.match(out, /--radius-sm: 2;/);
  assert.match(out, /--x-2xl-size: 64;/, 'leading digit is not a valid CSS ident');
  assert.match(out, /\/\* --color-broken: unresolved alias nope \*\//);
  assert.doesNotMatch(out, /hidden-secret/, 'hidden-from-publishing variables are skipped');
});

test('formatVariables honours the requested collection mode', () => {
  const out = formatVariables(META, { mode: 'Dark' });
  assert.match(out, /mode "Dark"/);
  assert.match(out, /--color-primary: #0000FF;/);
  assert.match(out, /--flag-enabled: false;/);
});

test('formatVariables reports collections missing the requested mode instead of crashing', () => {
  const out = formatVariables(META, { mode: 'Nope' });
  assert.match(out, /mode 'Nope' not in this collection.*skipped/);
  assert.doesNotMatch(out, /:root \{/);
});

test('formatVariables on an empty file says so plainly', () => {
  assert.match(formatVariables({ variableCollections: {}, variables: {} }), /no published variables/);
  assert.match(formatVariables(null), /no published variables/);
});

function netHarness(t) {
  const root = mkdtempSync(join(tmpdir(), 'fb-vars-test-'));
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
}

test('getVariables renders tokens end to end', async (t) => {
  netHarness(t);
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 200, error: null, meta: META }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const out = await getVariables('VarKey1');
  assert.match(out, /--color-primary: #FF0000;/);
});

test('getVariables: a 403 becomes an actionable Enterprise-plan message', async (t) => {
  netHarness(t);
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 403, error: true, message: 'No permission' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(() => getVariables('VarKey1'), /Enterprise plan.*403/);
});

test('getVariables: a non-403 API error is rethrown verbatim', async (t) => {
  netHarness(t);
  globalThis.fetch = async () => new Response('not found body', { status: 404 });
  await assert.rejects(() => getVariables('VarKey1'), /Figma API 404/);
});

test('getVariables: an error payload without HTTP failure is reported clearly', async (t) => {
  netHarness(t);
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 200, error: true, meta: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(() => getVariables('VarKey1'), /variables endpoint returned an error/);
});
