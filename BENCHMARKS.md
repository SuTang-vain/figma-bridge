# Benchmarks

Measured 2026-09-20 on macOS (Apple Silicon), Node v25.2.1, home broadband, against the public
community file [`ymWuCHHNU22zse8nVTVmNN`](https://www.figma.com/design/ymWuCHHNU22zse8nVTVmNN/)
(Food delivery app UI kit, 20+ screens). Each cell is the **median of 3 rounds**.

**Network conditions dominate this table.** Every command makes at least one live call to
`api.figma.com` (the cache still revalidates `lastModified`), so the latency columns are mostly the
round trip measured on the day: **718 ms median metadata RTT** for this run, with 489–3100 ms
observed on the same machine and connection across the session. Read the latency numbers as
"one network round trip plus ~0.1 s of process start", not as constants. On a fast link they shrink
together; the *ratios* are what figma-bridge controls.

Comparison target: `figma-mcp` = mcptools → `figma-developer-mcp` MCP server over stdio
(the usual way to give shell-only agents Figma access via MCP).

## Latency (median of 3 rounds)

| Operation | figma-bridge | via MCP bridge | Speedup |
|---|---|---|---|
| `node 1:4 --depth 1 --fields layout+text` (cold cache) | 0.95s | 1.24s | 1.3x |
| `node 1:4 --depth 1 --fields layout+text` (warm cache) | 0.74s | 1.24s | 1.7x |
| `screens` (whole-file outline) | 1.81s | n/a (no equivalent) | — |
| `node 1:4 --depth 1 --fields all` | 0.73s | 1.24s | 1.7x |
| `node 1:4 --depth 3 --fields all` | 0.80s | 1.53s | 1.9x |
| `node 2:1 --depth 2 --fields all` | 1.60s | 1.24s | 0.8x |
| `nodejs` batch: screens + 2 nodes + their output, one process | 1.82s | ~4.2s as 3 separate MCP calls | 2.3x |

Per-round spread is large because the network is: the raw output for this run is reproduced verbatim
below, including every round, so the medians can be checked cell by cell.

```
cache dir: /var/folders/.../fb-bench-cache-ThdnIR (user cache untouched: ~/.cache/figma-bridge)
--- network ---
metadata RTT: 718 ms (median of 3, raw metadata RTT)
--- cold (empty cache) ---
bridge node depth1 layout+text (cold) | 0.95s | 1772B | rounds: 1.70 0.95 0.77
--- warm (cached) ---
bridge node depth1 layout+text (warm) | 0.74s | 1772B | rounds: 1.83 0.74 0.71
bridge screens | 1.81s | 1509B | rounds: 1.47 1.81 2.16
bridge node depth1 all | 0.73s | 2780B | rounds: 0.73 1.08 0.70
bridge node depth3 all | 0.80s | 3326B | rounds: 1.65 0.80 0.75
bridge node 2:1 depth2 all | 1.60s | 3926B | rounds: 1.60 1.80 0.69
--- old MCP chain (figma-mcp) ---
mcp data 1:4 depth1 | 1.40s | 3673B | rounds: 1.40 1.44 1.26
mcp call get_figma_data depth1 | 1.24s | 3015B | rounds: 1.24 1.26 1.24
mcp call get_figma_data depth3 | 1.53s | 3673B | rounds: 1.58 1.53 1.27
--- batch mode (3 ops + their output in one process) ---
bridge nodejs batch(screens+node+node) | 1.82s | 8216B | rounds: 3.37 1.82 1.68
```

The batch row is measured with the script re-fed on stdin for every round. The MCP comparison is
the three `figma-mcp` rows above summed (1.40 + 1.24 + 1.53 = 4.17s), i.e. three server round trips
versus one process.

## Correction to the previous revision

The earlier revision of this file claimed batch mode at **0.18s / ~20x**. That was a harness
artifact, not a measurement: `bench.sh` redirected the script file once *outside* the round loop, so
round 1 consumed stdin and rounds 2–3 executed an **empty script**. The median then picked one of the
two empty-script runs (reproduced exactly: rounds `2.19s / 0.19s / 0.17s` → median `0.19s`).
`bench.sh` now re-feeds the script per round (`measure_stdin`) and the honest figure is **1.82s**,
about **2.3x** faster than three separate MCP calls — real, but not 20x, and mostly the cost of
three network round trips that no CLI design can remove.

## Output size (bytes of CLI output — proxy for tokens fed to the agent)

| Query | figma-bridge | via MCP bridge | Saving |
|---|---|---|---|
| node 1:4, depth 1, `fields=layout+text` | **1,772 B** | 3,015 B | −41% |
| node 1:4, depth 1, `fields=all` | 2,780 B | 3,015 B | −8% |
| node 1:4, depth 3, `fields=all` | 3,326 B | 3,673 B | −9% |
| whole-file outline | **1,509 B** (`screens`) | only possible via full-file pull | — |

Size counts exclude the `(cache hit)` / `(cache hit, unverified)` marker, which depends on whether
the metadata check succeeded and would otherwise make this column drift between rounds.

The biggest saving is structural, not per-node: a `screens` outline (1.5 KB) plus one targeted `node`
call answers most "what is in this file / implement this screen" tasks without ever pulling the full
file. Per-node savings vary with content: dropping default `layout={mode:"none"}` and TEXT names that
duplicate their content helps ~3% on this absolutely-positioned file, and helps more on auto-layout-
and text-heavy files where those patterns are common. `screens` no longer prints a meaningless
`(0 children)` suffix on every frame, which is where the 1,846 B → 1,509 B difference comes from.

## Caching behavior

- Repeated queries against an unchanged file are served from the cache, verified by the `(cache hit)`
  marker. Each invocation still makes one lightweight `?depth=1` metadata call to confirm
  `lastModified` — that call is the floor on warm latency, and it is why the warm rows are not
  milliseconds.
- If that metadata call fails (offline, rate-limited, lost permission) the cached copy is still
  served and labelled `(cache hit, unverified)` instead of failing the command. With no cache to fall
  back on, the original error surfaces.
- `FIGMA_BRIDGE_CACHE_DIR` overrides the cache location. `bench.sh` uses it to work in a temp
  directory, so running the benchmark never reads or deletes `~/.cache/figma-bridge`.

## Reproduce

```bash
./bench.sh 3   # rounds
```

Requires `figma-bridge` and `figma-mcp` on PATH with `~/.config/figma/api-key` (or `$FIGMA_API_KEY`)
configured. The script prints the measured metadata RTT next to the timings, because a table like
this is only meaningful together with the network it was taken on.

## Caveats

- One (well-structured) community file; your mileage varies with file size and nesting.
- 3 rounds per cell — enough for a stable median on a busy network, not a statistical study.
- Output bytes ≈ tokens fed to the agent; actual tokenizer ratios vary by model.
- MCP-bridge timings are with a warm npx cache; a cold npx adds seconds per call. figma-bridge has no
  npx layer at all, which is part of why its floor is lower.
