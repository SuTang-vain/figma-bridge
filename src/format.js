// format.js — compact, token-efficient serialization of SimplifiedDesign.
// Mimics the Framelink MCP YAML-ish output agents are already trained on,
// with extra compaction: empty props omitted, long decimals rounded.

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
  const name = n.name ? ` ${JSON.stringify(n.name)}` : '';
  const parts = [];
  for (const key of PROP_ORDER) {
    const v = val(n[key]);
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
  if (meta?.lastModified) lines.push(`LAST_MODIFIED: ${meta.lastModified}${meta.cached ? ' (cache hit)' : ''}`);

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
  const lines = [`NAME: ${JSON.stringify(fileData.name)}`, `LAST_MODIFIED: ${fileData.lastModified}`];
  for (const page of fileData.document?.children || []) {
    lines.push(`\n[PAGE] ${JSON.stringify(page.name)} #${page.id}`);
    for (const frame of page.children || []) {
      const bb = frame.absoluteBoundingBox || {};
      const dims = bb.width ? ` ${Math.round(bb.width)}x${Math.round(bb.height)}` : '';
      lines.push(`  [${frame.type}] ${JSON.stringify(frame.name)} #${frame.id}${dims}${frame.children ? ` (${frame.children.length} children)` : ''}`);
    }
  }
  return lines.join('\n');
}
