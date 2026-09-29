#!/usr/bin/env bash
set -euo pipefail

ABILITY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KUJO_BIN="${KUJO_BIN:-$ABILITY_ROOT/../kujo/target/debug/kujo}"

cd "$ABILITY_ROOT"
"$KUJO_BIN" run tests/application_commitment_vectors.kujo
"$KUJO_BIN" run tests/contract_tests.kujo --interpreter
"$KUJO_BIN" run tests/runtime_contract_tests.kujo --interpreter
KUJO_BIN="$KUJO_BIN" bash tests/sdk_cross_language.sh
node tests/registry_trust_test.mjs
node tests/devkit_test.mjs
node tests/controlled_http_contract_test.mjs
"$KUJO_BIN" check ability.kujo

node tests/semantics_devkit.mjs
ABILITY_TEST_CWD="$PWD" ABILITY_TEST_NODE="$(command -v node)" ABILITY_PARENT_CANARY=secret-marker "$KUJO_BIN" run tests/json_process_tests.kujo --interpreter
