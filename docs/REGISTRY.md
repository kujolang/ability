# Offline Ability Pack trust model

Ability runtime discovery and package discovery are separate systems. Runtime discovery is principal- and tenant-filtered by an application. A package registry distributes signed, versioned artifacts before an application decides whether to install, expose, or authorize their Abilities.

This repository provides a local verification model, not an operated registry:

- `schema/ability-pack-entry.schema.json` describes a signed pack envelope with publisher identity, artifact checksum, the versioned v2 digest algorithm, Ability inventory, declared effect kinds, dependencies, compatibility windows, lifecycle status, visibility, provenance, and publication time.
- `schema/ability-registry-policy.schema.json` describes an operator-owned publisher allowlist and explicit artifact and pack revocations.
- `registry/verify.mjs` verifies Ed25519 signatures, exact artifact SHA-256, publisher-key allowlists, revocation, runtime compatibility, contained artifact paths, effect kinds, and public/private tenant boundaries without network access.

The signed payload is canonical JSON with recursively sorted object keys and no insignificant whitespace. A registry entry records `sha256-canonical-json-v2`; verifiers must reject unknown algorithms instead of guessing. Publisher key rotation adds a reviewed fingerprint to policy before new artifacts are accepted, then removes or revokes the old key after the rollout window.

Private catalogs must be stored and queried inside a tenant boundary. A private entry requires exactly one `tenant_id`; a public entry is rejected if it carries tenant identity. Registry search must apply that boundary before returning metadata. Installing an allowlisted package still grants no runtime exposure or execution permission.

Deprecation warns without invalidating an already installed artifact. Revocation fails verification and should block new installs and rollouts. Advisories should identify affected pack/version ranges and remediation without exposing private catalog membership. Rollback selects a previously verified, non-revoked artifact whose compatibility window still covers the target runtime.

Run the offline trust suite:

```bash
node tests/registry_trust_test.mjs
```

The fixture generates an ephemeral Ed25519 publisher key, signs a deterministic pack entry, verifies its artifact, and rejects revocation, incompatible runtimes, unallowlisted publishers, invalid signatures, tampering, path escape, and tenant metadata on a public entry. Production publishing, key custody, transparency logs, malware scanning, moderation, and public/private registry services remain unimplemented and require separate operational ownership.
