// pipeline.test.js — integration check: the Framelink library still simplifies our fixture
// and format.js still serializes the result the way agents expect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simplifyRawFigmaObject, allExtractors, layoutAndText, contentOnly, visualsOnly, layoutOnly } from 'figma-developer-mcp';
import { formatDesign } from '../src/format.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/frame.json', import.meta.url), 'utf8'));

test('the library exports this project depends on are present', () => {
  assert.equal(typeof simplifyRawFigmaObject, 'function', 'simplifyRawFigmaObject must stay a function');
  // The field presets are extractor collections, not single functions.
  for (const [name, preset] of Object.entries({ allExtractors, layoutAndText, contentOnly, visualsOnly, layoutOnly })) {
    assert.ok(Array.isArray(preset) && preset.length > 0, `${name} must stay a non-empty extractor array`);
  }
});

test('library simplification + formatting yields the expected tree', async () => {
  const design = await simplifyRawFigmaObject(raw, allExtractors, { maxDepth: 2 });
  const out = formatDesign(design, { meta: { lastModified: raw.lastModified, cached: true, unverified: true } });

  assert.ok(out.includes('NAME: "Fixture File"'), out);
  assert.ok(out.includes('LAST_MODIFIED: 2026-01-02T03:04:05Z (cache hit, unverified)'), out);
  assert.ok(out.includes('[FRAME] "Screen" #1:4'), out);
  assert.ok(out.includes('  [TEXT] #2:1'), 'TEXT name duplicating its content is dropped');
  assert.ok(out.includes('    [RECTANGLE] "Inner" #2:4'), 'nested children keep indentation');
  assert.ok(out.includes('opacity=0.5') && out.includes('borderRadius="12.5px"') && out.includes('componentId="9:99"'), out);
  assert.doesNotMatch(out, /\d+\.\d{3,}/, 'coordinates must be rounded to 2 decimals');
});

test('the layout+text preset drops visual-only data', async () => {
  const all = formatDesign(await simplifyRawFigmaObject(raw, allExtractors, { maxDepth: 2 }));
  const narrow = formatDesign(await simplifyRawFigmaObject(raw, layoutAndText, { maxDepth: 2 }));
  assert.ok(narrow.length < all.length, `${narrow.length} should be < ${all.length}`);
  assert.ok(!narrow.includes('componentId='), narrow);
});
