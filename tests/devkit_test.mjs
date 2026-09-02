import assert from "node:assert/strict";
import { once } from "node:events";
import { createAbilityDevServer, renderAbilityMarkdown, validateDevDefinition } from "../devkit/index.mjs";

const readDefinition = {
  schema: "kujo.ability/v1", id: "kujo.test.records.read", version: "1.0.0", description: "Read a bounded fixture record.",
  input_schema: { type: "object", required: ["query"], properties: { query: { type: "string", minLength: 1, maxLength: 40 } }, additionalProperties: false },
  output_schema: { type: "object", required: ["count"], properties: { count: { type: "integer", minimum: 0 } }, additionalProperties: false },
  effects: [{ kind: "read", resource: "kujo.test.records" }], idempotency: { mode: "intrinsic" },
};
const writeDefinition = {
  ...readDefinition, id: "kujo.test.records.write", description: "Write one bounded fixture record.",
  effects: [{ kind: "write", resource: "kujo.test.records" }], idempotency: { mode: "keyed" },
};
assert.equal(validateDevDefinition(readDefinition).ok, true);
assert.match(renderAbilityMarkdown(readDefinition), /Definition digest v2/);
assert.equal(validateDevDefinition({ ...readDefinition, input_schema: { ...readDefinition.input_schema, properties: { score: { type: "number", minimum: 0.5 } } } }).code, "unsupported_canonical_json_number");

let now = 1_000;
const handlers = new Map([[readDefinition.id, async () => ({ count: 1 })], [writeDefinition.id, async () => ({ count: 1 })]]);
const server = createAbilityDevServer({ definitions: [readDefinition, writeDefinition], handlers, token: "fixture-token-123456789", clock: () => now });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const headers = { authorization: "Bearer fixture-token-123456789", "content-type": "application/json" };
async function request(path, body) {
  const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
try {
  assert.equal((await fetch(`${base}/health`)).status, 401);
  assert.equal((await request("/v1/abilities")).body.abilities.length, 2);
  const actor = { type: "human", id: "developer", tenant_id: "local", claims: {} };
  const read = { ability_id: readDefinition.id, ability_version: "1.0.0", invocation_id: "read-1", input: { query: "safe" }, principal: actor };
  assert.equal((await request("/v1/invocations", read)).body.receipt.status, "succeeded");
  assert.equal((await request("/v1/invocations", { ...read, input: { query: "", extra: true } })).status, 422);
  const write = { ability_id: writeDefinition.id, ability_version: "1.0.0", invocation_id: "write-1", input: { query: "safe" }, principal: actor, idempotency_key: "key-1" };
  assert.equal((await request("/v1/invocations", write)).body.code, "ability_approval_required");
  const issued = await request("/v1/approvals", write);
  assert.equal(issued.status, 201);
  const approved = { ...write, approval_id: issued.body.approval.approval_id };
  const completed = await request("/v1/invocations", approved);
  assert.equal(completed.body.receipt.approval_id, approved.approval_id);
  assert.equal((await request("/v1/invocations", approved)).body.code, "ability_approval_replayed");
  const second = { ...write, invocation_id: "write-2" };
  const secondApproval = await request("/v1/approvals", second);
  const conflict = await request("/v1/invocations", { ...second, input: { query: "different" }, approval_id: secondApproval.body.approval.approval_id });
  assert.equal(conflict.body.code, "ability_approval_binding_mismatch");
  const replayRequest = { ...write, invocation_id: "write-3" };
  const replayApproval = await request("/v1/approvals", replayRequest);
  const replay = await request("/v1/invocations", { ...replayRequest, approval_id: replayApproval.body.approval.approval_id });
  assert.equal(replay.body.replayed, true);
  const conflicting = { ...write, invocation_id: "write-4", input: { query: "different" } };
  const conflictApproval = await request("/v1/approvals", conflicting);
  assert.equal((await request("/v1/invocations", { ...conflicting, approval_id: conflictApproval.body.approval.approval_id })).body.code, "ability_idempotency_conflict");
  now += 61_000;
  const expiredRequest = { ...write, invocation_id: "write-5", idempotency_key: "key-2" };
  now -= 61_000;
  const expiredApproval = await request("/v1/approvals", expiredRequest);
  now += 61_000;
  assert.equal((await request("/v1/invocations", { ...expiredRequest, approval_id: expiredApproval.body.approval.approval_id })).body.code, "ability_approval_expired");
} finally {
  server.close();
  await once(server, "close");
}

console.log("Ability fixture devkit validation, approval, idempotency, and receipt checks passed");
