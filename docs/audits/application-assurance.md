# Application assurance audit and implementation plan

Baseline (2026-09-26, clean fetched main): Ability
63d4367d677ce350bb2756dab02603170ca44cee; Dispatch
0a7551db5c5b7f7c1c90ccfd2c9acc60e369833a; Workcell
b34c26c90a8626c988a4234fd2610dcf11df1634; Kujo
62f809d30c78c2deaa7003cf6790b4f219c21411. Requested prior Wave C
commits are ancestors. Workcell and runtime need no changes.

## Source-backed trust map

| Value/decision | Source | Authority |
|---|---|---|
| invocation/request/trace IDs, surface, principal/tenant | `src/contracts.kujo`, `src/runtime.kujo::normalized_invocation` | caller assertions; shape validation is not authentication |
| exact Ability version, definition digest, handler | `src/registry.kujo::resolve_ability` | registered application facts; digest derived from definition |
| request digest | `src/runtime.kujo::execute_ability` | derived v1 `json_digest` of Ability ID/version/definition/input/principal |
| key digest | same | derived v1 digest of named tenant/type/principal/key fields |
| policy decision | application `policy` callback | application authorization, not identity authentication |
| receipt ID | `next_id`, application factory | application attribution; persistence supplied externally |
| replay receipt | `validate_replay_receipt` | schema, Ability/version/definition/principal/surface/output checked; service is trusted to bind request/key and receipt bytes |
| business transaction | handler-owned | no generic runtime transaction identity |
| audit event | `audit_event` callback | application persistence claim; runtime fails closed by default |
| begin states | `execute_ability` | application callback asserts started/replay/in_progress/conflict; runtime supplies no database exclusion |
| complete | `finalize_execution` | completion audit and terminal receipt precede callback; callback failure returns commit_failed with original result retained |

`docs/SECURITY_MODEL.md` correctly assigns authentication to server state.
The runtime itself never authenticates JSON principal fields. Existing runtime
fixtures use in-memory callbacks, not an application SQLite gateway. A replay
receipt with valid identity/output but wrong request/key digests can pass runtime
validation; demonstrate this trust seam, then bind it in the experimental gateway
before returning replay. Stable receipt schema and digest algorithms stay intact.

## Narrow plan

- Add Kujo-native experimental gateway under `examples/application-assurance/`.
  Operator-owned SQLite state authenticates a separate local session credential;
  untrusted invocation principal must match it. No credential in assurance/logs.
- Separate durable business and replay receipt transactions. Unique application
  key + request identity, fenced owner, exact receipt hash and transaction linkage.
  Recovery is explicit and fenced; ordinary duplicate invocation remains
  in_progress or existing Ability receipt replay.
- Add a bounded application profile, referenced by existing alpha1 evidence digest.
  Bind Ability/version/definition/surface/authenticated principal/request/key and
  business transaction without payloads. Reuse alpha1 outer Dispatch bindings.
  Add a mechanism enum only if required to avoid claiming the two commits are atomic.
- Fresh verification and final gateway admission check live revocation and expiry
  under SQLite write exclusion; prior successful validation is never a bearer grant.
- Node maintenance harness drives real Kujo processes, SIGKILL barriers, fresh
  verification/controllers, concurrency, tampering and privacy. Dispatch fixture
  exercises its existing opt-in preparation and unchanged v1 replay policy.
- Run Ability release gate, Dispatch release gate, existing SQLite/Git fixtures,
  relevant Wave A regression. Review authentication, dual commits, fencing,
  TOCTOU, fixed diagnostics, bounds and denial-state preservation before push.

This remains experimental. No exactly-once, universal rollback, global IAM,
production gateway or stable assurance contract is claimed.

## Implemented profile and evidence

`examples/application-assurance/gateway.kujo` is an experimental application,
not a new stable Ability API. Its publication handler stores a private business
body in SQLite; only its digest enters the fixed 14-field profile. The profile
binds Ability ID/version/definition/surface, principal and tenant digests,
unchanged v1 key/request digests, an additional v2 canonical intent digest,
input digest, operation, target and logical transaction digest.
`schema/application-assurance-v1alpha1.schema.json` closes this shape.

