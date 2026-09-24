// variables.js — Figma local variables as CSS custom properties (design tokens).
//
// The /variables/local payload groups variables into collections, each with one or more
// modes (Light/Dark/...). We render one :root block per collection, resolve VARIABLE_ALIAS
// values to var(--name) references, and sanitise names into a shared CSS namespace.
// FLOAT values stay unitless Figma numbers; colors become hex (8-digit when alpha < 1).

const toHex2 = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0').toUpperCase();

export function colorToHex({ r, g, b, a = 1 }) {
  const rgb = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  return a >= 1 ? rgb : rgb + toHex2(a);
}

// "color/primary 500" → "color-primary-500"; colliding names get a numeric suffix;
// a leading digit would be an invalid CSS ident, so it gets an x- prefix.
export function tokenName(raw, used) {
  let base = String(raw ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed';
  if (/^[0-9]/.test(base)) base = `x-${base}`;
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base}-${i++}`;
  used.set(name, true);
  return name;
}

function valueToCss(value, resolveName) {
  if (value == null) return { css: null, comment: 'no value for this mode' };
  if (typeof value === 'object') {
    if (value.type === 'VARIABLE_ALIAS') {
      const target = resolveName(value.id);
      return target
        ? { css: `var(--${target})` }
        : { css: null, comment: `unresolved alias ${value.id}` };
    }
    if ('r' in value && 'g' in value && 'b' in value) return { css: colorToHex(value) };
    return { css: null, comment: 'unsupported value shape' };
  }
  if (typeof value === 'number') return { css: String(value) };
  if (typeof value === 'boolean') return { css: String(value) };
  if (typeof value === 'string') return { css: JSON.stringify(value) };
  return { css: null, comment: 'unsupported value' };
}

function pickMode(col, requested) {
  if (requested) {
    const hit = (col.modes || []).find((m) => m.name.toLowerCase() === String(requested).toLowerCase());
    if (hit) return { modeId: hit.modeId, modeName: hit.name };
    return {
      modeId: null,
      modeName: null,
      miss: `mode '${requested}' not in this collection (available: ${(col.modes || []).map((m) => m.name).join(', ') || 'none'})`,
    };
  }
  const def = (col.modes || []).find((m) => m.modeId === col.defaultModeId) ?? col.modes?.[0];
  return { modeId: def?.modeId ?? null, modeName: def?.name ?? 'default' };
}

export function formatVariables(meta, { mode } = {}) {
  const collections = meta?.variableCollections || {};
  const variables = Object.values(meta?.variables || {})
    .filter((v) => v && !v.hiddenFromPublishing && v.variableCollectionId && collections[v.variableCollectionId]);
  if (!variables.length) return 'no published variables in this file';

  // One shared CSS namespace, assigned in a stable (code-point) order so token names are
  // deterministic across environments — pipelines diff this output.
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const used = new Map();
  const names = new Map();
  for (const v of [...variables].sort(byName)) {
    names.set(v.id, tokenName(v.name, used));
  }

  const blocks = [];
  for (const col of Object.values(collections).sort(byName)) {
    const colVars = variables
      .filter((v) => v.variableCollectionId === col.id)
      .sort(byName);
    if (!colVars.length) continue;

    const picked = pickMode(col, mode);
    if (!picked.modeId) {
      blocks.push(`/* collection "${col.name}": ${picked.miss} — skipped */`);
      continue;
    }

    const lines = [];
    let emitted = 0;
    for (const v of colVars) {
      const { css, comment } = valueToCss(v.valuesByMode?.[picked.modeId], (id) => names.get(id));
      if (css == null) {
        lines.push(`  /* --${names.get(v.id)}: ${comment} */`);
        continue;
      }
      lines.push(`  --${names.get(v.id)}: ${css};`);
      emitted++;
    }
    blocks.push(
      `/* collection "${col.name}" — mode "${picked.modeName}" (${emitted} tokens) */\n`
      + `:root {\n${lines.join('\n')}\n}`,
    );
  }
  return blocks.join('\n\n');
}
