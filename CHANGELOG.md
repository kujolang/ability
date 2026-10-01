# Changelog

## Unreleased

- JSON process bindings use native absolute-path validation when the runtime provides `path_is_absolute`. Released 1.6.0 retains the original POSIX fallback. Windows support requires a runtime shipping the new primitive and separate execution/receipt acceptance.

## 1.2.0 - 2026-09-29

- Export the existing cross-language `ability_definition_digest_v2` through the public facade. Legacy definition, approval and receipt identities remain unchanged.
- Include the application-owned effect-assurance profile, profile manifest and portable commitment vectors. Beta remains experimental, opt-in and bounded to single-effect required/deny; alpha remains supported.
- Add the local HTTP/OpenAPI publication rehearsal with host-owned one-use admission, bounded evidence references, real socket completion-loss and duplicate-delivery checks. Dispatch remains replay authority.
- Reject terminal newlines in controlled HTTP identifier schemas.
- Align package requirements and release validation with published Kujo 1.6.0. TypeScript/Python previews remain unpublished; no remote trust or general application gateway service is claimed.

## 1.1.0 - 2026-09-04

- Added local TypeScript and Python SDK previews with shared Kujo digest and receipt conformance fixtures.
- Added signing-ready Ability Pack entry and trust-policy schemas plus an offline Ed25519, checksum, revocation, compatibility, and tenant-boundary verifier.
- Add an explicit cross-language v2 digest while preserving the existing runtime and receipt digest. The preview rejects decimals and integers outside JavaScript’s safe range.
- Add a fixture-only development kit for validation, reference docs, approval simulation, keyed replay, and receipt inspection.
- Include the development kit in the Kennel package.
- Rewrite the README with ecosystem badges, installation and quick-start
  guidance, included contract surfaces, the current CMS Ability catalog, and
  clear Agents SDK, MCP, Codex, and Cursor integration boundaries.

## 1.0.1 - 2026-09-01

- Return `approval_required` before requiring a keyed idempotency key when an
  approval-gated invocation has not yet received approval.
- Add tag/version verification, deterministic source archives, SPDX SBOMs,
  checksums, and keyless provenance attestations to the release workflow.
- Redact callback exception text from public failures and receipts.
- Completion-audit every post-policy terminal outcome and treat only the exact
  `open` audit mode as fail-open.
- Derive idempotency namespaces from canonical tenant and principal fields.

## 1.0.0 - 2026-09-01

- Stabilize the v1 package contract and publish compatibility, support,
  security, and production-readiness policies.
- Validate replayed receipts against the exact Ability, principal, surface,
  digest, and successful output contract before returning cached evidence.
- Make keyed replays occur before one-time approval consumption, commit
  cancellation and approval-store failures as terminal receipts, contain
  service callback exceptions, and retain post-execution results when receipt
  persistence is uncertain.
- Add a reproducible release verification script and pinned CI runtime.

## 0.4.0 - 2026-09-01

- Return normalized receipts for post-policy approval, input, and idempotency
  failures, including a reconciliable `commit_failed` state.
- Enforce commit-pinned canonical consumption in CMS, Agents SDK, and MCP.

## 0.3.0 - 2026-09-01

- Add structured `kujo.result/v1` binding results.

## 0.2.1 - 2026-09-01

- Add the Kennel root import shim.

## 0.2.0 - 2026-09-01

- Add canonical binding, exposure, invocation, policy, approval, receipt,
  registry, digest, and execution contracts.

## 0.1.0 - 2026-09-01

- Publish the portable `kujo.ability/v1` definition and schema.
