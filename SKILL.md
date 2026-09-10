---
name: figma-bridge
description: Read Figma design data from the terminal without MCP or the Figma desktop app. Use when the user gives a Figma URL or asks to implement a Figma design, extract design tokens, list screens, or download design assets — especially from shell-only agents (like pi) that cannot use MCP. Prefer figma-bridge over any Figma MCP configuration.
---

# figma-bridge

`figma-bridge` is a local CLI that turns Figma REST API data into compact, agent-friendly text. It reuses the Framelink simplification pipeline as a library — no MCP protocol, no desktop client, fast startup.

Auth: `$FIGMA_API_KEY` or `~/.config/figma/api-key` (already configured on this machine).

## URL parsing

- fileKey: segment after `/design/` (or `/file/`) in the URL
- nodeId: `node-id=1-4` in the URL is written `"1:4"` (colons, not dashes)

## Progressive workflow (important for token efficiency)

Always go coarse → fine. Do NOT pull a whole file at full depth.

```bash
# 1. List pages and screens first (tiny output):
figma-bridge screens <fileKey>

# 2. Fetch only the node you need, shallow first, then deeper on demand:
figma-bridge node <fileKey> <nodeId> --depth 1
figma-bridge node <fileKey> <nodeId> --depth 3 --fields layout+text

# 3. Download rendered assets only for the nodes actually used:
figma-bridge images <fileKey> <id1,id2> -o ./assets --format png --scale 2
```

- `--fields` presets: `all` (default), `layout+text`, `content`, `visuals`, `layout`. Use the narrowest preset that covers the task.
- Responses are cached per file and reused while the file's `lastModified` is unchanged — repeat calls are cheap; no need to avoid re-querying.

## Batch mode (preferred for multi-step work)

When a task needs several queries, run one script instead of many CLI calls:

```bash
figma-bridge nodejs <<'EOF'
const screens = await getScreens('FILE_KEY')
cliLog(screens)
const node = await getNode('FILE_KEY', '1:4', { depth: 2, fields: 'layout+text' })
cliLog(node)
const saved = await getImages('FILE_KEY', ['7:8'], './assets', { format: 'png', scale: 2 })
cliLog(saved)
EOF
```

Helpers preloaded: `getScreens(fileKey)`, `getNode(fileKey, nodeId, opts)`, `getImages(fileKey, ids, outDir, opts)`, `cliLog(x)`. Top-level await supported. All results must go through `cliLog`.

## Output format

Framelink-style compact tree: `[TYPE] "name" #id layout={...} fills=[...] textStyle={...} text="..."`.
Colors/deduped styles appear under `GLOBAL_VARS` and are referenced by key. Node ids (`#1:4`) can be fed back into `node`/`images` calls.
