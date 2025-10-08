#!/usr/bin/env bash
set -euo pipefail

# Simple local test harness using npx tsx to run the server and send a JSON-RPC request via stdin

echo '--- Building ---'
npm run build >/dev/null

echo '--- capture_idea ---'
node dist/index.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"capture_idea","arguments":{"text":"My recent knowledge notes feel too fragmented; I need a temporal context view."}}}
EOF

echo '--- find_related_thoughts ---'
node dist/index.js <<'EOF'
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"find_related_thoughts","arguments":{"query":"knowledge management timeline"}}}
EOF

echo '--- timeline_reconnect ---'
node dist/index.js <<'EOF'
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"timeline_reconnect","arguments":{"topic":"knowledge management"}}}
EOF
