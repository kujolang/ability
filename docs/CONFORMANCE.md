# Ability v1 Conformance

The canonical definition contract is `schema/ability.schema.json` plus the
stricter runtime checks in `src/contract.kujo`. Shared execution contracts and
their validators live in `src/contracts.kujo`.

## Execution conformance

A conforming execution consumer must:

1. resolve the exact Ability ID and version;
2. preserve and verify the canonical definition digest;
3. select only an explicitly enabled surface exposure;
4. evaluate policy using server-resolved principal and tenant identity;
5. bind approval to the exact invocation and consume it once;
6. enforce keyed idempotency before invoking a handler;
7. validate both input and output;
8. preserve request and trace correlation in the receipt; and
9. return a normalized receipt for terminal execution outcomes.

Protocol adapters may rename a projected tool, but they must preserve the
Ability ID, version, and definition digest in metadata. They may make exposure
more restrictive, never less restrictive.

| Consumer | Role | Conformance evidence |
|---|---|---|
| CMS | Producer, binding, policy, REST/CLI/MCP compatibility | Canonical definition discovery, invocation input/output validation, generic confirmation preflight, plugin descriptor validation |
| Agents SDK | Agent Tool adapter | Identity/schema preservation, full invocation validation, effect-derived risk hint, local binding and exposure separation |
| MCP | Protocol adapter | Explicit exposure, schema/identity preservation, read-only default, effect-gated mutation |

`tests/check_consumers.sh` is a workspace-level gate. When sibling
repositories are present, it proves that the CMS and Agents SDK schema copies
are semantically identical to the canonical schema and runs each consumer's
targeted compatibility suite. Product-local bindings and projections remain in
their owning repositories so this package stays independent of protocols,
authorization systems, and execution substrates. `tests/runtime_contract_tests.kujo`
proves the transport-independent registry, policy, approval, idempotency,
output-validation, and receipt boundary.
