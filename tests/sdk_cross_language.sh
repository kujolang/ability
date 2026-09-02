#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ -z "${KUJO_BIN:-}" || ! -x "$KUJO_BIN" ]]; then
	echo "ERROR: KUJO_BIN must point to an executable Kujo runtime"
	exit 1
fi

typescript_result="$(node tests/sdk_conformance_ts.ts)"
python_result="$(python3 tests/sdk_conformance_python.py)"

if [[ "$typescript_result" != "$python_result" ]]; then
	echo "TypeScript and Python Ability SDK conformance outputs differ"
	echo "TypeScript: $typescript_result"
	echo "Python: $python_result"
	exit 1
fi

typescript_digest="$(printf '%s' "$typescript_result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["digest"])')"
kujo_digest="$("$KUJO_BIN" run tests/sdk_digest_kujo.kujo --interpreter)"
if [[ "$typescript_digest" != "$kujo_digest" ]]; then
	echo "Kujo, TypeScript, and Python canonical definition digests differ"
	exit 1
fi

python3 -m py_compile sdk/python/kujo_ability/__init__.py

echo "Kujo/TypeScript/Python Ability SDK conformance passed"
