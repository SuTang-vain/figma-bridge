// pi-truncate.test.js — the adapter that prefers pi's own truncation helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTruncator } from '../src/pi-truncate.js';

const fakeCore = (result) => ({
  DEFAULT_MAX_BYTES: 10,
  DEFAULT_MAX_LINES: 2,
  formatSize: (bytes) => `${bytes}B`,
  truncateHead: (content, options) => ({ ...result, _options: options, _input: content }),
});

test('pi helpers are used, with pi defaults forwarded and a spill note appended', () => {
  const truncate = createTruncator(fakeCore({ truncated: true, content: 'KEPT', outputLines: 1, totalLines: 9, outputBytes: 4, totalBytes: 40 }), {
    spill: () => '/tmp/full.txt',
  });
  const out = truncate('a\nb\nc');

  assert.equal(out.fullOutputPath, '/tmp/full.txt');
  assert.equal(out.text, 'KEPT\n\n[Output truncated: 1 of 9 lines (4B of 40B). Full output saved to: /tmp/full.txt]');
  assert.equal(out.truncation._options.maxBytes, 10);
  assert.equal(out.truncation._options.maxLines, 2);
});

test('per-call limits override the pi defaults', () => {
  let seen = null;
  const core = {
    DEFAULT_MAX_BYTES: 10,
    DEFAULT_MAX_LINES: 2,
    formatSize: (bytes) => `${bytes}B`,
    truncateHead: (content, options) => {
      seen = options;
      return { truncated: false, content, outputLines: 1, totalLines: 1, outputBytes: 1, totalBytes: 1 };
    },
  };
  const truncate = createTruncator(core);

  truncate('x', { maxLines: 7, maxBytes: 8 });
  assert.deepEqual(seen, { maxLines: 7, maxBytes: 8 });

  truncate('x');
  assert.deepEqual(seen, { maxLines: 2, maxBytes: 10 }, 'pi defaults are forwarded when no override is given');
});

test('untruncated output passes through untouched and never spills', () => {
  let spilled = 0;
  const truncate = createTruncator(fakeCore({ truncated: false, content: 'ignored' }), { spill: () => { spilled++; return '/tmp/nope'; } });
  const out = truncate('short body');
  assert.equal(out.text, 'short body');
  assert.equal(out.fullOutputPath, null);
  assert.equal(spilled, 0);
});

test('without pi core it falls back to the local conservative cap', () => {
  const truncate = createTruncator(null, { spill: () => '/tmp/local.txt' });
  const text = Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n');

  const cut = truncate(text, { maxLines: 4, maxBytes: 1024 });
  assert.ok(cut.text.startsWith('l0\nl1\nl2\nl3'), cut.text);
  assert.match(cut.text, /Full output saved to: \/tmp\/local\.txt/);

  const whole = truncate('a\nb');
  assert.equal(whole.text, 'a\nb');
  assert.equal(whole.fullOutputPath, null);
});
