#!/bin/bash
# bench.sh — multi-round benchmark: figma-bridge vs figma-mcp (MCP bridge)
# Usage: ./bench.sh [rounds]
FK="ymWuCHHNU22zse8nVTVmNN"
ROUNDS="${1:-3}"

measure() { # label, command...
  local label="$1"; shift
  local times=() bytes=""
  for i in $(seq 1 "$ROUNDS"); do
    local start=$(python3 -c 'import time; print(time.time())')
    bytes=$("$@" 2>/dev/null | wc -c | tr -d ' ')
    local end=$(python3 -c 'import time; print(time.time())')
    times+=("$(python3 -c "print(f'{$end-$start:.2f}')")")
  done
  # median
  local med=$(printf '%s\n' "${times[@]}" | sort -n | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}')
  echo "$label | ${med}s | ${bytes}B"
}

rm -rf ~/.cache/figma-bridge   # cold start

echo "--- cold (no cache) ---"
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
echo "--- batch mode (3 ops in one process) ---"
BENCH_SCRIPT=$(mktemp /tmp/fb-bench-XXXX.mjs)
cat > "$BENCH_SCRIPT" <<'EOF'
await getScreens('ymWuCHHNU22zse8nVTVmNN')
await getNode('ymWuCHHNU22zse8nVTVmNN', '1:4', { depth: 1 })
await getNode('ymWuCHHNU22zse8nVTVmNN', '2:1', { depth: 2 })
EOF
measure "bridge nodejs batch(screens+node+node)" figma-bridge nodejs < "$BENCH_SCRIPT"
rm -f "$BENCH_SCRIPT"
