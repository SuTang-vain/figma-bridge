#!/bin/bash
# bench.sh — multi-round benchmark: figma-bridge vs figma-mcp (MCP bridge)
# Usage: ./bench.sh [rounds]
#
# Uses an isolated cache directory (FIGMA_BRIDGE_CACHE_DIR) so the user's real
# ~/.cache/figma-bridge is never read or deleted. Prints the measured metadata RTT,
# because every latency number here depends on the network path to api.figma.com.
FK="ymWuCHHNU22zse8nVTVmNN"
ROUNDS="${1:-3}"

TMP_BASE="${TMPDIR:-/tmp}"; TMP_BASE="${TMP_BASE%/}"
CACHE_DIR="$(mktemp -d "$TMP_BASE/fb-bench-cache-XXXXXX")"
export FIGMA_BRIDGE_CACHE_DIR="$CACHE_DIR"
# Only ever remove the directory this script created, and only if it still looks like one.
trap 'case "$CACHE_DIR" in "$TMP_BASE"/fb-bench-cache-*) rm -rf "$CACHE_DIR";; esac' EXIT

echo "cache dir: $CACHE_DIR (user cache untouched: ${HOME}/.cache/figma-bridge)"

measure() { # label, command...
  local label="$1"; shift
  local times=() bytes=""
  for i in $(seq 1 "$ROUNDS"); do
    local start=$(python3 -c 'import time; print(time.time())')
    bytes=$("$@" 2>/dev/null | strip_markers | wc -c | tr -d ' ')
    local end=$(python3 -c 'import time; print(time.time())')
    times+=("$(python3 -c "print(f'{$end-$start:.2f}')")")
  done
  report "$label" "${times[*]}" "$bytes"
}

# The cache marker depends on whether the metadata check succeeded, so strip it from the
# byte count: sizes must not drift with network conditions between rounds.
strip_markers() { sed -E 's/\(cache hit(, unverified)?\)//g'; }

# Same as measure, but the script file is re-fed on stdin for every round: a redirect
# applied once is consumed by round 1, so later rounds would benchmark an empty script.
measure_stdin() { # label, scriptfile, command...
  local label="$1"; local script="$2"; shift 2
  local times=() bytes=""
  for i in $(seq 1 "$ROUNDS"); do
    local start=$(python3 -c 'import time; print(time.time())')
    bytes=$("$@" < "$script" 2>/dev/null | strip_markers | wc -c | tr -d ' ')
    local end=$(python3 -c 'import time; print(time.time())')
    times+=("$(python3 -c "print(f'{$end-$start:.2f}')")")
  done
  report "$label" "${times[*]}" "$bytes"
}

report() { # label, space-separated times, bytes
  local label="$1"; local times="$2"; local bytes="$3"
  local med=$(printf '%s\n' $times | sort -n | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}')
  echo "$label | ${med}s | ${bytes}B | rounds: ${times}"
}

rtt_probe() { # median ms of 3 depth=1 metadata calls, the per-invocation cost the cache cannot remove
  node -e "
    (async () => {
      const { readFileSync } = require('node:fs');
      const token = process.env.FIGMA_API_KEY
        || readFileSync(process.env.HOME + '/.config/figma/api-key', 'utf8').trim();
      const times = [];
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const res = await fetch('https://api.figma.com/v1/files/$FK?depth=1', { headers: { 'X-Figma-Token': token } });
        if (!res.ok) throw new Error('Figma API ' + res.status);
        await res.json();
        times.push(Date.now() - t0);
      }
      times.sort((a, b) => a - b);
      console.log(times[1] + ' ms (median of 3, raw metadata RTT)');
    })().catch((e) => { console.log('unavailable: ' + e.message); });
  "
}

echo "--- network ---"
echo "metadata RTT: $(rtt_probe)"
echo "--- cold (empty cache) ---"
measure "bridge node depth1 layout+text (cold)" figma-bridge node "$FK" 1:4 --depth 1 --fields layout+text
echo "--- warm (cached) ---"
measure "bridge node depth1 layout+text (warm)" figma-bridge node "$FK" 1:4 --depth 1 --fields layout+text
measure "bridge screens" figma-bridge screens "$FK"
measure "bridge node depth1 all" figma-bridge node "$FK" 1:4 --depth 1 --fields all
measure "bridge node depth3 all" figma-bridge node "$FK" 1:4 --depth 3 --fields all
measure "bridge node 2:1 depth2 all" figma-bridge node "$FK" 2:1 --depth 2 --fields all
echo "--- old MCP chain (figma-mcp) ---"
measure "mcp data 1:4 depth1" figma-mcp data "$FK" 1:4
measure "mcp call get_figma_data depth1" figma-mcp call get_figma_data "{\"fileKey\":\"$FK\",\"nodeId\":\"1:4\",\"depth\":1}"
measure "mcp call get_figma_data depth3" figma-mcp call get_figma_data "{\"fileKey\":\"$FK\",\"nodeId\":\"1:4\",\"depth\":3}"
echo "--- batch mode (3 ops + their output in one process) ---"
BENCH_SCRIPT=$(mktemp /tmp/fb-bench-XXXX.mjs)
cat > "$BENCH_SCRIPT" <<'EOF'
cliLog(await getScreens('ymWuCHHNU22zse8nVTVmNN'))
cliLog(await getNode('ymWuCHHNU22zse8nVTVmNN', '1:4', { depth: 1 }))
cliLog(await getNode('ymWuCHHNU22zse8nVTVmNN', '2:1', { depth: 2 }))
EOF
measure_stdin "bridge nodejs batch(screens+node+node)" "$BENCH_SCRIPT" figma-bridge nodejs
rm -f "$BENCH_SCRIPT"
