# Experimental local HTTP publication participant

This is a bounded local transport rehearsal, not a universal OpenAPI importer,
remote gateway or new application implementation. Dispatch alone authorizes replay.
The existing Kujo publication application and beta profile remain unchanged.

## Install boundary and request

Run `examples/controlled-http/server.mjs ROOT ATTEMPT` through an operator embedding.
ROOT and runtime/application paths are host configuration; never derive them from
HTTP. The process binds only127.0.0.1 on a fresh ephemeral port. The example harness
starts/stops that process and uses an actual local socket. Node supplies precise
socket fault injection and streaming bounds; Kujo still implements all application
execution, authentication, idempotency and assurance. This is a transport-test
exception to Kujo-first application code, not a Node replacement for Ability.

POST `/v1/abilities/publication/create/run` accepts exactly `input` and
`invocation_id`. `examples/controlled-http/openapi.json` describes this one operation,
`publication_create`, with `X-Request-ID`, `Idempotency-Key` and application bearer
session authentication. No arbitrary URL/import/discovery exists. The description
and `external_idempotent` annotation do not authenticate enforcement.

The application verifies the session token against its durable sessions table and
binds principal/tenant to the admitted invocation. Header/body principal assertions
are not authentication. The fixture checks the bearer against host session first;
Ability independently checks revocation/expiry/principal at application admission.
Its established application API surface remains `sdk` beneath this HTTP transport.
No Agents SDK or MCP participant executes here, and no new HTTP assurance profile
is claimed.

## Controlled versus standalone

Controlled mode loads a controller-issued ticket from private host storage. It binds
client request attribution, exact method, route/operation, normalized whole Ability
invocation digest, current Dispatch action attempt, run/step/effect and expiry.
The request body cannot install this context. Internal X-Dispatch/X-Assurance/
X-Trusted/X-Principal/X-Tenant/X-Config/X-Verifier headers are rejected. Extra body
fields, changed input/key, wrong route/method/query and duplicate headers deny.

A durable exclusive claim consumes the ticket before invoking Ability. The host
rechecks current attempt and expiry immediately before the gateway. Near-concurrent
delivery admits one request and denies the other. A failed attempt consumes its
ticket; the client never retries automatically. Dispatch must issue the next attempt.
The idempotency header merely matches the application-admitted key; unique durable
application records provide the actual enforcement.

Standalone mode is explicit server host configuration. It uses normal authenticated
application execution and receipt replay without tickets, control callbacks or fake
Dispatch identities. This one-action fixture still binds its operator-configured
application invocation; it is not an arbitrary request router.

## Evidence and identity

`http.ability-handoff/v1alpha1` is owner-published in `schema/`. It is closed,
20 fields, at most4096 UTF-8 bytes. IDs are ASCII with at most128 characters; method,
route ID and operation are fixed for this profile. Nullable receipt ID/reference
must be paired. A succeeded-receipt outcome requires a receipt. Timeout/response
loss can coexist with a succeeded private receipt: transport and business completion
are different facts.

Client request ID is attribution. A new host-generated HTTP request UUID identifies
the admitted transport operation. Neither replaces Ability invocation, receipt,
transaction or Dispatch attempt. Handoff references result, private receipt and
optional selected assurance by `sha256:` plus64 lowercase hex of exact retained
bytes. It never copies bodies, headers, principal, credentials, paths or configuration.
The canonical JSON encoding sorts ASCII keys with no whitespace. Attaching assurance
publishes new immutable handoff bytes, retaining the old artifact.

The participant records references after observing HTTP outcome and application
readback. It reports uncertainty, never `safe`. Dispatch's confined reader checks
exact bytes and correlation then uses existing locked persisted beta/live Ability
verification and v1 policy. The handoff cannot authorize anything by itself.

## Failure semantics and bounds

A client timeout only means no timely response. The timeout-before-commit fixture
closes the socket before a delayed mutation; the server fences that mutation and
fresh application readback observes absence. The committed-response-loss fixture
commits both business and receipt, then destroys the socket. Both require review.
An actual application handler error before commit produces a distinct
`application_error` outcome and private failed receipt. A gateway/process failure is
`application_unavailable`, not proof of absence. Initial result remains conservative
and indeterminate pending live assurance, even with an explicit HTTP error.

No status code, including2xx or5xx, is proof of the business state. If durable evidence
or readback cannot be obtained, the participant cannot synthesize permission.

Limits: body4096 bytes; headers4096 bytes/16pairs; response8192 bytes; inflight4;
body/header deadline2s; request deadline25s; application subprocess20s; client30s;
controller participant90s. The deterministic pre-commit timeout uses100ms against
a400ms server barrier. There is no hidden reconnect/POST retry or redirect handling.

No HTTP-specific Watchdog helper exists in this local application fixture. Existing
Dispatch workflow/tool telemetry observes admission/review/continuation; the handoff
is not a new event bus. No headers/bodies are added to telemetry. Process loss may
leave observations absent, which never proves absence of an effect.

## Tests and limitations

Dispatch `tests/http_ability_integration.mjs` runs three real process/network scenarios,
including duplicate delivery in each, fresh controller/server/client continuation,
substitution/path/symlink/expiry negatives, standalone replay and privacy canaries.
Ability canonical tests include the OpenAPI/handoff shape contracts.

Trusted local host/root is assumed. No remote trust, total-store rollback protection,
hostile-operator isolation, multi-effect, exactly-once or universal rollback is added.
See Dispatch's HTTP audit for the cross-participant comparison; handoffs remain
separate until their shared semantics have broader evidence.

In the explicit handler-error case, existing Ability finalization also cannot commit
a successful replay receipt. Its returned error is `ability_idempotency_commit_failed`
with `error.details.execution_status = failed`. Preserve both facts; only independent
application readback establishes `not_started`. The same top-level receipt error in
another scenario can follow a committed business effect. This slice changes none of
those application receipt semantics.
