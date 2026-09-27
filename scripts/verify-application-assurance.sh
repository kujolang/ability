#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${KUJO_BIN:?Use a reviewed source Kujo runtime with read_file_beneath support}"
command -v sqlite3 >/dev/null
"$KUJO_BIN" check examples/application-assurance/gateway.kujo
node tests/application_assurance.mjs "$@"
