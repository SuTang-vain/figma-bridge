# figma-bridge

Figma design data CLI for AI agents — no MCP, no desktop app.

`figma-bridge` turns the Figma REST API into compact, agent-friendly text, reusing the
[Framelink](https://github.com/GLips/Figma-Context-MCP) simplification pipeline as a library.
Built for shell-only agents (pi, custom scripts, any agent without MCP support).

## Why not MCP?

- No server lifecycle, no desktop client, no protocol overhead — one process per call, ~1s cold start
- Tool schemas stay out of the conversation context — agents only need a few lines of usage docs
- Progressive disclosure (`screens` → `node` → `images`) cuts token usage vs. full-file dumps

## Install

```bash
git clone https://github.com/SuTang-vain/figma-bridge ~/figma-bridge
cd ~/figma-bridge && npm install
mkdir -p ~/.local/bin && ln -s ~/figma-bridge/bin/figma-bridge.js ~/.local/bin/figma-bridge

# Auth: Figma → Settings → Security → Personal access tokens
mkdir -p ~/.config/figma && chmod 700 ~/.config/figma
printf 'YOUR_TOKEN' > ~/.config/figma/api-key && chmod 600 ~/.config/figma/api-key
```

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
