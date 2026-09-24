// helpers.js — high-level operations shared by the CLI subcommands and nodejs mode.
import {
  simplifyRawFigmaObject,
  allExtractors,
  layoutAndText,
  contentOnly,
  visualsOnly,
  layoutOnly,
} from 'figma-developer-mcp';
import { fetchFileTree, fetchNode, downloadImages, fileCacheDir } from './api.js';
import { formatDesign, formatScreens, cacheNote } from './format.js';
import { parseFigmaUrl, assertNodeId, assertDepth } from './url.js';
import {
  collectNodes,
  loadSnapshot,
  saveSnapshot,
  diffSnapshots,
  formatChanged,
  formatBaseline,
} from './changed.js';

const FIELD_PRESETS = {
  all: allExtractors,
  'layout+text': layoutAndText,
  content: contentOnly,
  visuals: visualsOnly,
  layout: layoutOnly,
};

function resolveExtractors(fields = 'all') {
  const preset = FIELD_PRESETS[fields];
  if (!preset) {
    throw new Error(`unknown --fields '${fields}', valid: ${Object.keys(FIELD_PRESETS).join(', ')}`);
  }
  return preset;
}

// Progressive step 1: list pages and top-level frames of a file.
// `ref` accepts a fileKey or a full Figma URL.
export async function getScreens(ref, { depth = 2 } = {}) {
  const { fileKey } = parseFigmaUrl(ref);
  const { data, cached, unverified } = await fetchFileTree(fileKey, assertDepth(depth));
  const note = cacheNote({ cached, unverified });
  return formatScreens(data) + (note ? `\n(${note})` : '');
}

// Progressive step 2: simplified data for one node subtree.
// `ref` accepts a fileKey or URL; nodeId falls back to the URL's node-id.
export async function getNode(ref, nodeId, { depth = 2, fields = 'all' } = {}) {
  const parsed = parseFigmaUrl(ref);
  const id = nodeId || parsed.nodeId;
  if (!id) throw new Error('nodeId required (pass one or use a URL containing node-id)');
  // Resolve extractors before touching the network: an unknown --fields must fail fast.
  const extractors = resolveExtractors(fields);
  const { data, cached, unverified, lastModified } = await fetchNode(parsed.fileKey, id, assertDepth(depth));
  const design = await simplifyRawFigmaObject(data, extractors, { maxDepth: depth });
  return formatDesign(design, { meta: { lastModified, cached, unverified } });
}

// Incremental step: what changed in this file since the last `changed` call.
// One depth-N fetch, then a local snapshot diff — only the delta reaches the agent.
export async function getChanged(ref, { depth = 2 } = {}) {
  const { fileKey } = parseFigmaUrl(ref);
  const d = assertDepth(depth);
  const { data, lastModified } = await fetchFileTree(fileKey, d);
  const nodes = collectNodes(data);
  const dir = fileCacheDir(fileKey);
  const kind = `tree-d${d}`;
  const prev = loadSnapshot(dir, kind);
  const meta = { lastModified, fetchedAt: new Date().toISOString(), depth: d, nodeCount: nodes.size };
  saveSnapshot(dir, kind, { meta, nodes: Object.fromEntries(nodes) });
  if (!prev) return formatBaseline({ fileKey, depth: d, meta });
  const diff = diffSnapshots(new Map(Object.entries(prev.nodes)), nodes);
  return formatChanged({ fileKey, depth: d, diff, prevMeta: prev.meta, meta });
}

// Download rendered images of nodes to a directory.
// ids may be omitted when `ref` is a URL containing node-id.
export async function getImages(ref, nodeIds, outDir = './figma-assets', opts = {}) {
  const parsed = parseFigmaUrl(ref);
  let ids = nodeIds;
  if (ids == null || (Array.isArray(ids) && !ids.length)) {
    if (!parsed.nodeId) throw new Error('node ids required (pass them or use a URL containing node-id)');
    ids = [parsed.nodeId];
  }
  if (!Array.isArray(ids)) ids = String(ids).split(',');
  ids = ids.map((id) => assertNodeId(String(id).trim()));
  return downloadImages(parsed.fileKey, ids, outDir, opts);
}
