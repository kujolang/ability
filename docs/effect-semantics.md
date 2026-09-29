# Host-neutral effect semantics

Ability definitions may include an optional `semantics` object with exactly three boolean facts. These facts describe the full operation, including handler dependencies and conditional paths:

```json
{"semantics":{"open_world":false,"destructive":false,"executes_code":false}}
```

- `open_world`: the operation can interact with an unbounded external environment, such as arbitrary public internet destinations. A public internet read is open-world. Access confined to an operator-controlled repository or a bounded authenticated account can be closed-world. Network access alone does not decide this fact.
- `destructive`: the operation can delete state or cause changes that are irreversible or difficult to reverse. A bounded reversible write may be false. Any declared `delete` effect requires true.
- `executes_code`: the operation runs supplied, repository-controlled, or delegated executable code or commands. Ordinary implementation execution does not count. Such an operation must declare a non-read effect, even if the intended command is observational.

All three facts are required when the object is present. Missing metadata means **unknown**, never false. Adapters must use conservative defaults or mark the capability unsupported. Read-only effects cannot declare destruction or delegated code execution. Validators enforce these consistency rules; JSON Schema describes the structural contract.

These are author assertions covered by the definition digest, not proofs of containment or permissions. Operators still review handlers, bound resources, apply policy, and enforce approvals. The fields never grant authority, bypass audit, or change retry behavior. Input, host annotations, model text, and remote clients cannot supply or override them. An adapter may impose stricter availability restrictions for its execution environment.

The runtime's existing effect policy, approval flow, receipt schema and idempotency contract are unchanged. Existing definitions remain valid and retain both historical and v2 digest values. New facts change the digest; existing digest-bound bindings and approvals must be renewed. Treat adding or changing facts as a versioned definition change, not a patch to a live registered contract.

This is an additive reader extension to `kujo.ability/v1`. Older strict readers continue to accept all old definitions but reject definitions containing `semantics`; update those readers before publishing enriched definitions to them. Do not strip facts to fit an old reader while retaining the new digest. Existing consumers such as CMD and Pi are not implicitly upgraded.

Native Kujo, TypeScript, Python, and the development fixture validator consume the same 14-case conformance set. Historical commitment vectors remain regression gates. The development server remains a fixture and is not a production execution service.
