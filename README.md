# Kujo Ability

Kujo Ability defines a small, portable contract for bounded semantic
operations across the Kujo ecosystem.

An Ability definition says what an operation means: its stable ID and version,
input and output JSON Schemas, declared effects, and retry semantics. It does
not contain a handler, URL, credential, tenant, authorization rule, approval
state, provider, or protocol name. Those belong to product-owned bindings,
policy, and exposure adapters.

```json
{
  "schema": "kujo.ability/v1",
  "id": "kujo.docs.content.find",
  "version": "1.0.0",
  "description": "Find a bounded set of documentation records.",
  "input_schema": {"type": "object"},
  "output_schema": {"type": "object"},
  "effects": [{"kind": "read", "resource": "kujo.docs.content"}],
  "idempotency": {"mode": "intrinsic"}
}
```

## Package surfaces

- `schema/ability.schema.json` is the canonical executable JSON contract.
- `src/contract.kujo` validates definitions and invocation values.
- `src/contracts.kujo` validates bindings, exposures, invocations, policy
  decisions, request-bound approvals, and receipts.
- `src/registry.kujo` resolves exact `(ability_id, version, surface)` tuples and
  rejects definition, binding, and exposure collisions.
- `src/runtime.kujo` provides the transport-independent execution pipeline.
- `src/index.kujo` is the package entry point.
- `docs/CONFORMANCE.md` records producer and adapter responsibilities.
- Effect kinds are `read`, `write`, `delete`, and `external`.
- Idempotency modes are `intrinsic`, `keyed`, and `none`.
- Definitions are transport-neutral. MCP, agent Tool, REST, CLI, and WebMCP
  descriptors are explicit projections, not synonyms for an Ability.

## Compatibility

Breaking changes to required input, output meaning, effects, or idempotency
require a new Ability major version. Additive optional fields may use a minor
version only when existing consumers remain correct. Protocol-local names have
their own compatibility policy and must preserve canonical Ability identity in
metadata.

## Execution pipeline

The experimental runtime executes the same ordered boundary for every
transport:

```text
resolve exact definition/binding/exposure
  -> verify definition digest
  -> write preflight audit evidence
  -> evaluate application-owned policy
  -> validate and consume request-bound approval when required
  -> validate input
  -> begin keyed idempotency record when required
  -> check cancellation
  -> invoke handler
  -> enforce declared timeout result
  -> validate output
  -> write completion audit evidence
  -> commit receipt to the idempotency store
```

The runtime denies execution when no policy evaluator is supplied. Approval-
required execution also denies when no one-time approval store is supplied.
Keyed execution denies when no idempotency key or store is supplied. These
fail-closed defaults keep transports from silently weakening the contract.

Applications still own identity authentication, authorization rules, durable
approval and idempotency storage, audit persistence, and concrete handlers.
They provide those capabilities through narrow runtime service functions.
See `docs/RUNTIME.md`.

## Validate

```bash
bash tests/run_tests.sh
bash tests/check_consumers.sh
```

This package intentionally does not provide a process-global registry, remote
transport server, identity provider, application authorization rules, durable
storage, provider framework, workflow engine, or language syntax.
