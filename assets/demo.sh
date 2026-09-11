#!/bin/bash
# demo.sh — scripted terminal demo for asciinema recording
URL='https://www.figma.com/design/ymWuCHHNU22zse8nVTVmNN/Food-delivery-app?node-id=1-4'

type_out() {
  printf '$ '
  for ((i=0; i<${#1}; i++)); do printf '%s' "${1:i:1}"; sleep 0.035; done
  sleep 0.5; echo
}

clear
type_out "figma-bridge screens $URL"
figma-bridge screens "$URL" | head -13
echo '  ... 13 more screens'
sleep 1.6
echo
type_out "figma-bridge node $URL --depth 1 --fields layout+text"
figma-bridge node "$URL" --depth 1 --fields layout+text | head -11
echo '  ...'
sleep 1.6
echo
type_out "echo 'cliLog(await getNode(url, null, {depth: 1, fields: \"layout+text\"}))' | figma-bridge nodejs"
echo 'cliLog(await getNode(process.env.DEMO_URL, null, {depth: 1, fields: "layout+text"}))' | DEMO_URL="$URL" figma-bridge nodejs | head -14
echo '  ...'
sleep 2
