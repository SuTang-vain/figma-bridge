// format.test.js — the compact serializer: omitting noise, rounding, escaping, ordering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDesign, formatScreens, cacheNote } from '../src/format.js';

const design = (nodes, extra = {}) => ({ name: 'Doc', nodes, ...extra });
// Node lines only, so assertions do not depend on whether a metadata line is present.
const nodesOf = (out) => out.split('\n').slice(out.split('\n').indexOf('NODES:') + 1);

test('default absolute layout is dropped, real layout is kept', () => {
  const out = formatDesign(design([
    { id: '1:1', type: 'FRAME', layout: { mode: 'none' } },
    { id: '1:2', type: 'FRAME', layout: { mode: 'none', dimensions: { width: 10, height: 20 } } },
    { id: '1:3', type: 'FRAME', layout: { mode: 'vertical', itemSpacing: 8 } },
  ]));
  const lines = nodesOf(out);
  assert.match(lines[0], /^\[FRAME\] #1:1$/);
  assert.match(lines[1], /layout=\{mode:"none",dimensions:\{width:10,height:20\}\}/);
  assert.match(lines[2], /layout=\{mode:"vertical",itemSpacing:8\}/);
});

test('a TEXT node whose name repeats its content keeps only the text', () => {
  const out = formatDesign(design([
    { id: '2:1', type: 'TEXT', name: 'Hello World', text: 'Hello\nWorld' },
    { id: '2:2', type: 'TEXT', name: 'Play', text: 'Play ▶' },
  ]));
  assert.match(out, /\[TEXT\] #2:1 layout=.*text="Hello\\nWorld"|\[TEXT\] #2:1 text="Hello\\nWorld"/);
  assert.ok(!out.includes('"Hello World"'), 'duplicate name should be omitted');
  assert.ok(out.includes('[TEXT] "Play"'), 'distinct name should be kept');
});

test('numbers are rounded and strings are JSON-escaped', () => {
  const out = formatDesign(design([
    { id: '3:1', type: 'RECTANGLE', opacity: 0.3333333, borderRadius: 12.5678 },
    { id: '3:2', type: 'TEXT', name: 'q', text: 'a"b\\c' },
  ]));
  assert.ok(out.includes('opacity=0.33'), out);
  assert.ok(out.includes('borderRadius=12.57'), out);
  assert.ok(out.includes('text="a\\"b\\\\c"'), out);
});

test('empty props and empty collections are omitted', () => {
  const out = formatDesign(design([
    { id: '4:1', type: 'FRAME', fills: [], effects: {}, strokes: null, opacity: undefined },
    { id: '4:2', type: 'TEXT', text: 'Hi', fills: [], effects: {} },
  ]));
  const lines = nodesOf(out);
  assert.match(lines[0], /^\[FRAME\] #4:1$/);
  assert.match(lines[1], /^\[TEXT\] #4:2 text="Hi"$/);
});

test('GLOBAL_VARS and COMPONENTS come before NODES, in insertion order', () => {
  const out = formatDesign(design(
    [{ id: '5:1', type: 'FRAME' }],
    {
      globalVars: { styles: { fills: ['#fff'], 'textStyles.title': { fontFamily: 'Inter', fontSize: 24 } } },
      components: { a: { id: '9:1', name: 'Button' }, b: { id: '9:2', name: 'Card' } },
    }
  ));
  const iVars = out.indexOf('GLOBAL_VARS:');
  const iComps = out.indexOf('COMPONENTS:');
  const iNodes = out.indexOf('NODES:');
  assert.ok(iVars > -1 && iComps > iVars && iNodes > iComps, out);
  assert.ok(out.includes('  fills: ["#fff"]'), out);
  assert.ok(out.includes('  #9:1 "Button"') && out.includes('  #9:2 "Card"'), out);
});

test('children are nested and arrays render inline', () => {
  const out = formatDesign(design([
    { id: '6:1', type: 'FRAME', children: [{ id: '6:2', type: 'RECTANGLE', fills: ['#000', '#fff'] }] },
  ]));
  assert.ok(out.includes('\n  [RECTANGLE] #6:2 fills=["#000", "#fff"]'), out);
});

test('the cache marker only appears for cached responses', () => {
  assert.equal(cacheNote(undefined), null);
  assert.equal(cacheNote({ cached: false }), null);
  assert.equal(cacheNote({ cached: true }), 'cache hit');
  assert.equal(cacheNote({ cached: true, unverified: true }), 'cache hit, unverified');
  const out = formatDesign(design([]), { meta: { lastModified: 'T', cached: true, unverified: true } });
  assert.ok(out.includes('LAST_MODIFIED: T (cache hit, unverified)'), out);
  const plain = formatDesign(design([]), { meta: { lastModified: 'T' } });
  assert.ok(plain.includes('LAST_MODIFIED: T\n'), plain);
});

test('formatScreens rounds dims and only counts children that exist', () => {
  const tree = {
    name: 'File', lastModified: 'T',
    document: { children: [{ id: '0:1', name: 'Page', type: 'CANVAS', children: [
      { id: '1:1', name: 'A', type: 'FRAME', absoluteBoundingBox: { width: 375.6, height: 812.2 }, children: [] },
      { id: '1:2', name: 'B', type: 'FRAME', absoluteBoundingBox: { width: 320, height: 640 } },
      { id: '1:3', name: 'C', type: 'FRAME', absoluteBoundingBox: { width: 100, height: 100 }, children: [{}, {}] },
    ] }] },
  };
  const out = formatScreens(tree);
  assert.ok(out.includes('[PAGE] "Page" #0:1'), out);
  assert.ok(out.includes('  [FRAME] "A" #1:1 376x812'), out);
  assert.ok(!out.includes('(0 children)'), out);
  assert.ok(out.includes('  [FRAME] "C" #1:3 100x100 (2 children)'), out);
});

test('formatScreens tolerates a document without pages', () => {
  assert.equal(formatScreens({ name: 'Empty', lastModified: 'T' }).split('\n').length, 2);
});
