// security.test.js — audit-hardening guards: image URL allowlist, outDir symlink escape,
// private permissions on cached/spilled design data, and CLI option validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertImageUrl, assertImageOptions, assertNoSymlinkEscape, downloadImages, fetchCached,
} from '../src/api.js';
import { assertDepth } from '../src/url.js';
import { spillToTempFile } from '../src/truncate.js';

const json = (obj) => new Response(JSON.stringify(obj), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

test('image URLs: https figma/aws hosts pass; http, lookalikes and foreign hosts refuse', () => {
  for (const ok of [
    'https://api.figma.com/x',
    'https://s3-alpha-sig.figma.com/img/x',
    'https://www.figma.com/api/img/x',
    'https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/x',
    'https://cdn.figmausercontent.com/x',
  ]) assert.doesNotThrow(() => assertImageUrl(ok), ok);
  for (const bad of [
    'http://s3-alpha-sig.figma.com/x',      // plaintext http
    'https://evil-figma.com/x',              // lookalike host
    'https://figma.com.evil.com/x',          // suffix spoof
    'https://example.com/x',                 // foreign host
    'https://169.254.169.254/latest/meta-data', // link-local SSRF target
    'not a url',
  ]) assert.throws(() => assertImageUrl(bad), /refusing image URL/, bad);
});

test('image options: format must be known, scale clamped to 0.01-4', () => {
  assert.doesNotThrow(() => assertImageOptions({ format: 'webp', scale: 0.5 }));
  assert.throws(() => assertImageOptions({ format: 'exe' }), /unknown --format/);
  assert.throws(() => assertImageOptions({ format: 'png', scale: 0 }), /--scale/);
  assert.throws(() => assertImageOptions({ format: 'png', scale: 5 }), /--scale/);
  assert.throws(() => assertImageOptions({ format: 'png', scale: Number.NaN }), /--scale/);
});

test('outDir symlink escape: lexical-inside-cwd but real-outside is refused; absolute paths stay allowed', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'fb-sec-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'proj');
  mkdirSync(cwd);
  const outside = join(root, 'elsewhere');
  mkdirSync(outside);
  symlinkSync(outside, join(cwd, 'assets'));          // lexical: inside cwd; real: outside
  mkdirSync(join(outside, 'deeper'));                 // so realpath of cwd/assets/deeper resolves
  assert.throws(() => assertNoSymlinkEscape('assets', cwd), /symlink that escapes/);
  assert.throws(() => assertNoSymlinkEscape('./assets/deeper', cwd), /symlink that escapes/);
  assert.doesNotThrow(() => assertNoSymlinkEscape(outside, cwd));  // absolute = explicit user choice
  const plain = join(cwd, 'plain');
  mkdirSync(plain);
  assert.doesNotThrow(() => assertNoSymlinkEscape('plain', cwd));  // no symlink at all
});

function netHarness(t) {
  const root = mkdtempSync(join(tmpdir(), 'fb-sec-net-'));
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
  return root;
}

test('cached raw JSON and downloaded images are written 0o600 (dirs 0o700)', async (t) => {
  const root = netHarness(t);
  const figmaHostPng = 'https://s3-alpha-sig.figma.com/img/x.png';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('?depth=1')) return json({ lastModified: 'T1' });
    if (url.includes('/v1/images/')) return json({ err: null, images: { '1:4': figmaHostPng } });
    if (url === figmaHostPng) return new Response(Buffer.from('89504e470d0a1a0a', 'hex'), { status: 200 });
    if (url.includes('/v1/files/')) return json({ name: 'Doc', document: { children: [] } });
    throw new Error('unexpected fetch: ' + url);
  };

  await fetchCached('Key1', 'file-depth2', '/files/Key1?depth=2');
  const keyDir = join(root, 'cache', 'Key1');
  assert.equal(statSync(keyDir).mode & 0o777, 0o700, 'cache dir must be private');
  const rawFile = readdirSync(keyDir).find((f) => f.startsWith('raw-') && f.endsWith('.json'));
  assert.ok(rawFile, 'raw cache file must exist');
  assert.equal(statSync(join(keyDir, rawFile)).mode & 0o777, 0o600, 'cached design data must be owner-only');

  const outDir = join(root, 'proj');
  mkdirSync(outDir, { recursive: true });
  const saved = await downloadImages('Key1', ['1:4'], outDir, { format: 'png', scale: 2, cwd: root });
  assert.equal(saved.length, 1);
  assert.equal(statSync(saved[0]).mode & 0o777, 0o600, 'downloaded image must be owner-only');
});

test('downloadImages refuses a malicious URL from a tampered API response', async (t) => {
  const root = netHarness(t);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/v1/images/')) {
      return json({ err: null, images: { '1:4': 'https://evil.example/x.png' } });
    }
    throw new Error('the download itself must never hit the network here');
  };
  await assert.rejects(
    () => downloadImages('Key1', ['1:4'], join(root, 'out'), { cwd: root }),
    /refusing image URL host/,
  );
});

test('spill files are written 0o600', () => {
  const file = spillToTempFile('x'.repeat(100));
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('depth is clamped to integers 1-3', () => {
  assert.equal(assertDepth(1), 1);
  assert.equal(assertDepth('3'), 3);
  for (const bad of [0, -1, 4, 2.5, 'x', true, undefined, null]) {
    assert.throws(() => assertDepth(bad), /--depth/, String(bad));
  }
});
