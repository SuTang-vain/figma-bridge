// flags.test.js — argv parsing: long/short options, values vs booleans, positionals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags } from '../src/flags.js';

test('short and long options are equivalent', () => {
  assert.deepEqual(parseFlags(['KEY', '1:4', '-o', './assets']), { pos: ['KEY', '1:4'], flags: { o: './assets' } });
  assert.deepEqual(parseFlags(['KEY', '1:4', '--o', './assets']), { pos: ['KEY', '1:4'], flags: { o: './assets' } });
});

test('values are consumed, booleans are not', () => {
  assert.deepEqual(parseFlags(['KEY', '--depth', '1', '--fields', 'layout+text']), {
    pos: ['KEY'], flags: { depth: '1', fields: 'layout+text' },
  });
  assert.deepEqual(parseFlags(['KEY', '--help']), { pos: ['KEY'], flags: { help: true } });
});

test('an option followed by another option stays boolean', () => {
  assert.deepEqual(parseFlags(['--verbose', '--depth', '2']), { pos: [], flags: { verbose: true, depth: '2' } });
});

test('URLs and bare file keys stay positional', () => {
  const url = 'https://www.figma.com/design/ABC123/X?node-id=1-4';
  assert.deepEqual(parseFlags([url, '--depth', '1']), { pos: [url], flags: { depth: '1' } });
});

test('a lone dash is a value, not an option', () => {
  assert.deepEqual(parseFlags(['KEY', '-o', '-']), { pos: ['KEY'], flags: { o: '-' } });
});

test('unknown options are preserved for the caller to reject', () => {
  assert.deepEqual(parseFlags(['KEY', '--fields', 'nope']), { pos: ['KEY'], flags: { fields: 'nope' } });
});
