# Ability v1 Conformance

The canonical contract is `schema/ability.schema.json` plus the stricter
runtime checks in `src/contract.kujo`.

| Consumer | Role | Conformance evidence |
|---|---|---|
| CMS | Producer, binding, policy, REST/CLI/MCP compatibility | Canonical definition discovery, invocation input/output validation, generic confirmation preflight, plugin descriptor validation |
| Agents SDK | Agent Tool adapter | Identity/schema preservation, full invocation validation, effect-derived risk hint, local binding and exposure separation |
| MCP | Protocol adapter | Explicit exposure, schema/identity preservation, read-only default, effect-gated mutation |

`tests/check_consumers.sh` is an optional workspace-level gate. When sibling
repositories are present, it proves that the CMS and Agents SDK schema copies
are semantically identical to the canonical schema and runs each consumer's
targeted compatibility suite. Product-local bindings and projections remain in
their owning repositories so this package stays independent of protocols,
authorization systems, and execution substrates.
