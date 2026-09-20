// url.test.js — Figma URL parsing and the validation that keeps input out of filesystem paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFigmaUrl, assertFileKey, assertNodeId } from '../src/url.js';

test('bare file keys pass through unchanged', () => {
  assert.deepEqual(parseFigmaUrl('ymWuCHHNU22zse8nVTVmNN'), { fileKey: 'ymWuCHHNU22zse8nVTVmNN' });
});

test('full URLs yield fileKey and nodeId', () => {
  const cases = [
    ['https://www.figma.com/design/ABC123/Name?node-id=1-4', { fileKey: 'ABC123', nodeId: '1:4' }],
    ['https://www.figma.com/file/ABC123/Name', { fileKey: 'ABC123' }],
    ['https://www.figma.com/board/ABC123/X?node-id=0%3A1', { fileKey: 'ABC123', nodeId: '0:1' }],
    ['https://www.figma.com/proto/ABC123/X?node-id=1-4&t=abc', { fileKey: 'ABC123', nodeId: '1:4' }],
    ['https://www.figma.com/design/ABC123/X?node-id=I1-2%3B3-4', { fileKey: 'ABC123', nodeId: 'I1:2;3:4' }],
  ];
  for (const [input, want] of cases) assert.deepEqual(parseFigmaUrl(input), want, input);
});

test('non-figma URLs are rejected instead of being used as a key', () => {
  assert.throws(() => parseFigmaUrl('https://example.com/nope'), /could not find a Figma file key/);
});

test('path-like and empty references are rejected', () => {
  for (const bad of ['..', '../../../../tmp/x', '/etc/passwd', 'a/b', 'KEY WITH SPACE', '', '   ', null]) {
    assert.throws(() => parseFigmaUrl(bad), /fileKey|invalid fileKey/, String(bad));
  }
});

test('assertFileKey accepts base62 keys and rejects anything path-like', () => {
  assert.equal(assertFileKey('aZ09_-'), 'aZ09_-');
  for (const bad of ['..', 'a/b', '.hidden', '-leading', 'with space', 'x'.repeat(129)]) {
    assert.throws(() => assertFileKey(bad), /invalid fileKey/, bad);
  }
});

test('assertNodeId accepts colon/semicolon ids and rejects path-like input', () => {
  assert.equal(assertNodeId('1:4'), '1:4');
  assert.equal(assertNodeId('I1:2;3:4'), 'I1:2;3:4');
  for (const bad of ['../../etc/x', '1:4/2:3', 'a b', '']) {
    assert.throws(() => assertNodeId(bad), /invalid nodeId/, bad);
  }
});