The operator provisions a random local session credential hash, canonical
principal, validity and revocation in SQLite. The credential travels separately
through the process environment. JSON principal fields must match this external
mapping. This demonstrates an authenticated local application seam, not isolation
from the same OS user or protection against an operator replacing the database.
Use a private directory; never accept database/executable/configuration paths
from producer JSON. No remote evidence fetching occurs.

SQLite uses WAL, FULL synchronous writes, a five-second busy timeout and
BEGIN IMMEDIATE for admission/consistent inspection. Requests have a unique
key, normalized request/profile and random owner fence; business records have
unique key and transaction; receipts store exact bytes, digest and transaction.
Recovery changes the owner fence without deleting keys or business evidence.
The handler rechecks the fence, live authorization and expiry inside its write
transaction. A retry can run the handler again, but the existing exact business
record remains the single logical publication. This is not exactly-once execution.

Business commit and receipt commit are separate. A fresh verifier checks both,
including private body's digest, receipt bytes, receipt identity bindings and
returned transaction. Receipt absence with a verified business row is committed,
not failed. Missing/unreadable store fails closed; completed receipt without
matching business state is rejected. There is no inference of absence from a
failed query. Revocation rejects live verification and final gateway admission.
Audit rows contain phase and invocation digest only; storage/retention policy
beyond this bounded fixture remains application-owned.

## Compatibility and limitations

The stable Ability runtime/receipt schema and v1 digest algorithms are unchanged.
The runtime trust-seam test explicitly demonstrates that an application callback
can return a structurally valid receipt with a different request digest. Gateway
inspection rejects that substitution (including when bytes are rehashed) before
returning replay. Stable API hardening/migration requires a separate decision.

The base `dispatch.effect-assurance/v1alpha1` needs one additive mechanism enum,
`ability_application_gateway`. Calling this `sqlite_unique_transaction` would
incorrectly imply the two commits were atomic. No new outer fields are needed:
`evidence_ref` commits the profile, observed business state, nullable receipt
SHA-256 and verification method. `precondition_sha256` commits the exact profile;
`key_sha256` hashes the Ability key digest used as the v1 effect's opaque key.
Receipt hashes may change after recovery; old assurance cannot authorize a new
attempt or bypass fresh verification. Issuer registry, principal credential and
admitted invocation are all host configuration, never producer authority.

Dispatch's new host-only admission callback reloads authoritative state and
keeps the run lock through preparation/publication/execution. The gateway checks
again under its independent application transaction. These locks are not a
cross-store transaction: revocation after Dispatch admission can still prevent
the business mutation and cause a new controlled failure. A validated document
is not an immortal safe token. Session expiry is half-open, with a maximum
one-hour envelope accepted by Dispatch; clock correctness is operator-owned.

Application inputs are bounded to 4 KiB, body to 1024 characters; receipt and
adapter output to 8 KiB; Dispatch result to 1 MiB; assurance to 8 KiB, one effect,
one digest reference. Profile values are fixed enums/identifiers or SHA-256.
No arbitrary target strings, paths, URLs, payloads or credentials enter evidence.
Provider adapters, production service hardening, database rollback detection,
authenticated remote transport and generic recovery are outside this prototype.

## Validation campaign

`tests/application_assurance.mjs` drives real Kujo subprocesses. Six deterministic
SIGKILL barriers cover before business, before business commit, after business
commit, before receipt commit, after receipt commit and before reply. Every
recoverable case uses a fresh verifier/executor and finishes with one business
row. Six concurrent contenders are genuinely simultaneous; scheduling-dependent
replay/in-progress counts are recorded in proof JSON, with exactly one admitted
first execution and one logical effect.

`commit_failed` is exercised with business absent, committed, and unavailable
external state. The latter is blocked. Delayed handler admission independently
rejects revocation/expiry after early authentication. Cross-tenant/principal,
changed input/key/version/definition, stale transaction, changed/rehashed receipt,
forged credentials, malicious local references, oversized/conflicting assurance,
wrong Dispatch subject and exact-result bytes are denied. Denied Dispatch
continuations preserve exact state bytes. A payload canary is present in the
private business table and absent from assurance, verifier/controller output and
Dispatch JSON/journal records.
