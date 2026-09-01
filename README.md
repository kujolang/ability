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

## Contract

- `schema/ability.schema.json` is the canonical executable JSON contract.
- `src/contract.kujo` validates definitions and invocation values.
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

## Validate

```bash
bash tests/run_tests.sh
bash tests/check_consumers.sh
```

This package intentionally does not provide a global registry, remote
execution, authorization, approval, routing, observability, or language syntax.
