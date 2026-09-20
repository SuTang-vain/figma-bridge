---
name: figma-bridge
description: Read Figma design data without MCP or the Figma desktop app. Use when the user gives a Figma URL or asks to implement a Figma design, extract design tokens, list screens, or download design assets — from pi (via the `figma` tool) or from any shell-only agent (via the `figma-bridge` CLI).
---

# figma-bridge

Two entry points, one code path:

- **Inside pi:** the `figma` tool registered by this package's extension — no shell needed. Prefer it.
- **Any shell-only agent:** the `figma-bridge` CLI. pi does **not** put package binaries on PATH, so if
  `figma-bridge` is not found use `npx figma-bridge-cli …`, or point at the installed copy, e.g.
  `node ~/.pi/agent/npm/node_modules/figma-bridge-cli/bin/figma-bridge.js …`.

Auth: `$FIGMA_API_KEY` or `~/.config/figma/api-key`.

## Progressive workflow (token efficiency)

Always go coarse → fine. Do NOT pull a whole file at full depth.

1. **Outline first** — `mode=screens` / `figma-bridge screens <ref>`: pages, frames, sizes. Tiny output.
2. **One node, shallow** — `mode=node` / `figma-bridge node <ref> <nodeId> --depth 1`, then deeper only if needed.
3. **Images last, only for nodes you actually use** — `mode=images` / `figma-bridge images <ref> <ids>`.

## Tool form (pi)

```jsonc
figma({
  mode: "screens" | "node" | "images",
  ref: "<fileKey or full Figma URL>",
  nodeId: "1:4",          // node: defaults to the URL's node-id
  depth: 1,                // 1-3, default 2
  fields: "layout+text",   // node: all | layout+text | content | visuals | layout
  nodeIds: ["1:4"],        // images: defaults to the URL's node-id
  outDir: "assets",        // images: relative to the session cwd (default ./figma-assets)
  format: "png", scale: 2  // images
})
```

Output is truncated at 50KB / 2000 lines; when that happens the result names a file holding the full output.

## CLI form (any agent, CI, scripts)

```bash
figma-bridge screens <fileKey|url>                     # outline: pages + frames
figma-bridge node <fileKey|url> [nodeId] --depth 1 --fields layout+text
figma-bridge images <fileKey|url> <id1,id2> -o ./assets --format png --scale 2

# Batch mode: helpers preloaded, top-level await, one process for many queries
figma-bridge nodejs <<'EOF'
cliLog(await getScreens('FILE_KEY'))
cliLog(await getNode('FILE_KEY', '1:4', { depth: 2, fields: 'layout+text' }))
EOF
```

Full Figma URLs work everywhere (a bare `fileKey` also works). `--fields` presets: `all` (default),
`layout+text`, `content`, `visuals`, `layout` — pick the narrowest one that covers the task. The heredoc form is
POSIX-only; on Windows write the script to a file and pipe it in, or use the tool form.

## Output format

Compact Framelink-style tree: `[TYPE] "name" #id layout={…} fills=[…] textStyle={…} text="…"`. Deduped
styles/colors appear under `GLOBAL_VARS`; node ids (`#1:4`) feed back into `node`/`images` calls.

## Behaviour worth knowing

- **Cache:** every call revalidates the file's `lastModified` (one metadata request). Unchanged file → served from
  `~/.cache/figma-bridge` and marked `(cache hit)`. If that check fails but a copy exists, the cached data is
  returned marked `(cache hit, unverified)` instead of erroring. Override the location with `FIGMA_BRIDGE_CACHE_DIR`.
- **Network and files:** both entry points call `api.figma.com` (the token never enters the model context) and, for
  `images`, write files into the directory you pass (default `./figma-assets`).
- **Honest limits:** output is bounded, not magical — if a node tree is huge, ask for a shallower `depth` or a
  narrower `fields` preset rather than re-reading the same call.
