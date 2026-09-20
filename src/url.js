// url.js — accept Figma URLs anywhere a fileKey/nodeId is expected, and validate both.
// URL form: https://www.figma.com/design/<fileKey>/<slug>?node-id=1-4 → nodeId "1:4"

// Figma file keys are base62-ish; node ids are "1:4" or deep/instance forms like "I1:2;3:4".
const FILE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const NODE_ID = /^[A-Za-z0-9:;-]+$/;

// Validation also keeps user input out of filesystem paths (the cache is keyed by fileKey).
export function assertFileKey(fileKey) {
  const v = String(fileKey ?? '');
  if (!FILE_KEY.test(v)) {
    throw new Error(
      `invalid fileKey ${JSON.stringify(v)}: expected 1-128 chars of [A-Za-z0-9_-] ` +
      '(the code after /design/ in a Figma URL)'
    );
  }
  return v;
}

export function assertNodeId(nodeId) {
  const v = String(nodeId ?? '');
  if (!NODE_ID.test(v)) {
    throw new Error(`invalid nodeId ${JSON.stringify(v)}: expected [A-Za-z0-9:;-], e.g. 1:4`);
  }
  return v;
}

export function parseFigmaUrl(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('fileKey required');
  const raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) return { fileKey: assertFileKey(raw) };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { fileKey: assertFileKey(raw) };
  }
  const m = u.pathname.match(/\/(?:design|file|board|proto)\/([A-Za-z0-9]+)/);
  if (!m) throw new Error(`could not find a Figma file key in URL ${JSON.stringify(raw)}`);
  const nid = u.searchParams.get('node-id');
  return {
    fileKey: assertFileKey(m[1]),
    nodeId: nid ? assertNodeId(nid.replace(/-/g, ':')) : undefined,
  };
}
