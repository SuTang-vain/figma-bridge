// format.js — compact, token-efficient serialization of SimplifiedDesign.
// Mimics the Framelink MCP YAML-ish output agents are already trained on,
// with extra compaction: empty props omitted, long decimals rounded.

// Shared wording for the cache marker: null when the response was not served from cache.
export function cacheNote(meta) {
  if (!meta?.cached) return null;
  return meta.unverified ? 'cache hit, unverified' : 'cache hit';
}

function val(v) {
  if (v == null) return undefined;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return undefined;
    return `[${v.map((x) => val(x)).join(', ')}]`;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v)
      .map(([k, x]) => [k, val(x)])
      .filter(([, x]) => x !== undefined);
    if (!entries.length) return undefined;
    return `{${entries.map(([k, x]) => `${k}:${x}`).join(',')}}`;
  }
  return String(v);
}

const PROP_ORDER = ['layout', 'fills', 'strokes', 'strokeWeight', 'effects', 'opacity', 'borderRadius', 'textStyle', 'text', 'componentId'];

function nodeLine(n, indent) {
  const type = (n.type || 'NODE').toUpperCase();
  // Absolute positioning (mode:"none") is the default; omit layouts that say nothing else.
  // Note: keys may exist with undefined values (dropped by JSON but present at runtime).
  const empty = (x) => x == null || (typeof x === 'object' && !Array.isArray(x) && Object.values(x).every(empty));
  const layout = n.layout && typeof n.layout === 'object'
    && Object.entries(n.layout).every(([k, v]) => (k === 'mode' && v === 'none') || empty(v))
    ? undefined
    : n.layout;
  // TEXT nodes whose name merely repeats the text content don't need both.
  // Text may contain literal "\n" sequences; normalize before comparing.
  const norm = (s) => String(s).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  const dupName = n.text && n.name && norm(n.name) === norm(n.text);
  const name = n.name && !dupName ? ` ${JSON.stringify(n.name)}` : '';
  const parts = [];
  for (const key of PROP_ORDER) {
    const v = val(key === 'layout' ? layout : n[key]);
    if (v !== undefined) parts.push(`${key}=${v}`);
  }
  return `${'  '.repeat(indent)}[${type}]${name} #${n.id}${parts.length ? ' ' + parts.join(' ') : ''}`;
}

function emitNode(n, indent, lines) {
  lines.push(nodeLine(n, indent));
  for (const c of n.children || []) emitNode(c, indent + 1, lines);
}

export function formatDesign(design, { meta } = {}) {
  const lines = [];
  lines.push(`NAME: ${JSON.stringify(design.name)}`);
  const note = cacheNote(meta);
  if (meta?.lastModified) lines.push(`LAST_MODIFIED: ${meta.lastModified}${note ? ` (${note})` : ''}`);

  const styles = design.globalVars?.styles || {};
  const styleKeys = Object.keys(styles);
  if (styleKeys.length) {
    lines.push('GLOBAL_VARS:');
    for (const k of styleKeys) lines.push(`  ${k}: ${val(styles[k])}`);
  }

  const components = Object.values(design.components || {});
  if (components.length) {
    lines.push('COMPONENTS:');
    for (const c of components) lines.push(`  #${c.id} ${JSON.stringify(c.name)}`);
  }

  lines.push('NODES:');
  for (const n of design.nodes || []) emitNode(n, 0, lines);
  return lines.join('\n');
}

// Compact screen/page listing from a raw file tree (depth>=2).
export function formatScreens(fileData) {
  const lines = [`NAME: ${JSON.stringify(fileData.name)}`, `LAST_MODIFIED: ${fileData.lastModified}`];  for (const page of fileData.document?.children || []) {
    lines.push(`\n[PAGE] ${JSON.stringify(page.name)} #${page.id}`);
    for (const frame of page.children || []) {
      const bb = frame.absoluteBoundingBox || {};
      const dims = bb.width ? ` ${Math.round(bb.width)}x${Math.round(bb.height)}` : '';
      // At the depth limit Figma returns children: [] — a count of zero says nothing.
      const kids = frame.children?.length || 0;
      const count = kids ? ` (${kids} children)` : '';
      lines.push(`  [${frame.type}] ${JSON.stringify(frame.name)} #${frame.id}${dims}${count}`);
    }
  }
  return lines.join('\n');
}
