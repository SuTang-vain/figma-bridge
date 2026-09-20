// api.js — Figma REST API access with token resolution and lastModified-based caching.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export function getToken() {
  if (process.env.FIGMA_API_KEY) return process.env.FIGMA_API_KEY;
  const keyFile = join(homedir(), '.config', 'figma', 'api-key');
  if (existsSync(keyFile)) {
    const t = readFileSync(keyFile, 'utf8').trim().split('\n')[0];
    if (t) return t;
  }
  throw new Error('FIGMA_API_KEY not set and ~/.config/figma/api-key missing');
}

const API = 'https://api.figma.com/v1';

async function apiFetch(path) {
  const res = await fetch(API + path, { headers: { 'X-Figma-Token': getToken() } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Figma API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Cache root is overridable so benchmarks and tests never touch the real user cache.
function cacheRoot() {
  return process.env.FIGMA_BRIDGE_CACHE_DIR || join(homedir(), '.cache', 'figma-bridge');
}

// Second line of defence: even a validated fileKey must stay inside the cache root.
function cacheDir(fileKey) {
  const root = resolve(cacheRoot());
  const dir = resolve(root, fileKey);
  if (!dir.startsWith(root + sep)) {
    throw new Error(`refusing to use a cache path outside ${root}: ${dir}`);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Fetch raw API JSON, reusing the cached copy when the file's lastModified is unchanged.
// If the metadata check itself fails (offline, rate-limited, lost permission) the cached
// copy is still served, flagged `unverified` so callers can say so instead of failing.
// `kind` distinguishes endpoints (e.g. 'file-depth2', 'nodes-1:4-depth3').
export async function fetchCached(fileKey, kind, path) {
  const dir = cacheDir(fileKey);
  const hash = createHash('sha1').update(kind).digest('hex').slice(0, 12);
  const rawPath = join(dir, `raw-${hash}.json`);
  const metaPath = join(dir, `raw-${hash}.meta`);
  const cachedCopy = () => JSON.parse(readFileSync(rawPath, 'utf8'));
  const hasCache = existsSync(rawPath) && existsSync(metaPath);

  let lastModified = null;
  let metaChecked = false;
  try {
    const meta = await apiFetch(`/files/${fileKey}?depth=1`);
    lastModified = meta.lastModified;
    metaChecked = true;
  } catch { /* offline or no permission — fall back to the local copy below */ }

  if (hasCache) {
    const cachedAt = readFileSync(metaPath, 'utf8');
    if (!metaChecked) {
      return { data: cachedCopy(), cached: true, unverified: true, lastModified: cachedAt };
    }
    if (cachedAt === lastModified) {
      return { data: cachedCopy(), cached: true, lastModified };
    }
  }
  const data = await apiFetch(path);
  if (lastModified) {
    writeFileSync(rawPath, JSON.stringify(data));
    writeFileSync(metaPath, lastModified);
  }
  return { data, cached: false, lastModified };
}

export async function fetchFileMeta(fileKey) {
  return apiFetch(`/files/${fileKey}?depth=1`);
}

export async function fetchFileTree(fileKey, depth = 2) {
  return fetchCached(fileKey, `file-depth${depth}`, `/files/${fileKey}?depth=${depth}`);
}

export async function fetchNode(fileKey, nodeId, depth = 2) {
  return fetchCached(
    fileKey,
    `nodes-${nodeId}-depth${depth}`,
    `/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=${depth}`
  );
}

// Render nodes to image URLs, then download to outDir. Returns saved file paths.
// The directory is only created once there is something to write, so a failed
// images call never leaves an empty output directory behind.
export async function downloadImages(fileKey, nodeIds, outDir, { format = 'png', scale = 2 } = {}) {
  const ids = nodeIds.join(',');
  const { images, err } = await apiFetch(
    `/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`
  );
  if (err) throw new Error('images endpoint: ' + JSON.stringify(err));
  const entries = Object.entries(images || {}).filter(([, url]) => url);
  if (!entries.length) return [];
  mkdirSync(outDir, { recursive: true });
  const saved = [];
  for (const [id, url] of entries) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${id}: HTTP ${res.status}`);
    // Ids are validated upstream; sanitize anyway so they can never escape outDir.
    const file = join(outDir, `${id.replace(/[^A-Za-z0-9._-]/g, '-')}.${format}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    saved.push(file);
  }
  return saved;
}
