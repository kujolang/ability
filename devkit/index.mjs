import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { canonicalJson } from "../registry/verify.mjs";

const MAX_BODY_BYTES = 1_048_576;
const EFFECTS = new Set(["read", "write", "delete", "external"]);

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function failure(code, message, details = {}) {
  return { ok: false, code, message, details };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSchemaValue(value, schema, path = "$") {
  if (!isRecord(schema) || typeof schema.type !== "string") return failure("unsupported_schema", "Fixture schemas require an explicit supported type", { path });
  const typeOk = schema.type === "object" ? isRecord(value)
    : schema.type === "array" ? Array.isArray(value)
      : schema.type === "integer" ? Number.isSafeInteger(value)
        : schema.type === "number" ? typeof value === "number" && Number.isFinite(value)
          : schema.type === "string" ? typeof value === "string"
            : schema.type === "boolean" ? typeof value === "boolean"
              : schema.type === "null" ? value === null : false;
  if (!typeOk) return failure("schema_type_mismatch", "Value does not match the declared schema type", { path, expected: schema.type });
  if (schema.type === "string") {
    if (Number.isSafeInteger(schema.minLength) && value.length < schema.minLength) return failure("schema_min_length", "String is shorter than allowed", { path });
    if (Number.isSafeInteger(schema.maxLength) && value.length > schema.maxLength) return failure("schema_max_length", "String is longer than allowed", { path });
    if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern)).test(value)) return failure("schema_pattern", "String does not match the required pattern", { path });
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return failure("schema_enum", "Value is not in the allowed set", { path });
  }
  if ((schema.type === "integer" || schema.type === "number") && typeof schema.minimum === "number" && value < schema.minimum) return failure("schema_minimum", "Number is below the allowed minimum", { path });
  if ((schema.type === "integer" || schema.type === "number") && typeof schema.maximum === "number" && value > schema.maximum) return failure("schema_maximum", "Number is above the allowed maximum", { path });
  if (schema.type === "array") {
    if (Number.isSafeInteger(schema.maxItems) && value.length > schema.maxItems) return failure("schema_max_items", "Array is longer than allowed", { path });
    for (let index = 0; index < value.length; index += 1) {
      const checked = validateSchemaValue(value[index], schema.items, `${path}[${index}]`);
      if (!checked.ok) return checked;
    }
  }
  if (schema.type === "object") {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.hasOwn(value, key)) return failure("schema_required", "Required property is missing", { path: `${path}.${key}` });
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) return failure("schema_unknown_property", "Unknown property is not allowed", { path: `${path}.${key}` });
    }
    for (const [key, nested] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        const checked = validateSchemaValue(nested, properties[key], `${path}.${key}`);
        if (!checked.ok) return checked;
      }
    }
  }
  return { ok: true };
}

export function validateDevDefinition(value) {
  if (!isRecord(value)) return failure("invalid_ability_definition", "Ability definition must be an object");
  const allowed = new Set(["schema", "id", "version", "title", "description", "input_schema", "output_schema", "effects", "idempotency"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) return failure("unknown_ability_definition_field", "Ability definition contains an unsupported field", { field: key });
  if (value.schema !== "kujo.ability/v1") return failure("invalid_ability_schema", "Ability definition must use kujo.ability/v1");
  if (!/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*){2,}$/.test(value.id || "")) return failure("invalid_ability_id", "Ability ID is invalid");
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value.version || "")) return failure("invalid_ability_version", "Ability version is invalid");
  if (value.title !== undefined && (typeof value.title !== "string" || value.title.length > 160)) return failure("invalid_ability_title", "Ability title is invalid");
  if (typeof value.description !== "string" || !value.description.trim() || value.description.length > 1000) return failure("invalid_ability_description", "Ability description is invalid");
  if (!isRecord(value.input_schema) || value.input_schema.type !== "object" || value.input_schema.additionalProperties !== false) return failure("invalid_ability_input_schema", "Input schema must be a closed object schema");
  if (!isRecord(value.output_schema) || value.output_schema.type !== "object" || value.output_schema.additionalProperties !== false) return failure("invalid_ability_output_schema", "Output schema must be a closed object schema");
  if (!Array.isArray(value.effects) || value.effects.length < 1 || value.effects.some((effect) => !isRecord(effect) || !EFFECTS.has(effect.kind) || typeof effect.resource !== "string" || !effect.resource)) return failure("invalid_ability_effects", "Ability effects are invalid");
  if (!isRecord(value.idempotency) || !["intrinsic", "keyed", "none"].includes(value.idempotency.mode)) return failure("invalid_ability_idempotency", "Ability idempotency mode is invalid");
  try { return { ok: true, definition: value, definition_digest_v2: digest(value) }; }
  catch { return failure("unsupported_canonical_json_number", "Canonical JSON v2 supports only safe integers"); }
}

