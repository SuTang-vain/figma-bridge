# figma-bridge

**Figma design data for AI agents: a CLI for shell-only agents and a [pi package](https://pi.dev/packages/figma-bridge-cli) (one compact tool) — no MCP, no desktop app.**

English | [中文](./docs/README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/figma-bridge-cli)](https://www.npmjs.com/package/figma-bridge-cli)
[![pi-package](https://img.shields.io/badge/pi--package-listed-blue)](https://pi.dev/packages/figma-bridge-cli)
[![GitHub release](https://img.shields.io/github/v/release/SuTang-vain/figma-bridge)](https://github.com/SuTang-vain/figma-bridge/releases)
[![GitHub stars](https://img.shields.io/github/stars/SuTang-vain/figma-bridge?style=flat)](https://github.com/SuTang-vain/figma-bridge/stargazers)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)

`figma-bridge` turns the Figma REST API into compact, agent-friendly text, reusing the
[Framelink](https://github.com/GLips/Figma-Context-MCP) simplification pipeline as a library.
Built for shell-only agents (pi, custom scripts, CI, any agent without MCP support) and for
anyone hitting MCP token bloat, plan-based rate limits, or the desktop-app requirement.

![figma-bridge demo: screens → node → batch mode](./assets/demo.gif)

## Why not MCP?

- **No context tax** — MCP tool schemas sit in the conversation forever; a CLI needs only a few lines of usage docs
- **No moving parts** — no server lifecycle, no desktop client, no OAuth dance; one process per call, ~1s cold start
- **Progressive disclosure** — `screens` → `node` → `images` instead of full-file dumps; field presets and depth control keep output small
- **Cache-aware** — responses are reused while the file's `lastModified` is unchanged

## Install

```bash
npm i -g figma-bridge-cli

# Auth: Figma → Settings → Security → Personal access tokens
mkdir -p ~/.config/figma && chmod 700 ~/.config/figma
printf 'YOUR_TOKEN' > ~/.config/figma/api-key && chmod 600 ~/.config/figma/api-key
```

Requires Node 18+. The upstream `figma-developer-mcp` library declares `engines: >=20.20.0`; the code paths
this project uses are tested on 18.20 in CI, so 18 works in practice — but if your package manager enforces
engines strictly, or you want the upstream package's own floor, use Node 20.20 or newer.

From source:

```bash
git clone https://github.com/SuTang-vain/figma-bridge ~/figma-bridge
cd ~/figma-bridge && npm install
mkdir -p ~/.local/bin && ln -s ~/figma-bridge/bin/figma-bridge.js ~/.local/bin/figma-bridge
```

## Use it from pi

```bash
pi install npm:figma-bridge-cli     # adds one `figma` tool + the figma-bridge skill
```

One tool covers the whole workflow — outline first, then only what you need:

```jsonc
figma({ mode: "screens", ref: "https://www.figma.com/design/<fileKey>/<name>" })   // pages + frames, tiny output
figma({ mode: "node",    ref: "<fileKey>", nodeId: "1:4", depth: 1, fields: "layout+text" })
figma({ mode: "changed", ref: "<fileKey>" })                                       // diff vs your last call
figma({ mode: "variables", ref: "<fileKey>" })                                     // design tokens as CSS vars (Enterprise)
figma({ mode: "images",  ref: "<fileKey>", nodeIds: ["1:4"], outDir: "assets" })
```

The same package stays a plain CLI — `npm i -g figma-bridge-cli` works with any shell-only agent, no pi
required. Inside pi the extension exposes **one** tool with a `mode` enum (`screens | node | changed | images | variables`) rather
than a tool per operation, because tool schemas are a context tax that is paid on every turn.

The `figma-developer-mcp` dependency is used strictly as a library (Framelink's simplification pipeline);
no MCP server or transport is started.

## Where it fits

Two other pi packages cover adjacent ground, and both are good: [`@pi-stef/figma`](https://www.npmjs.com/package/@pi-stef/figma)
(20 REST tools with its own config file) and [`@bigmints.com/pi-figma-bridge`](https://www.npmjs.com/package/@bigmints.com/pi-figma-bridge)
(7 tools bridged to the Figma desktop plugin). Compact output, caching, truncation-with-spill and image
export are **not** unique to this project — they ship those too, and the desktop-plugin route additionally
supports writes with a dry run.

What this project adds: it is **agent-agnostic** (the CLI works with any harness, not only pi), it ships its
agent guidance as a **skill** rather than only tool schemas, and its performance claims are **published and
reproducible** ([BENCHMARKS.md](./BENCHMARKS.md) + `./bench.sh`, including the raw per-round output).

## Cost, privacy and boundaries

- **Zero telemetry.** The only network traffic is the Figma API traffic you asked for — no usage analytics,
  no error reporting; design-file identifiers never leave your machine through this tool.
- **Predictable cost.** No usage-based meter. Figma documents its MCP server as free "during the beta period"
  and [eventually a usage-based paid feature](https://help.figma.com/hc/en-us/articles/32132100833559); figma-bridge
  spends only your plan's REST rate limits, and its cache stretches them further.
- **Headless by design.** Runs anywhere Node 18+ does — CI, servers, containers — with no desktop app.
- **Token discipline.** Context is the scarce resource, so the bundled skill enforces a coarse→fine workflow;
  Figma's own docs cite a single `get_design_context` response of
  [~351k tokens](https://developers.figma.com/docs/figma-mcp-server/mcp-clients-issue) blowing past client
  limits — the failure mode this tool exists to avoid.

Out of scope, on purpose:

- **Writing to Figma files** — the REST API is read-only; this changes only if Figma ships write endpoints.
- **Code Connect / official codegen / FigJam / motion data** — Dev Mode capabilities with no public REST
  equivalent; Figma's own MCP is the right tool for those.
- **Variables without an Enterprise plan** — `/variables/local` is gated by Figma; the mode fails with an
  explicit explanation instead of a cryptic error.

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
figma-bridge changed <fileKey>          # what moved since the last `changed` call (per-depth snapshots)
figma-bridge node <fileKey> <nodeId> --depth 1 --fields layout+text
figma-bridge variables <fileKey>        # design tokens as CSS custom properties (Enterprise plans)
figma-bridge images <fileKey> <id1,id2> -o ./assets --format png --scale 2

# Batch mode for multi-step work (helpers preloaded, top-level await)
figma-bridge nodejs <<'EOF'
cliLog(await getScreens('FILE_KEY'))
cliLog(await getNode('FILE_KEY', '1:4', { depth: 2, fields: 'layout+text' }))
EOF
```

- Full Figma URLs are accepted everywhere — paste the link, no manual fileKey/nodeId extraction:
  `figma-bridge node 'https://www.figma.com/design/<key>/Name?node-id=1-4'`
- `--fields` presets: `all` (default), `layout+text`, `content`, `visuals`, `layout`
- Responses are cached per file and reused while `lastModified` is unchanged
- Agent-facing docs: [skills/figma-bridge/SKILL.md](./skills/figma-bridge/SKILL.md)

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
