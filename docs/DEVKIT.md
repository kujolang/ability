# Ability development kit

The repository includes a dependency-free, fixture-only development server for definition validation, generated reference documentation, approval simulation, idempotency conflict testing, and canonical receipt inspection. It is an evidence-backed alternative to inventing unowned `kujo ability` commands.

Validate a definition and print its cross-language v2 digest:

```bash
node devkit/cli.mjs validate examples/content_find.json
```

Generate reference documentation:

```bash
node devkit/cli.mjs docs examples/content_find.json /tmp/content-find.md
```

Start the loopback-only fixture server:

```bash
KUJO_ABILITY_DEV_TOKEN='replace-with-a-local-secret' \
  node devkit/cli.mjs serve examples/dev-manifest.json --port 7777
```

The server exposes authenticated `GET /health`, `GET /v1/abilities`, `POST /v1/approvals`, and `POST /v1/invocations`. A manifest supplies static fixture outputs; it cannot execute shell commands, load provider credentials, publish packages, or become a production gateway. Non-read fixtures require a request-bound, short-lived, one-time simulated approval. Keyed fixtures require an idempotency key, replay the same request, and reject reuse with different input. Request and output schemas fail closed and bodies are bounded to 1 MiB.

Programmatic adapters can import `createAbilityDevServer`, pass validated definitions, and provide a `Map` of bounded handler functions. Use the canonical Kujo runtime—not this fixture harness—for production policy, approval, audit, timeout, cancellation, and receipt enforcement.

Package publication remains separate. The offline registry verifier accepts Ed25519-signed entries and tenant-scoped policy; production publisher identity, key custody, transparency, malware review, registry storage, and public release approval require operational ownership.
