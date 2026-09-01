#!/usr/bin/env bash
set -euo pipefail

ABILITY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ABILITY_ROOT/.." && pwd)"
KUJO_BIN="${KUJO_BIN:-$WORKSPACE_ROOT/kujo/target/debug/kujo}"

canonical_schema="$(mktemp)"
agents_schema="$(mktemp)"
trap 'rm -f "$canonical_schema" "$agents_schema"' EXIT

jq -S . "$ABILITY_ROOT/schema/ability.schema.json" > "$canonical_schema"

if [[ -d "$WORKSPACE_ROOT/cms" ]]; then
  test ! -f "$WORKSPACE_ROOT/cms/schemas/ability.schema.json"
  rg -q '^from ability import .*validate_ability_definition' "$WORKSPACE_ROOT/cms/backend/modules/ability_contract.kujo"
  rg -q '^name = "ability"$' "$WORKSPACE_ROOT/cms/kennel.lock"
  rg -q '^requested_kind = "commit"$' "$WORKSPACE_ROOT/cms/kennel.lock"
  (cd "$WORKSPACE_ROOT/cms" && "$KUJO_BIN" test-run tests/cms_contract_tests.kujo -v)
fi

if [[ -d "$WORKSPACE_ROOT/agents-sdk" ]]; then
  jq -S . "$WORKSPACE_ROOT/agents-sdk/config/ability.schema.json" > "$agents_schema"
  diff -u "$canonical_schema" "$agents_schema"
  (cd "$WORKSPACE_ROOT/agents-sdk" && "$KUJO_BIN" test-run tests/ability_contract_tests.kujo -v)
fi

if [[ -d "$WORKSPACE_ROOT/mcp" ]]; then
  (cd "$WORKSPACE_ROOT/mcp" && KUJO_BIN="$KUJO_BIN" bash tests/test_01_unit_harness.sh)
fi

echo "ability consumer conformance: all checks passed"
