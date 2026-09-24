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

## Workflow — follow the decision tree, never dump a whole file

A full file at max depth is the classic MCP failure mode (Figma's own docs cite a single
`get_design_context` response of ~351k tokens). The tree below keeps every call small.

```
Have a node-id for what you need?
├─ NO  → mode=screens            (pages + frames + sizes, typically <2KB)
│         → pick the frame id from the outline, then continue below
│
└─ YES → read this file before (in this workspace)?
         ├─ YES → mode=changed first: is my picture of the file stale?
         │          (tiny diff: +added ~modified -removed; first call saves a baseline)
         └─ then → mode=node, with the NARROWEST depth + fields that answer the question:
                      ├─ implement layout + copy      → depth 1, fields layout+text
                      ├─ colours / shadows / visuals  → depth 1, fields visuals
                      ├─ structure / spacing check    → depth 1, fields layout
                      ├─ just the copy                → fields content
                      └─ still not enough? deepen to 2, then 3 — never start at 3
Need design tokens (colours/spacing as CSS vars)?
→ mode=variables (Enterprise plans only; a clear error explains otherwise)
Need rendered pixels for a node you will actually use?
→ mode=images (last, and only for those nodes)
```

Rules that keep tokens small:

1. **Coarse → fine, always.** Screens before node; depth 1 before 2 before 3.
2. **Never re-read to "refresh".** If you read this file earlier, `changed` tells you what moved;
   re-read only the nodes the diff lists.
3. **Truncation means "ask narrower", not "fetch again".** Output caps at 50KB/2000 lines and spills
   the rest to a file path it names. When that happens, redo the call with a narrower `fields` or
   shallower `depth` — do not page through the spill file into context.
4. **`images`/`variables` are the only modes that touch the disk or need a plan gate** — everything
   else is read-only text.

## Tool form (pi)

```jsonc
figma({
  mode: "screens" | "node" | "changed" | "images" | "variables",
  ref: "<fileKey or full Figma URL>",
  nodeId: "1:4",          // node: defaults to the URL's node-id
  depth: 1,                // 1-3, default 2
  fields: "layout+text",   // node: all | layout+text | content | visuals | layout
  nodeIds: ["1:4"],        // images: defaults to the URL's node-id
  outDir: "assets",        // images: relative to the session cwd (default ./figma-assets)
  format: "png", scale: 2, // images: png|svg|jpg|pdf|webp, scale 0.01-4
  variableMode: "Dark"     // variables: collection mode (default: each collection's default)
})
```

## CLI form (any agent, CI, scripts)

```bash
figma-bridge screens <fileKey|url>                     # outline: pages + frames
figma-bridge changed <fileKey|url> [--depth 2]         # what changed since the last changed call
figma-bridge node <fileKey|url> [nodeId] --depth 1 --fields layout+text
figma-bridge variables <fileKey|url> [--mode Dark]     # design tokens as CSS custom properties
figma-bridge images <fileKey|url> <id1,id2> -o ./assets --format png --scale 2

# Batch mode: helpers preloaded, top-level await, one process for many queries
figma-bridge nodejs <<'EOF'
cliLog(await getScreens('FILE_KEY'))
cliLog(await getNode('FILE_KEY', '1:4', { depth: 2, fields: 'layout+text' }))
EOF
```

Full Figma URLs work everywhere (a bare `fileKey` also works). The heredoc form is POSIX-only; on
Windows write the script to a file and pipe it in, or use the tool form.

## Output format

Compact Framelink-style tree: `[TYPE] "name" #id layout={…} fills=[…] textStyle={…} text="…"`. Deduped
styles/colours appear under `GLOBAL_VARS`; node ids (`#1:4`) feed back into `node`/`images` calls.
`variables` emits `:root { --token: value; }` blocks per collection/mode; `changed` emits
`+ id "name" (TYPE)` / `~ …` / `- …` lines with counts.

## Behaviour worth knowing

- **Cache:** every call revalidates the file's `lastModified` (one metadata request). Unchanged file →
  served from `~/.cache/figma-bridge` and marked `(cache hit)`. If that check fails but a copy exists,
  the cached data is returned marked `(cache hit, unverified)` instead of erroring. `changed` keeps its
  per-depth snapshots in the same directory. Override the location with `FIGMA_BRIDGE_CACHE_DIR`.
- **Network and files:** both entry points call `api.figma.com` (the token never enters the model
  context) and, for `images`, write files into the directory you pass (default `./figma-assets`,
  owner-only permissions). A relative outDir that sneaks out of the project through a symlink is refused.
- **variables needs an Enterprise plan** — the Figma REST API gates `/variables/local` behind one; a 403
  becomes an explicit error saying so, not a cryptic failure.
- **Honest limits:** output is bounded, not magical — if a node tree is huge, ask for a shallower
  `depth` or a narrower `fields` preset rather than re-reading the same call.
