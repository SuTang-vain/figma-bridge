# Benchmarks

Measured 2026-09-11 on macOS (Apple Silicon), home broadband, against the public community file
[`ymWuCHHNU22zse8nVTVmNN`](https://www.figma.com/design/ymWuCHHNU22zse8nVTVmNN/)
(Food delivery app UI kit, 20+ screens). Each cell is the **median of 3 rounds**.
Comparison target: `figma-mcp` = mcptools → `figma-developer-mcp` MCP server over stdio
(the usual way to give shell-only agents Figma access via MCP).

## Latency (median)

| Operation | figma-bridge | via MCP bridge | Speedup |
|---|---|---|---|
| `node 1:4 --depth 1 --fields layout+text` (cold, no cache) | 1.31s | 1.33s | ~1x |
| `node 1:4 --depth 1` (warm cache) | 0.92s | — | — |
| `screens` (whole-file outline) | 1.07s | n/a (no equivalent) | — |
| `node 1:4 --depth 3 --fields all` | 1.03s | 1.24s | 1.2x |
| `node 2:1 --depth 2 --fields all` | 1.11s | 1.44s | 1.3x |
| `nodejs` batch: screens + 2 nodes in one process | **0.18s** total | ~4s as 3 separate MCP calls | ~20x |

Note: MCP-bridge timings here are with a warm npx cache; cold npx adds several more
seconds per call (measured up to 3.1s). figma-bridge has no npx layer at all.

## Output size (bytes of CLI output — proxy for tokens fed to the agent)

| Query | figma-bridge | via MCP bridge | Saving |
|---|---|---|---|
| node 1:4, depth 1, `fields=layout+text` | **1,783 B** | 3,015 B | −41% |
| node 1:4, depth 1, `fields=all` | 2,791 B | 3,015 B | −7% |
| node 1:4, depth 3, `fields=all` | 3,337 B | 3,673 B | −9% |
| whole-file outline | **1,846 B** (`screens`) | only possible via full-file pull | — |

The biggest saving is structural, not per-node: a `screens` outline (~1.8 KB) plus one
targeted `node` call answers most "what is in this file / implement this screen" tasks
without ever pulling the full file. Per-node savings vary with content: v0.2.0's extra
compaction (dropping default `layout={mode:"none"}` and TEXT names that duplicate their
content) helped ~3% on this absolutely-positioned file, and helps more on auto-layout- and
text-heavy files where those patterns are common.

## Caching behavior

- Repeated queries against an unchanged file (`lastModified` identical) are served from
  `~/.cache/figma-bridge` — verified by the `(cache hit)` marker in output.
- Cache saves API quota (rate limits) more than wall-clock latency, since a lightweight
  metadata check (~1 API call) is still made per invocation.

## Reproduce

```bash
./bench.sh 3   # rounds
```

Requires `figma-bridge` and `figma-mcp` on PATH with `~/.config/figma/api-key` configured.

## Caveats

- One (well-structured) community file; your mileage varies with file size and nesting.
- 3 rounds per cell — enough for a stable median on this machine, not a statistical study.
- Output bytes ≈ tokens fed to the agent; actual tokenizer ratios vary by model.
