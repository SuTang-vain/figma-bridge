// api.js — Figma REST API access with token resolution and lastModified-based caching.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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
  mkdirSync(dir, { recursive: true, mode: 0o700 });
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
    // Design data is written readable only by the owner (0o600), like the API key itself.
    writeFileSync(rawPath, JSON.stringify(data), { mode: 0o600 });
    writeFileSync(metaPath, lastModified, { mode: 0o600 });
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

// Image download URLs come from the Figma API response. Validate before fetching so a
// tampered response cannot turn the export feature into an arbitrary-file downloader:
// only https, and only hosts Figma is known to serve renders from. The (^|\.) anchor
// keeps lookalike hosts such as 'evil-figma.com' or 'figma.com.evil.com' out.
const IMAGE_HOST = /(^|\.)((s3-alpha-sig\.)?figma\.com|figmausercontent\.com|amazonaws\.com)$/i;

export const IMAGE_FORMATS = ['png', 'svg', 'jpg', 'pdf', 'webp'];

export function assertImageOptions({ format = 'png', scale = 2 } = {}) {
  if (!IMAGE_FORMATS.includes(format)) {
    throw new Error(`unknown --format '${format}', valid: ${IMAGE_FORMATS.join(', ')}`);
  }
  if (!(Number.isFinite(scale) && scale >= 0.01 && scale <= 4)) {
    throw new Error(`--scale must be a number between 0.01 and 4 (got ${scale})`);
  }
}

export function assertImageUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`refusing image URL (not a valid URL): ${String(url).slice(0, 80)}`);
  }
  if (u.protocol !== 'https:') {
    throw new Error(`refusing image URL with protocol '${u.protocol}' (https only): ${u.hostname}`);
  }
  if (!IMAGE_HOST.test(u.hostname)) {
    throw new Error(`refusing image URL host '${u.hostname}' (expected a figma.com / amazonaws.com host)`);
  }
  return u;
}

// A relative outDir that lexically sits inside the cwd but resolves (through symlinks)
// outside it is refused: an agent could otherwise be tricked into writing outside the
// project. An absolute outDir is an explicit user choice and stays allowed.
export function assertNoSymlinkEscape(outDir, cwd = process.cwd()) {
  const base = resolve(cwd);
  const lexical = resolve(cwd, outDir);
  if (lexical !== base && !lexical.startsWith(base + sep)) return;
  const real = realpathSync(lexical);
  const realBase = realpathSync(base);
  if (real !== realBase && !real.startsWith(realBase + sep)) {
    throw new Error(
      `outDir '${outDir}' is a symlink that escapes the current directory (resolves to ${real}); `
      + 'pass an absolute path to allow writing there explicitly'
    );
  }
}

// Render nodes to image URLs, then download to outDir. Returns saved file paths.
// The directory is only created once there is something to write, so a failed
// images call never leaves an empty output directory behind.
export async function downloadImages(fileKey, nodeIds, outDir, { format = 'png', scale = 2, cwd } = {}) {
  assertImageOptions({ format, scale });
  const ids = nodeIds.join(',');
  const { images, err } = await apiFetch(
    `/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`
  );
  if (err) throw new Error('images endpoint: ' + JSON.stringify(err));
  const entries = Object.entries(images || {}).filter(([, url]) => url);
  if (!entries.length) return [];
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  assertNoSymlinkEscape(outDir, cwd);
  const saved = [];
  for (const [id, url] of entries) {
    assertImageUrl(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${id}: HTTP ${res.status}`);
    // Ids are validated upstream; sanitize anyway so they can never escape outDir.
    const file = join(outDir, `${id.replace(/[^A-Za-z0-9._-]/g, '-')}.${format}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()), { mode: 0o600 });
    saved.push(file);
  }
  return saved;
}
