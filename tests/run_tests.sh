#!/usr/bin/env bash
set -euo pipefail

ABILITY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KUJO_BIN="${KUJO_BIN:-$ABILITY_ROOT/../kujo/target/debug/kujo}"

cd "$ABILITY_ROOT"
"$KUJO_BIN" run tests/contract_tests.kujo --interpreter
"$KUJO_BIN" run tests/runtime_contract_tests.kujo --interpreter
KUJO_BIN="$KUJO_BIN" bash tests/sdk_cross_language.sh
node tests/registry_trust_test.mjs
"$KUJO_BIN" check ability.kujo
