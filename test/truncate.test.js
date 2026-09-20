// truncate.test.js — the conservative local cap used when no pi runtime is present.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { truncateForTool, spillToTempFile, formatSize, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from '../src/truncate.js';

test('output that fits is returned byte-for-byte, without spilling', () => {
  const text = 'a\nb\nc\n';
  const out = truncateForTool(text);
  assert.equal(out.text, text);
  assert.equal(out.truncation, null);
  assert.equal(out.fullOutputPath, null);
});

test('a long body keeps whole lines from the head and reports where the rest went', () => {
  const text = Array.from({ length: 500 }, (_, i) => `line-${i}`).join('\n');
  const out = truncateForTool(text, { maxLines: 3, maxBytes: DEFAULT_MAX_BYTES });
  assert.ok(out.text.startsWith('line-0\nline-1\nline-2\n'), out.text);
  assert.match(out.text, /\[Output truncated: 3 of 500 lines \(20B of \d+(\.\d)?KB\)\. Full output saved to: .+\]$/);
  assert.equal(readFileSync(out.fullOutputPath, 'utf8'), text, 'spilled file must hold the full output');
});

test('the byte cap also applies, not just the line cap', () => {
  const text = 'aaaa\nbbbb\ncccc';
  const out = truncateForTool(text, { maxLines: 100, maxBytes: 6 });
  assert.equal(out.text.split('\n')[0], 'aaaa');
  assert.match(out.text, /Full output saved to: /);
});

test('a single oversized line is cut rather than dropped', () => {
  const text = 'x'.repeat(200) + '\ntail';
  const out = truncateForTool(text, { maxLines: 10, maxBytes: 50 });
  assert.equal(out.text.split('\n')[0].length, 50);
  assert.match(out.text, /\[Output truncated: 1 of 2 lines/);
});

test('formatSize mirrors the pi wording', () => {
  assert.equal(formatSize(512), '512B');
  assert.equal(formatSize(2048), '2.0KB');
  assert.equal(formatSize(5 * 1024 * 1024), '5.0MB');
});

test('spillToTempFile writes readable content outside the repo', () => {
  const path = spillToTempFile('hello');
  assert.equal(readFileSync(path, 'utf8'), 'hello');
  assert.ok(!path.startsWith(process.cwd()), path);
});

test('the documented defaults are the pi defaults', () => {
  assert.equal(DEFAULT_MAX_BYTES, 51200);
  assert.equal(DEFAULT_MAX_LINES, 2000);
});
