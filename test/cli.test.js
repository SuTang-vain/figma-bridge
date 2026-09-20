// cli.test.js — end-to-end CLI behaviour with globalThis.fetch stubbed out, so these
// tests never touch the network, the real cache, or the user's Figma token.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(ROOT, 'bin', 'figma-bridge.js');
const STUB = join(ROOT, 'test', 'fixtures', 'stub-fetch.mjs');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const temps = [];
const tmp = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function run(args, { workdir, cache, mode = 'ok' } = {}) {
  const cwd = workdir || tmp('fb-cli-cwd-');
  const cacheDir = cache || tmp('fb-cli-cache-');
  const proc = spawnSync(process.execPath, ['--import', STUB, BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      FIGMA_API_KEY: 'stub-token',
      FIGMA_BRIDGE_CACHE_DIR: cacheDir,
      FB_STUB_MODE: mode,
    },
  });
  return { ...proc, cwd, cacheDir };
}

test('--help/-h print usage and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const { status, stdout } = run([flag]);
    assert.equal(status, 0, flag);
    assert.ok(stdout.includes('figma-bridge screens'), stdout);
  }
  const noArgs = run([]);
  assert.equal(noArgs.status, 0);
  assert.ok(noArgs.stdout.includes('figma-bridge screens'));
});

test('--version/-v print the package version and exit 0', () => {
  for (const flag of ['--version', '-v']) {
    const { status, stdout } = run([flag]);
    assert.equal(status, 0, flag);
    assert.equal(stdout.trim(), VERSION);
  }
});

test('an unknown command fails loudly on stderr', () => {
  const { status, stdout, stderr } = run(['bogus']);
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.ok(stderr.includes("unknown command 'bogus'"), stderr);
});

test('screens lists frames and never prints a zero child count', () => {
  const { status, stdout } = run(['screens', 'FixtureKey1']);
  assert.equal(status, 0, stdout);
  assert.ok(stdout.includes('[PAGE] "Page 1" #0:1'), stdout);
  assert.ok(stdout.includes('[FRAME] "Screen" #1:4 375x812'), stdout);
  assert.ok(stdout.includes('[FRAME] "Second" #2:0 320x640 (2 children)'), stdout);
  assert.ok(!stdout.includes('(0 children)'), stdout);
});

test('node prints the simplified subtree', () => {
  const { status, stdout } = run(['node', 'FixtureKey1', '1:4', '--depth', '1', '--fields', 'layout+text']);
  assert.equal(status, 0, stdout);
  assert.ok(stdout.includes('[FRAME] "Screen" #1:4'), stdout);
  assert.ok(stdout.includes('[TEXT] #2:1'), stdout);
});

test('images honors -o and writes the rendered file there', () => {
  const cwd = tmp('fb-cli-cwd-');
  const { status, stdout } = run(['images', 'FixtureKey1', '1:4', '-o', 'custom-out'], { workdir: cwd });
  assert.equal(status, 0, stdout);
  assert.ok(existsSync(join(cwd, 'custom-out', '1-4.png')), `expected custom-out/1-4.png in ${readdirSync(cwd)}`);
  assert.ok(!existsSync(join(cwd, 'figma-assets')), 'the default directory must not be created when -o is given');
});

test('images without -o falls back to ./figma-assets', () => {
  const cwd = tmp('fb-cli-cwd-');
  const { status } = run(['images', 'FixtureKey1', '1:4'], { workdir: cwd });
  assert.equal(status, 0);
  assert.ok(existsSync(join(cwd, 'figma-assets', '1-4.png')), readdirSync(cwd).join(','));
});

test('path-like file keys are rejected before anything is created', () => {
  const { status, stderr, cacheDir } = run(['screens', '../../../../tmp/fb-should-not-exist']);
  assert.equal(status, 1);
  assert.ok(stderr.includes('invalid fileKey'), stderr);
  assert.equal(readdirSync(cacheDir).length, 0, 'nothing may be written to the cache for an invalid key');
});

test('an unknown --fields preset fails before any request', () => {
  const { status, stderr } = run(['node', 'FixtureKey1', '1:4', '--fields', 'nope']);
  assert.equal(status, 1);
  assert.ok(stderr.includes("unknown --fields 'nope'"), stderr);
});

test('a warm cache keeps working when the network is down, marked unverified', () => {
  const cache = tmp('fb-cli-cache-');
  const first = run(['screens', 'FixtureKey1'], { cache });
  assert.equal(first.status, 0, first.stdout);
  assert.ok(!first.stdout.includes('unverified'), first.stdout);

  const offline = run(['screens', 'FixtureKey1'], { cache, mode: 'down' });
  assert.equal(offline.status, 0, offline.stderr);
  assert.ok(offline.stdout.includes('(cache hit, unverified)'), offline.stdout);
});

test('a cold cache with the network down still fails', () => {
  const { status, stderr } = run(['screens', 'FixtureKey1'], { mode: 'down' });
  assert.equal(status, 1);
  assert.ok(stderr.includes('ENETUNREACH'), stderr);
});
