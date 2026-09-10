# figma-bridge

**Figma design data CLI for AI agents — no MCP, no desktop app.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/SuTang-vain/figma-bridge?style=flat)](https://github.com/SuTang-vain/figma-bridge/stargazers)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)

`figma-bridge` turns the Figma REST API into compact, agent-friendly text, reusing the
[Framelink](https://github.com/GLips/Figma-Context-MCP) simplification pipeline as a library.
Built for shell-only agents (pi, custom scripts, CI, any agent without MCP support) and for
anyone hitting MCP token bloat, plan-based rate limits, or the desktop-app requirement.

## Why not MCP?

- **No context tax** — MCP tool schemas sit in the conversation forever; a CLI needs only a few lines of usage docs
- **No moving parts** — no server lifecycle, no desktop client, no OAuth dance; one process per call, ~1s cold start
- **Progressive disclosure** — `screens` → `node` → `images` instead of full-file dumps; field presets and depth control keep output small
- **Cache-aware** — responses are reused while the file's `lastModified` is unchanged

## Install

```bash
git clone https://github.com/SuTang-vain/figma-bridge ~/figma-bridge
cd ~/figma-bridge && npm install
mkdir -p ~/.local/bin && ln -s ~/figma-bridge/bin/figma-bridge.js ~/.local/bin/figma-bridge

# Auth: Figma → Settings → Security → Personal access tokens
mkdir -p ~/.config/figma && chmod 700 ~/.config/figma
printf 'YOUR_TOKEN' > ~/.config/figma/api-key && chmod 600 ~/.config/figma/api-key
```

## See it work

```bash
$ figma-bridge screens ymWuCHHNU22zse8nVTVmNN
NAME: "Food delivery app Ui kit (Community)"
LAST_MODIFIED: 2026-09-10T15:39:49Z

[PAGE] "📺  Mobile Screens" #0:1
  [FRAME] "iPhone 11 Pro Max - 1" #1:4 414x896
  [FRAME] "iPhone 11 Pro Max - 2" #2:1 414x896
  ...

$ figma-bridge node ymWuCHHNU22zse8nVTVmNN 1:4 --depth 1 --fields layout+text
[TEXT] "Food for Everyone" #7:9 layout={...} textStyle={fontFamily:"SF Pro Rounded",fontWeight:800,fontSize:65,...} text="Food for \nEveryone"
```

Same node, same depth: ~1.8 KB via figma-bridge vs ~3 KB via MCP bridge — and the
`screens` overview costs almost nothing compared to a full-file pull.
See [BENCHMARKS.md](./BENCHMARKS.md) for multi-round measurements (latency, output size,
cache behavior, batch mode) with methodology and reproduction steps.

## Usage

```bash
# Progressive: list screens first (tiny output), then fetch only what you need
figma-bridge screens <fileKey>
figma-bridge node <fileKey> <nodeId> --depth 1 --fields layout+text
figma-bridge images <fileKey> <id1,id2> -o ./assets --format png --scale 2

# Batch mode for multi-step work (helpers preloaded, top-level await)
figma-bridge nodejs <<'EOF'
cliLog(await getScreens('FILE_KEY'))
cliLog(await getNode('FILE_KEY', '1:4', { depth: 2, fields: 'layout+text' }))
EOF
```

- URL parsing: fileKey is the segment after `/design/`; `node-id=1-4` becomes `"1:4"`
- `--fields` presets: `all` (default), `layout+text`, `content`, `visuals`, `layout`
- Responses are cached per file and reused while `lastModified` is unchanged
- Agent-facing docs: [SKILL.md](./SKILL.md)

## How it works

```
agent → figma-bridge (CLI) → Figma REST API → Framelink simplification (as a library)
```

No MCP transport layer. The Framelink extractors turn verbose Figma JSON into a compact
tree with deduped styles under `GLOBAL_VARS`; figma-bridge adds progressive subcommands,
field presets, caching, and a batch scripting mode.

## Roadmap

- [ ] Offline `.fig` file parsing (no API, no rate limits)
- [ ] Pluggable sources beyond Figma (only when a real need shows up)
- [ ] `figma-bridge serve` persistent daemon for ultra-low latency

## License

[MIT](./LICENSE)