function principal(input) {
  if (!isRecord(input) || !["human", "workload", "service"].includes(input.type) || typeof input.id !== "string" || !input.id || typeof input.tenant_id !== "string" || !input.tenant_id) return null;
  return { type: input.type, id: input.id, tenant_id: input.tenant_id, claims: isRecord(input.claims) ? input.claims : {} };
}

function approvalBinding(invocation, definitionDigest) {
  return digest({
    ability_id: invocation.ability_id,
    ability_version: invocation.ability_version,
    definition_digest: definitionDigest,
    input_digest: digest(invocation.input),
    principal_digest: digest(invocation.principal),
    tenant_id: invocation.principal.tenant_id,
    invocation_id: invocation.invocation_id,
  });
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("invalid JSON body"), { status: 400 }); }
}

function send(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  response.end(body);
}

export function createAbilityDevServer({ definitions, handlers, token, clock = () => Date.now(), approvalTtlMs = 60_000 }) {
  if (!Array.isArray(definitions) || definitions.length < 1) throw new Error("at least one Ability definition is required");
  if (!(handlers instanceof Map)) throw new Error("handlers must be a Map keyed by Ability ID");
  if (typeof token !== "string" || token.length < 16) throw new Error("a development bearer token of at least 16 characters is required");
  const catalog = new Map();
  for (const definition of definitions) {
    const checked = validateDevDefinition(definition);
    if (!checked.ok) throw new Error(`${checked.code}: ${checked.message}`);
    if (catalog.has(definition.id)) throw new Error(`duplicate Ability ID: ${definition.id}`);
    if (typeof handlers.get(definition.id) !== "function") throw new Error(`missing fixture handler: ${definition.id}`);
    catalog.set(definition.id, { definition, digest: checked.definition_digest_v2 });
  }
  const approvals = new Map();
  const idempotency = new Map();

  const server = createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== `Bearer ${token}`) return send(response, 401, failure("unauthorized", "Development bearer token is required"));
      if (request.method === "GET" && request.url === "/health") return send(response, 200, { ok: true, profile: "fixture", ability_count: catalog.size });
      if (request.method === "GET" && request.url === "/v1/abilities") return send(response, 200, { schema: "kujo.ability.dev-catalog/v1", abilities: [...catalog.values()].map((item) => item.definition) });
      if (request.method === "POST" && request.url === "/v1/approvals") {
        const body = await readJson(request);
        const item = catalog.get(body.ability_id);
        const actor = principal(body.principal);
        if (!item || body.ability_version !== item.definition.version || !actor || typeof body.invocation_id !== "string" || !body.invocation_id || !isRecord(body.input)) return send(response, 422, failure("invalid_approval_request", "Approval request identity is invalid"));
        if (item.definition.effects.every((effect) => effect.kind === "read")) return send(response, 422, failure("approval_not_required", "Read-only fixture Ability does not require approval"));
        const inputChecked = validateSchemaValue(body.input, item.definition.input_schema);
        if (!inputChecked.ok) return send(response, 422, inputChecked);
        const now = clock();
        const invocation = { ...body, principal: actor };
        const approval = { schema: "kujo.ability.approval/v1", approval_id: `approval-${randomUUID()}`, binding_digest: approvalBinding(invocation, item.digest), approved_by: { type: "human", id: "fixture-reviewer", tenant_id: actor.tenant_id, claims: {} }, issued_at_ms: now, expires_at_ms: now + approvalTtlMs, nonce: randomUUID(), evidence: { simulator: true } };
        approvals.set(approval.approval_id, { approval, consumed: false });
        return send(response, 201, { ok: true, approval });
      }
      if (request.method === "POST" && request.url === "/v1/invocations") {
        const body = await readJson(request);
        const item = catalog.get(body.ability_id);
        const actor = principal(body.principal);
        if (!item || body.ability_version !== item.definition.version || !actor || typeof body.invocation_id !== "string" || !body.invocation_id || !isRecord(body.input)) return send(response, 422, failure("invalid_invocation", "Invocation identity is invalid"));
        const inputChecked = validateSchemaValue(body.input, item.definition.input_schema);
        if (!inputChecked.ok) return send(response, 422, inputChecked);
        const needsApproval = item.definition.effects.some((effect) => effect.kind !== "read");
        let approvalId = "";
        if (needsApproval) {
          const stored = approvals.get(body.approval_id);
          if (!stored) return send(response, 409, failure("ability_approval_required", "Fixture mutation requires a request-bound approval"));
          if (stored.consumed) return send(response, 409, failure("ability_approval_replayed", "Fixture approval has already been consumed"));
          if (clock() >= stored.approval.expires_at_ms) return send(response, 409, failure("ability_approval_expired", "Fixture approval has expired"));
          if (stored.approval.binding_digest !== approvalBinding(body, item.digest)) return send(response, 409, failure("ability_approval_binding_mismatch", "Fixture approval does not match this invocation"));
          stored.consumed = true;
          approvalId = stored.approval.approval_id;
        }
        const mode = item.definition.idempotency.mode;
        const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";
        const scope = `${actor.tenant_id}:${actor.type}:${actor.id}:${item.definition.id}:${idempotencyKey}`;
        const requestDigest = digest({ input: body.input, ability_version: body.ability_version });
        if (mode === "keyed") {
          if (!idempotencyKey) return send(response, 409, failure("ability_idempotency_key_required", "Fixture keyed Ability requires an idempotency key"));
          const previous = idempotency.get(scope);
          if (previous && previous.requestDigest !== requestDigest) return send(response, 409, failure("ability_idempotency_conflict", "Idempotency key was reused with different input"));
          if (previous) return send(response, 200, { ok: true, receipt: previous.receipt, replayed: true });
        }
        const started = clock();
        let result;
        try { result = await handlers.get(item.definition.id)(body.input, { principal: actor, invocation_id: body.invocation_id }); }
        catch { return send(response, 500, failure("fixture_handler_failed", "Fixture handler failed")); }
        const outputChecked = validateSchemaValue(result, item.definition.output_schema);
        if (!outputChecked.ok) return send(response, 500, failure("invalid_fixture_output", "Fixture handler output failed schema validation", { validation: outputChecked }));
        const completed = clock();
        const receipt = {
          schema: "kujo.ability.receipt/v1", receipt_id: `receipt-${randomUUID()}`, invocation_id: body.invocation_id,
          ability_id: item.definition.id, ability_version: item.definition.version, definition_digest: item.digest,
          handler_id: `${item.definition.id}.fixture`, handler_version: "1.0.0", status: "succeeded", result, error: null,
          policy_decision: { schema: "kujo.ability.policy-decision/v1", decision_id: `decision-${body.invocation_id}`, outcome: needsApproval ? "approval_required" : "allow", reason: needsApproval ? "Fixture mutation requires approval." : "Fixture read is allowed.", requirements: needsApproval ? ["human"] : [], policy_id: "kujo.ability.devkit", policy_version: "1.0.0" },
          approval_id: approvalId, idempotency: { mode, state: mode === "keyed" ? "completed" : "not_applicable" },
          request_id: body.request_id || body.invocation_id, trace_id: body.trace_id || body.invocation_id, surface: "sdk", principal: actor,
          started_at_ms: started, completed_at_ms: completed, duration_ms: completed - started, audit: { ok: true, written: false, fixture: true }, metadata: { profile: "fixture", digest_algorithm: "sha256-canonical-json-v2" },
        };
        if (mode === "keyed") idempotency.set(scope, { requestDigest, receipt });
        return send(response, 200, { ok: true, receipt });
      }
      return send(response, 404, failure("not_found", "Development endpoint was not found"));
    } catch (error) {
      return send(response, error.status || 500, failure(error.status === 413 ? "request_too_large" : error.status === 400 ? "invalid_json" : "dev_server_error", error.status ? error.message : "Development server failed"));
    }
  });
  return server;
}

export function renderAbilityMarkdown(definition) {
  const checked = validateDevDefinition(definition);
  if (!checked.ok) throw new Error(`${checked.code}: ${checked.message}`);
  const effects = definition.effects.map((effect) => `- \`${effect.kind}\` on \`${effect.resource}\``).join("\n");
  return `# ${definition.id}\n\n${definition.description}\n\n- Version: \`${definition.version}\`\n- Idempotency: \`${definition.idempotency.mode}\`\n- Definition digest v2: \`${checked.definition_digest_v2}\`\n\n## Effects\n\n${effects}\n\n## Input schema\n\n\`\`\`json\n${JSON.stringify(definition.input_schema, null, 2)}\n\`\`\`\n\n## Output schema\n\n\`\`\`json\n${JSON.stringify(definition.output_schema, null, 2)}\n\`\`\`\n`;
}
