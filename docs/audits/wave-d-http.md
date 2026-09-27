# Wave D local HTTP audit and implementation plan

Pre-code audit, 2026-09-27. Fetched main is clean and equals origin/main:
Ability ca9acea544e9a8a806f1f09d42b4ca7b5299bd18;
Ability Gateway d7934e267826aba2525c042e56cc6e74a460e547;
MCP a7ec0dd8e6bcae303ab1431b4586dfe3e91f3a5a;
Dispatch36965677fa1fd752dd24c0098097a1f72c4c7037;
Kujo4af979a30e48c8e28eec7502846300355dc059cb.

## Existing source truth

MCP integrations/kujo-ability/bin/kujo-ability-mcp.mjs uses POST
/v1/abilities/publication/create/run (catalog-selected execution route), JSON
input/invocation, Idempotency-Key, X-Request-ID and authenticated gateway headers.
Its fetch uses AbortController (default30s, configured1..60s), bounded response and
no retry loop. Those headers are assertions; the application enforces identity.

Ability examples/application-assurance/gateway.kujo is the authenticated SQLite
publication application: hashed session token lookup, principal binding, live expiry/
revocation, request/key commitments, unique business key, separate receipt commit,
independent readback and explicit recovery fencing. Its beta profile fixes surface
sdk. That application surface stays sdk beneath HTTP, as beneath MCP; no profile
change or new backend verifier is needed.

The separate ability-gateway/src/api.ts exposes OAuth/D1 /v1/invoke with32KiB body,
approvals and seeded echo/publish-preview operations. README and architecture docs
explicitly exclude customer backend execution adapters. It cannot host the proven
SQLite profile without redesigning its control plane. Do not change it.

No OpenAPI description for this exact local publication action was found in those
contract surfaces. Add one bounded operation, not an importer or new business API.

## Ownership

Client X-Request-ID is attribution. HTTP method, exact route and operation ID identify
transport action. Host-generated request/admission IDs are distinct and bound to a
controller-owned ticket. Ability invocation/receipt/transaction are application
facts; session DB establishes principal authentication. Dispatch run/step/attempt/
effect and current admission come only from host files, never HTTP body/query/header.

## Planned slice and validation

Ability examples/controlled-http will contain a local-only HTTP transport fixture
around the existing Kujo application subprocess, with owner-published OpenAPI and
closed4096-byte reference handoff. Node is restricted to real socket lifecycle,
stream bounds, duplicate delivery and deterministic disconnect/timeout injection;
all business execution/authentication/idempotency/assurance remains existing Kujo.
This test-transport exception avoids a second application implementation and permits
actual socket loss, unavailable as a handler response. No Python application bridge.

Host input/request/ticket binding, atomic one-use claims, pre-mutation expiry/current
attempt recheck; no retries. Request4096, response8192, headers4096/16pairs, inflight4,
body deadline2s, application subprocess20s, client30s (fault timeout100ms), server
request deadline25s, controller90s. Evidence refs cannot choose roots or URLs.

Dispatch adds only a correlation reader and fixture composition under existing
locked beta verification. Real scenarios: pre-commit timeout, committed response
loss, concurrent duplicate delivery, explicit pre-commit application error. Retain
unknown completion until live readback. Test substitutions, malicious headers/body,
symlink/path/URL, expiry/stale/reuse, restart, standalone, privacy. Run Ability full
release gate, Dispatch full gate including SDK/MCP and all Wave C regressions; Kujo
docs checks. Review handoff commonality without unifying contracts.

## Implemented result and review

The existing Kujo application/profile is unchanged. New files under
examples/controlled-http provide only the bounded loopback transport, real socket
fault harness and one-operation OpenAPI description; schema/http-ability-handoff-
v1alpha1.schema.json owns the reference shape. Dispatch's reader remains correlation
only, composed under its existing live beta admission.

Targeted real scenarios pass response loss after commit, timeout before commit and
explicit handler failure, each with concurrent duplicate delivery, one final business
row/receipt, fresh controller/server/client, standalone replay,21 malformed/forged HTTP
requests per attempt and24 reference/schema/integrity rejections. Actual locked denial
invalidates its checkpoint, and only a new checkpoint admits verified continuation.

Fresh review enforces fixed route/method/operation, nullable receipt ID grammar,
strict UTF8, duplicate/oversize headers, body/inflight/deadline bounds and disjoint
OpenAPI response branches. Explicit handler failure also returns the established
Ability receipt-finalization error, preserving execution_status=failed; independent
readback, not that code, proves business absence. No runtime repair or profile rewrite.

Ability full scripts/verify-release.sh passed locally, including the new HTTP contract
check. Cross-repository full-gate evidence and final report are retained in Dispatch
under docs/evidence/wave-d-http and docs/audits/wave-d-http.md. No hosted CI claim.
