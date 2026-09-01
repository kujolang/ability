#!/usr/bin/env bash
set -euo pipefail

ABILITY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ABILITY_ROOT/.." && pwd)"
KUJO_BIN="${KUJO_BIN:-$WORKSPACE_ROOT/kujo/target/debug/kujo}"

cd "$ABILITY_ROOT"
bash -n tests/*.sh scripts/*.sh
python3 -m json.tool schema/ability.schema.json >/dev/null
python3 -m json.tool examples/content_find.json >/dev/null
test -f .github/workflows/ci.yml
test -f .github/workflows/release.yml
rg -q 'actions/attest-build-provenance@[0-9a-f]{40}' .github/workflows/release.yml
rg -q 'anchore/sbom-action@[0-9a-f]{40}' .github/workflows/release.yml
if rg -q 'uses: [^#[:space:]]+@(main|master|v[0-9]+)([[:space:]]|$)' .github/workflows/*.yml; then
  echo "Mutable GitHub Action reference detected." >&2
  exit 1
fi
bash tests/run_tests.sh
bash tests/check_consumers.sh

if [[ -f "$WORKSPACE_ROOT/fence/fence.kujo" ]]; then
  "$KUJO_BIN" run "$WORKSPACE_ROOT/fence/fence.kujo" -- validate
  "$KUJO_BIN" run "$WORKSPACE_ROOT/fence/fence.kujo" -- check
fi

git diff --check
echo "ability release verification: all checks passed"
