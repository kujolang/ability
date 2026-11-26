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
const started = Promise.withResolvers();
const release = Promise.withResolvers();
let slowRuns = 0;
let failedRuns = 0;
const handlers = new Map([[readDefinition.id, async () => ({ count: 1 })], [writeDefinition.id, async (input) => {
  if (input.query === "slow") {
    slowRuns += 1;
    started.resolve();
    await release.promise;
  }
  if (input.query === "fail") {
    failedRuns += 1;
    throw new Error("synthetic fixture failure");
  }
  return { count: 1 };
}]]);
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
  const slow = { ...write, invocation_id: "slow-1", input: { query: "slow" }, idempotency_key: "slow-key" };
  const retry = { ...slow, invocation_id: "slow-2" };
  const firstApproval = await request("/v1/approvals", slow);
  const retryApproval = await request("/v1/approvals", retry);
  const retryBody = { ...retry, approval_id: retryApproval.body.approval.approval_id };
  const firstResponse = request("/v1/invocations", { ...slow, approval_id: firstApproval.body.approval.approval_id });
  await started.promise;
  let overlapping;
  try {
    const controller = AbortSignal.timeout(2_000);
    const response = await fetch(`${base}/v1/invocations`, { method: "POST", headers, body: JSON.stringify(retryBody), signal: controller });
    overlapping = await response.json();
  } finally {
    release.resolve();
  }
  const firstReceipt = (await firstResponse).body.receipt;
  assert.equal(overlapping.code, "ability_invocation_in_progress");
  const replayedSlow = await request("/v1/invocations", retryBody);
  assert.equal(replayedSlow.body.receipt.receipt_id, firstReceipt.receipt_id);
  assert.equal(replayedSlow.body.replayed, true);
  assert.equal(slowRuns, 1);

  const failing = { ...write, invocation_id: "fail-1", input: { query: "fail" }, idempotency_key: "fail-key" };
  const failedApproval = await request("/v1/approvals", failing);
  const failed = await request("/v1/invocations", { ...failing, approval_id: failedApproval.body.approval.approval_id });
  assert.equal(failed.status, 500);
  const failedRetry = { ...failing, invocation_id: "fail-2" };
  const failedRetryApproval = await request("/v1/approvals", failedRetry);
  const replayedFailure = await request("/v1/invocations", { ...failedRetry, approval_id: failedRetryApproval.body.approval.approval_id });
  assert.equal(replayedFailure.status, 500);
  assert.deepEqual(replayedFailure.body, { ...failed.body, replayed: true });
  assert.equal(failedRuns, 1);
} finally {
  release.resolve();
  server.close();
  await once(server, "close");
}

console.log("Ability fixture devkit validation, approval, idempotency, and receipt checks passed");
