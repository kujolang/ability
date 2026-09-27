# Ability application gateway assurance profile

Owner kujolang/ability; ID `ability.application-gateway`. Exact `1alpha1` supports
only dispatch.effect-assurance/v1alpha1; proposed `1beta1` supports only v1beta1.
[Metadata](assurance-profile.json), [vectors](../../tests/vectors/application-assurance-commitments.json).
The closed beta [binding schema](bindings-v1beta1.schema.json) is additional to the
generic envelope, not optional validation. Generic encoding and admission rules are in Dispatch's
[portable commitments](https://github.com/kujolang/dispatch/blob/main/docs/contracts/portable-commitments.md)
and [migration contract](https://github.com/kujolang/dispatch/blob/main/docs/contracts/beta-migration.md).
This is the bounded application publication gateway profile, NOT universal Ability
idempotency assurance. Application owners must register a new predicate/version
for different business semantics; a shared SQLite technology is not enough.

## Predicate and domain

A live authenticated gateway establishes that this exact normalized application
request maps to this exact business transaction and consistent idempotency/receipt
state. The business row, not receipt existence alone, establishes business commit.
The gateway's unique business key and owner fencing enforce retry safety even if
receipt publication failed. Only publication create, external_idempotent, exactly
one action effect are admitted. Preserve original reported completion; live
observation is not_started or committed, never a rewrite of history.

Supported application: `kujo.fixture.publication.create`, version1.0.0, surface sdk,
input object containing only body (string<=1024 characters), output transaction
string, effect write to `kujo.application.publications`, keyed idempotency. The
literal definition and its digest are in the vectors. This existing historical
Ability ID remains unchanged; its word “fixture” is an ID, not a directory or
permission to infer trust. This profile's portable value domain is valid Unicode
scalar strings, booleans, null, safe integers, arrays and ASCII-key objects under
portable-json/v1 bounds; arbitrary floating-point/Unicode-key application identities
remain outside the proposed beta portability claim. Installed authorities MUST
restrict admitted application identities to this documented domain. The configured
beta verifier requests portable observation; the gateway rejects unsupported values
before issuing evidence. Alpha observation remains available with historical semantics.

## Identity and exact recipes

Generic subject binds exact run, step, canonical decimal action attempt, effect and
original result SHA-256. Numeric action ordinal must agree; evaluator/opaque attempts
are unsupported. Application and Dispatch identities remain different authorities.
No result byte or existing receipt is rewritten for beta.

Let P be the authenticated principal object, I the input object, D the exact
publication definition, K the original application idempotency key string. The
operator MUST retain exact normalized P/I/D/K for the replay horizon. All JSON
recipes below use the compact recursively ASCII-key-sorted UTF-8 encoding defined
in portable-json/v1 on this bounded domain. Legacy v1 and v2 recipe identities stay
separate even where tested bytes coincide. SHA-256 output is lowercase64, no prefix.

- definition_digest = ability_v1_json digest of D.
- key_digest = ability_v1_json digest of {tenant_id:P.tenant_id,
  principal_type:P.type, principal_id:P.id, idempotency_key:K}.
- request_digest = ability_v1_json digest of {ability_id:D.id,
  ability_version:D.version, definition_digest, input:I, principal:P}.
- principal_sha256 = ability_v2_json digest of P; tenant_sha256 hashes exact
  P.tenant_id string bytes. input_sha256 hashes exact I.body string bytes.
- intent_sha256 = ability_v2_json digest of {input:I,principal:P}.
- target_sha256 hashes exact UTF-8 `kujo.application.publications`.
- Application profile object contains schema=`ability.application-assurance/v1alpha1`,
  ability_id/version, definition_digest, surface=`sdk`, principal_sha256,
  tenant_sha256, key_digest, request_digest, input_sha256, intent_sha256,
  target_sha256 and operation=`create`. transaction_sha256 hashes its ability_v2_json
  bytes BEFORE adding transaction_sha256. Then add that field. The inner application
  evidence schema remains alpha under BOTH envelope versions: it is explicitly
  versioned application evidence, not an alpha sidecar being relabeled.
- Envelope scope=principal_sha256; key_sha256 hashes the exact key_digest string
  (also the v1 result idempotency_key); request=request_digest; precondition hashes
  alpha_json of the full application profile including transaction; transaction
  is application transaction_sha256; operation=create; target as above.
- Evidence object is {profile:full application profile, business_state,
  receipt_sha256:null OR SHA256(exact retained receipt UTF-8 bytes),
  verification:`authenticated_sqlite_readback`}. evidence_ref is `sha256:` plus
  ability_v2_json digest of that object.
- Beta profile_sha256 hashes portable_json of the envelope's ten-field bindings,
  not the inner application profile. These two commitments MUST NOT be confused.

Changed input, tenant, principal, definition/version or key cannot borrow an old
commitment. A tenant/principal change creates another scoped key; the old assurance
still cannot authorize it. Same scoped key with changed request conflicts.

## Authentication and two durable commits

A configured local gateway authenticates a secret session token by its digest in an
operator-owned session store, resolves canonical principal bytes and validity,
checks revocation, and compares the invocation principal commitment. Producer
principal/tenant JSON is not authentication. Dispatch configures gateway/verifier
code and expected context externally; no executable, database path or credential
comes from the assurance. Session secrets never enter documents or logs.

Request records bind key/request/profile and an execution owner. Business records
bind unique key, unique transaction, exact profile and body digest. Receipt records
bind key, exact receipt bytes/digest and transaction. All inspections are consistent
snapshots under application write exclusion. Business commit and receipt commit
are SEPARATE transactions. Receipt completion also atomically marks request completed.
A completing owner must still own the active request and be currently authorized.

| Boundary/state | Knowledge and retry predicate |
|---|---|
| Before business commit | No business row; authorization/fenced admission may create one |
| After business commit, before receipt | Exact business row proves commit; unique key protects another admitted execution |
| Receipt commit failure | ability_idempotency_commit_failed does NOT prove business failure; inspect live business/request state |
| After receipt commit, before reply | Consistent receipt plus business permits existing Ability replay; no new mutation |
| Receipt without matching business/transaction | Contradiction: deny |
| Query/authentication unavailable | Unknown, not absence: deny |

Recovery MUST fence old owners before another execution is admitted, never delete
business rows/keys or pretend receipt failure rolled business back. Concurrent
contenders yield one active owner, in-progress, or replay after completion; the
unique business key yields one logical effect. Replay still passes existing v1
policy and current Dispatch authority; there is no generic success flag or saga.

## Freshness, revocation and evidence lifecycle

Authenticated session interval is integer UTC [from,until), <=3600 seconds for this
assurance domain. Registry revision and session revocation are checked live at
Dispatch admission and again inside actual application mutation/receipt transactions.
No load-time verification cache or skew grace. A delayed expired/revoked session
blocks even if it verified earlier. Operator root compromise is outside the model.

Retain application identity, business key, receipt and original result bytes for
the replay horizon. Receipt publication changes evidence_ref when null becomes a
receipt digest. This may make an old sidecar unusable against the original result
reference; do not rewrite that result or immutable selected sidecar. No automatic
renewal/supersession API exists. Missing receipt alone is not missing business.

Invocation read<=4096 bytes, receipt/response/assurance<=8192, result<=1MiB;
identifiers<=128 ASCII bytes and fixed64 hashes in exported assurance. No body,
customer data, raw principal/session secret, raw store path or arbitrary response
may enter assurance/diagnostics. Queries go through the configured gateway only;
malicious paths/URLs cannot select an evidence source.

## Failure and conformance

Profile categories map existing bounded codes: principal_mismatch, request_mismatch,
idempotency_conflict, business_receipt_mismatch, business_effect_unverified,
assurance_revoked, assurance_expired, transaction_mismatch (Ability emits each with
`ability_` prefix). Other gateway errors become verification_failed. None permits
fallback. Receipt commit failure is an execution outcome requiring readback, not a
permission code.

Common `dispatch.effect-assurance-conformance/v1` applies in full. Profile extensions
MUST prove authenticated tenant/principal separation; changed definition/input/key;
all six business/receipt/reply crash boundaries; committed business plus receipt
failure from a fresh process; contradictory receipt; concurrent contenders and old
owner fencing; live revocation and expiry at delayed mutation; canary exclusion.
Alpha/beta runs keep independent policies and cross-version artifacts deny. Vectors
and source-helper regression tests preserve historical Ability digests.
