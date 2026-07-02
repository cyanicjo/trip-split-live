#!/bin/sh
set -eu

if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Node.js is required to run this app."
  exit 1
fi

cd "$(dirname "$0")"
exec "$NODE_BIN" server.js
