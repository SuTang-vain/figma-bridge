// helpers.js — high-level operations shared by the CLI subcommands and nodejs mode.
import {
  simplifyRawFigmaObject,
  allExtractors,
  layoutAndText,
  contentOnly,
  visualsOnly,
  layoutOnly,
} from 'figma-developer-mcp';
import { fetchFileTree, fetchNode, downloadImages } from './api.js';
import { formatDesign, formatScreens } from './format.js';

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
export async function getScreens(fileKey, { depth = 2 } = {}) {
  const { data, cached } = await fetchFileTree(fileKey, depth);
  return formatScreens(data) + (cached ? '\n(cache hit)' : '');
}

// Progressive step 2: simplified data for one node subtree.
export async function getNode(fileKey, nodeId, { depth = 2, fields = 'all' } = {}) {
  const { data, cached, lastModified } = await fetchNode(fileKey, nodeId, depth);
  const design = await simplifyRawFigmaObject(data, resolveExtractors(fields), { maxDepth: depth });
  return formatDesign(design, { meta: { lastModified, cached } });
}

// Download rendered images of nodes to a directory.
export async function getImages(fileKey, nodeIds, outDir, opts = {}) {
  const ids = Array.isArray(nodeIds) ? nodeIds : String(nodeIds).split(',');
  return downloadImages(fileKey, ids, outDir, opts);
}
