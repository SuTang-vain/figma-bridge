// stub-fetch.mjs — preloaded into child CLI processes by the tests so no test ever
// touches the network. Controlled by FB_STUB_MODE: "ok" (default) or "down".
import { readFileSync } from 'node:fs';

const FIXTURE = JSON.parse(readFileSync(new URL('./frame.json', import.meta.url), 'utf8'));
const MODE = process.env.FB_STUB_MODE || 'ok';
const LAST_MODIFIED = FIXTURE.lastModified;

const json = (obj) => new Response(JSON.stringify(obj), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

const FILE_TREE = {
  name: FIXTURE.name,
  lastModified: LAST_MODIFIED,
  document: {
    id: '0:0', name: 'Document', type: 'DOCUMENT',
    children: [{
      id: '0:1', name: 'Page 1', type: 'CANVAS',
      children: [
        { id: '1:4', name: 'Screen', type: 'FRAME', absoluteBoundingBox: { width: 375, height: 812 }, children: [] },
        { id: '2:0', name: 'Second', type: 'FRAME', absoluteBoundingBox: { width: 320, height: 640 }, children: [{}, {}] },
      ],
    }],
  },
};

globalThis.fetch = async (input) => {
  const url = String(input);
  if (MODE === 'down') throw new Error('simulated ENETUNREACH');
  if (url.includes('/nodes?')) return json(FIXTURE);
  if (url.includes('/v1/images/')) {
    return json({ err: null, images: { '1:4': 'https://stub.invalid/1-4.png' } });
  }
  if (url.startsWith('https://stub.invalid/')) {
    return new Response(Buffer.from('89504e470d0a1a0a', 'hex'), { status: 200 });
  }
  if (url.includes('/v1/files/')) return json(FILE_TREE);
  throw new Error('stub-fetch: unexpected URL ' + url);
};
