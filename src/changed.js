// changed.js — snapshot-based incremental diff of a file's node tree.
//
// "What changed since I last looked?" is the cheapest question an agent can ask: one
// depth-N fetch, a local comparison against the previous snapshot, and only the delta
// costs tokens. Snapshots live next to the response cache, keyed by depth, and are
// owner-private like every other file this tool writes.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Per-section cap on listed nodes; the counts line always reflects the full diff.
const MAX_LIST = 50;

// Flatten the fetched tree into id → {name, type, sig, parent}. The signature is a hash of
// the whole node, so an edit anywhere in the subtree marks every ancestor modified;
// diffSnapshots collapses those to the deepest changed nodes.
export function collectNodes(fileJson) {
  const nodes = new Map();
  const visit = (node, parentId = null) => {
    if (!node || typeof node !== 'object') return;
    let id = null;
    if (node.id) {
      id = node.id;
      const sig = createHash('sha1').update(JSON.stringify(node)).digest('hex').slice(0, 12);
      nodes.set(id, { name: node.name ?? '', type: node.type ?? '?', sig, parent: parentId });
    }
    if (Array.isArray(node.children)) for (const child of node.children) visit(child, id ?? parentId);
  };
  visit(fileJson?.document);
  return nodes;
}

export function snapshotPath(dir, kind) {
  return join(dir, `snapshot-${kind}.json`);
}

export function loadSnapshot(dir, kind) {
  const p = snapshotPath(dir, kind);
  if (!existsSync(p)) return null;
  try {
    const snap = JSON.parse(readFileSync(p, 'utf8'));
    if (snap && snap.meta && snap.nodes) return snap;
  } catch {
    // A corrupt snapshot must not break the run; it is overwritten with a fresh baseline.
  }
  return null;
}

export function saveSnapshot(dir, kind, snapshot) {
  writeFileSync(snapshotPath(dir, kind), JSON.stringify(snapshot), { mode: 0o600 });
}

export function diffSnapshots(prev, next) {
  const added = [];
  const removed = [];
  const modified = [];
  for (const [id, n] of next) {
    const o = prev.get(id);
    if (!o) added.push({ id, ...n });
    else if (o.sig !== n.sig) modified.push({ id, ...n });
  }
  for (const [id, n] of prev) {
    if (!next.has(id)) removed.push({ id, ...n });
  }
  // A modified ancestor whose subtree already contains a reported change is redundant
  // (signatures include children) — collapse to the deepest changed nodes.
  const covered = new Set();
  for (const n of [...added, ...removed, ...modified]) {
    let p = next.get(n.id)?.parent ?? prev.get(n.id)?.parent;
    while (p) {
      covered.add(p);
      p = next.get(p)?.parent ?? prev.get(p)?.parent;
    }
  }
  const collapsed = modified.filter((n) => !covered.has(n.id));
  const byId = (a, b) => a.id.localeCompare(b.id);
  return { added: added.sort(byId), removed: removed.sort(byId), modified: collapsed.sort(byId) };
}

function listSection(symbol, items) {
  if (!items.length) return [];
  const lines = items.slice(0, MAX_LIST).map((n) => `${symbol} ${n.id} "${n.name}" (${n.type})`);
  if (items.length > MAX_LIST) lines.push(`  … and ${items.length - MAX_LIST} more`);
  return lines;
}

export function formatBaseline({ fileKey, depth, meta }) {
  return `baseline saved for ${fileKey} (depth ${depth}, ${meta.nodeCount} nodes,`
    + ` file lastModified ${meta.lastModified ?? 'unknown'})\n`
    + 'run figma-bridge changed again after the file changes to see a diff';
}

export function formatChanged({ fileKey, depth, diff, prevMeta, meta }) {
  const header = `changes in ${fileKey} since ${prevMeta.fetchedAt}`
    + ` (depth ${depth}, file lastModified ${meta.lastModified ?? 'unknown'})`;
  const counts = `+${diff.added.length} added, ~${diff.modified.length} modified, -${diff.removed.length} removed`;
  if (!diff.added.length && !diff.removed.length && !diff.modified.length) {
    return `${header}\n${counts}\nno changes`;
  }
  return [
    header,
    counts,
    '',
    ...listSection('+', diff.added),
    ...listSection('~', diff.modified),
    ...listSection('-', diff.removed),
  ].join('\n');
}
