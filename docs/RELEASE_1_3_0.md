# Ability 1.3.0

This release adds optional host-neutral effect semantics, bounded JSON process bindings, a trusted local review capability pack, durable local approval and idempotency services, and an optional canonical ShipCheck release scan. Stable v1 definitions and existing receipt semantics are preserved.

Use Kujo 1.6.0 or newer and a supported patched Node.js release for JavaScript tooling. Native absolute-path validation is used when available; the existing POSIX fallback remains for Kujo 1.6.0. Windows execution requires separate acceptance and is not certified by this release.

Application assurance beta remains experimental, opt-in, and bounded to single-effect required/deny. Controlled HTTP remains a local rehearsal; Dispatch owns replay decisions. TypeScript and Python SDK previews remain unpublished.

Install the reviewed source with `kennel add github:kujolang/ability@v1.3.0 --alias ability`, then `kennel install`. Commit the resulting lockfile.

Release gates cover Kujo and cross-language contracts, local service and process execution, consumer conformance, Fence boundaries, and the application-assurance fixture.
