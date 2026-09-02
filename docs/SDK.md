# TypeScript and Python SDK preview

The repository includes dependency-free TypeScript and Python contract helpers under `sdk/`. Both SDKs validate the portable Ability definition envelope, compute the same versioned `sha256-canonical-json-v2` definition digest as Kujo, validate canonical receipt identity and timing, expose a handler interface, and summarize declared effects for approval review.

The packages are local previews (`1.0.0-preview.1` and `1.0.0.dev1`) and are not published. Applications must still use the Kujo runtime or an equivalent fully conformant gateway for policy, authorization, approval consumption, idempotency, audit persistence, handler execution, and JSON Schema input/output validation. The preview SDKs do not grant execution authority and do not open a server.

Run the shared golden conformance fixture:

```bash
KUJO_BIN=/path/to/kujo bash tests/sdk_cross_language.sh
```

The gate compares TypeScript and Python validation decisions and effect review byte-for-byte, then compares both definition digests with the canonical Kujo v2 implementation. It also checks a canonical receipt and rejects an unsupported effect kind.

The unversioned Kujo digest remains unchanged for v1 runtime and stored-receipt compatibility. Its historical recursive serializer is not cross-language-safe. New package-signing and offline trust tooling should use the explicitly versioned v2 digest. Migrating live invocation and receipt identity requires a separately approved compatibility release with dual-read evidence; this preview does not silently change those runtime semantics.

Go was evaluated but is deferred: no current gateway or client in the verified repository inventory is Go-owned, so adding a third preview SDK would increase drift and release burden without a demonstrated consumer. Reconsider when a Go gateway or two independent Go consumers are committed.
