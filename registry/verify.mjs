#!/usr/bin/env node

import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ID = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*){2,}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const HEX = /^[a-f0-9]{64}$/;
const EFFECTS = new Set(["read", "write", "delete", "external"]);

function stable(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("canonical JSON v2 supports only safe integers");
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export function canonicalJson(value) { return JSON.stringify(stable(value)); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function fail(code, message, details = {}) { return { ok: false, code, message, details }; }
function validVersionRange(range) {
  return range && VERSION.test(range.minimum || "") && VERSION.test(range.maximum || "") && compareVersions(range.minimum, range.maximum) <= 0;
}
function compareVersions(left, right) {
  const a = left.split(".").map(Number); const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}
function safeArtifactPath(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 512 && /^[A-Za-z0-9._/-]+$/.test(value) && !isAbsolute(value) && !value.includes("\\") && !value.includes(":") && value.split("/").every((part) => part && part !== "." && part !== "..");
}
async function containedArtifact(root, artifactPath, maxBytes) {
  const rootPath = await realpath(root);
  const lexicalPath = resolve(rootPath, artifactPath);
  const metadata = await lstat(lexicalPath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) return fail("invalid_pack_artifact_type", "Pack artifact must be a regular file and must not be a symbolic link");
  const artifactPathReal = await realpath(lexicalPath);
  const displacement = relative(rootPath, artifactPathReal);
  if (!displacement || displacement === ".." || displacement.startsWith(`..${sep}`) || isAbsolute(displacement)) return fail("pack_artifact_escape", "Pack artifact must remain within the artifact root");
  if (metadata.size > maxBytes) return fail("pack_artifact_too_large", "Pack artifact exceeds the verification size limit", { size: metadata.size, max_bytes: maxBytes });
  return { ok: true, path: artifactPathReal };
}

export async function verifyRegistryEntry(entry, policy, options) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail("invalid_registry_entry", "Registry entry must be an object");
  if (entry.schema !== "kujo.ability.pack-entry/v1" || !entry.signed || typeof entry.signed !== "object") return fail("invalid_registry_entry_schema", "Registry entry schema is invalid");
  const signed = entry.signed;
  if (!ID.test(signed.pack_id || "") || !VERSION.test(signed.pack_version || "")) return fail("invalid_pack_identity", "Pack identity is invalid");
  if (!ID.test(signed.publisher_id || "") || !HEX.test(signed.artifact_sha256 || "")) return fail("invalid_pack_publisher", "Publisher or artifact identity is invalid");
  if (!safeArtifactPath(signed.artifact_path)) return fail("invalid_pack_artifact_path", "Pack artifact path must remain within the artifact root");
  if (signed.digest_algorithm !== "sha256-canonical-json-v2") return fail("unsupported_digest_algorithm", "Pack must use the v2 canonical digest algorithm");
  if (!Array.isArray(signed.ability_ids) || signed.ability_ids.length < 1 || signed.ability_ids.some((id) => !ID.test(id))) return fail("invalid_pack_abilities", "Pack Ability identities are invalid");
  if (!Array.isArray(signed.effects) || signed.effects.length < 1 || signed.effects.some((kind) => !EFFECTS.has(kind))) return fail("invalid_pack_effects", "Pack effects are invalid");
  if (!Array.isArray(signed.dependencies) || signed.dependencies.some((item) => !item || !ID.test(item.pack_id || "") || !validVersionRange(item.versions))) return fail("invalid_pack_dependencies", "Pack dependencies are invalid");
  if (!validVersionRange(signed.compatibility?.kujo) || !validVersionRange(signed.compatibility?.ability)) return fail("invalid_pack_compatibility", "Pack compatibility range is invalid");
  if (!["active", "deprecated", "revoked"].includes(signed.status)) return fail("invalid_pack_status", "Pack status is invalid");
  const tenantIdValid = typeof signed.tenant_id === "string" && signed.tenant_id.length <= 256;
  if (!["public", "private"].includes(signed.visibility) || !tenantIdValid || (signed.visibility === "private" && !signed.tenant_id) || (signed.visibility === "public" && signed.tenant_id !== "")) return fail("invalid_pack_visibility", "Private packs require one bounded tenant and public packs must not carry a tenant");
  if (signed.visibility === "private" && (typeof options.tenantId !== "string" || !options.tenantId || options.tenantId !== signed.tenant_id)) return fail("pack_tenant_mismatch", "Private pack tenant does not match the requesting tenant");

  const normalizedKey = String(entry.public_key_pem || "").trim() + "\n";
  const fingerprint = sha256(normalizedKey);
  if (policy.allowed_publishers?.[signed.publisher_id] !== fingerprint) return fail("publisher_not_allowed", "Publisher key is not allowlisted");
  if (policy.revoked_artifacts?.includes(signed.artifact_sha256) || policy.revoked_packs?.includes(`${signed.pack_id}@${signed.pack_version}`) || signed.status === "revoked") return fail("pack_revoked", "Pack or artifact is revoked");
  if (!VERSION.test(options.kujoVersion || "") || !VERSION.test(options.abilityVersion || "")) return fail("invalid_runtime_version", "Runtime versions must be numeric major.minor.patch text");
  if (compareVersions(options.kujoVersion, signed.compatibility.kujo.minimum) < 0 || compareVersions(options.kujoVersion, signed.compatibility.kujo.maximum) > 0 || compareVersions(options.abilityVersion, signed.compatibility.ability.minimum) < 0 || compareVersions(options.abilityVersion, signed.compatibility.ability.maximum) > 0) return fail("pack_incompatible", "Pack is outside the configured runtime compatibility window");

  let publicKey;
  try { publicKey = createPublicKey(normalizedKey); } catch { return fail("invalid_publisher_key", "Publisher public key is invalid"); }
  let signature;
  try { signature = Buffer.from(String(entry.signature || ""), "base64"); } catch { return fail("invalid_pack_signature", "Pack signature is invalid"); }
  let signedBytes;
  try { signedBytes = Buffer.from(canonicalJson(signed)); }
  catch { return fail("unsupported_canonical_json_number", "Canonical JSON v2 supports only safe integers"); }
  if (!signature.length || !verifySignature(null, signedBytes, publicKey, signature)) return fail("invalid_pack_signature", "Pack signature verification failed");

  const maxArtifactBytes = Number.isSafeInteger(options.maxArtifactBytes) && options.maxArtifactBytes > 0 ? options.maxArtifactBytes : 268_435_456;
  let artifactResult;
  try { artifactResult = await containedArtifact(options.artifactRoot, signed.artifact_path, maxArtifactBytes); }
  catch { return fail("invalid_pack_artifact", "Pack artifact could not be resolved safely"); }
  if (!artifactResult.ok) return artifactResult;
  const artifact = await readFile(artifactResult.path);
  const actual = sha256(artifact);
  if (actual !== signed.artifact_sha256) return fail("pack_checksum_mismatch", "Pack artifact checksum does not match", { expected: signed.artifact_sha256, actual });
  return { ok: true, pack_id: signed.pack_id, pack_version: signed.pack_version, publisher_id: signed.publisher_id, artifact_sha256: actual, effects: [...signed.effects], status: signed.status, visibility: signed.visibility, tenant_id: signed.visibility === "private" ? signed.tenant_id : "" };
}

async function main() {
  const [entryPath, policyPath, artifactRoot, kujoVersion, abilityVersion] = process.argv.slice(2);
  if (!entryPath || !policyPath || !artifactRoot || !kujoVersion || !abilityVersion) throw new Error("usage: verify.mjs <entry.json> <policy.json> <artifact-root> <kujo-version> <ability-version>");
  const entry = JSON.parse(await readFile(entryPath, "utf8"));
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const result = await verifyRegistryEntry(entry, policy, { artifactRoot, kujoVersion, abilityVersion });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
