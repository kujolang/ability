import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, verifyRegistryEntry } from "../registry/verify.mjs";

const directory = await mkdtemp(join(tmpdir(), "kujo-ability-registry-"));
const artifact = Buffer.from("deterministic ability pack fixture\n");
const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const fingerprint = createHash("sha256").update(publicKeyPem.trim() + "\n").digest("hex");
const signed = {
  pack_id: "kujo.pack.release.checks",
  pack_version: "1.0.0",
  publisher_id: "kujo.publisher.core",
  artifact_path: "kujo-pack.tgz",
  artifact_sha256: artifactSha256,
  digest_algorithm: "sha256-canonical-json-v2",
  ability_ids: ["kujo.shipcheck.release.gate"],
  effects: ["read"],
  dependencies: [{ pack_id: "kujo.pack.ability.core", versions: { minimum: "1.0.0", maximum: "1.9.9" } }],
  compatibility: { kujo: { minimum: "1.2.0", maximum: "1.9.9" }, ability: { minimum: "1.0.0", maximum: "1.9.9" } },
  status: "active",
  visibility: "public",
  tenant_id: "",
  provenance: { source: "https://github.com/kujolang/shipcheck", revision: "fixture" },
  published_at: "2026-09-02T00:00:00Z",
};
const entry = { schema: "kujo.ability.pack-entry/v1", signed, public_key_pem: publicKeyPem, signature: sign(null, Buffer.from(canonicalJson(signed)), privateKey).toString("base64") };
const policy = { schema: "kujo.ability.registry-policy/v1", allowed_publishers: { "kujo.publisher.core": fingerprint }, revoked_artifacts: [], revoked_packs: [] };
const options = { artifactRoot: directory, kujoVersion: "1.2.2", abilityVersion: "1.0.1" };

try {
  await writeFile(join(directory, "kujo-pack.tgz"), artifact);
  assert.equal((await verifyRegistryEntry(entry, policy, options)).ok, true);

  const revoked = await verifyRegistryEntry(entry, { ...policy, revoked_artifacts: [artifactSha256] }, options);
  assert.equal(revoked.code, "pack_revoked");
  const incompatible = await verifyRegistryEntry(entry, policy, { ...options, kujoVersion: "2.0.0" });
  assert.equal(incompatible.code, "pack_incompatible");
  const wrongPublisher = await verifyRegistryEntry(entry, { ...policy, allowed_publishers: {} }, options);
  assert.equal(wrongPublisher.code, "publisher_not_allowed");
  const badSignature = await verifyRegistryEntry({ ...entry, signature: Buffer.alloc(64).toString("base64") }, policy, options);
  assert.equal(badSignature.code, "invalid_pack_signature");

  await writeFile(join(directory, "kujo-pack.tgz"), Buffer.from("tampered\n"));
  const tampered = await verifyRegistryEntry(entry, policy, options);
  assert.equal(tampered.code, "pack_checksum_mismatch");
  const escaping = await verifyRegistryEntry({ ...entry, signed: { ...signed, artifact_path: "../outside.tgz" } }, policy, options);
  assert.equal(escaping.code, "invalid_pack_artifact_path");
  const leakedTenant = await verifyRegistryEntry({ ...entry, signed: { ...signed, tenant_id: "tenant-secret" } }, policy, options);
  assert.equal(leakedTenant.code, "invalid_pack_visibility");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Ability registry signature, revocation, compatibility, and isolation checks passed");
