import { readFileSync } from "node:fs";
import { abilityDefinitionDigestV2, reviewEffects, validateAbilityDefinition, validateAbilityReceipt } from "../sdk/typescript/index.ts";

const fixture = JSON.parse(readFileSync("tests/fixtures/sdk_conformance.json", "utf8"));
const definition = validateAbilityDefinition(fixture.definition);
const receipt = validateAbilityReceipt(fixture.receipt);
const digest = abilityDefinitionDigestV2(fixture.definition);
if (!definition.ok || !receipt.ok || !digest.ok) throw new Error("TypeScript conformance fixture failed");
const invalid = { ...fixture.definition, effects: [{ kind: "shell", resource: "kujo.docs.content" }] };
const rejected = validateAbilityDefinition(invalid);
if (rejected.ok) throw new Error("TypeScript SDK accepted an invalid effect");
const decimal = structuredClone(fixture.definition); decimal.input_schema.properties.query.minLength = 0.5;
const decimalDigest = abilityDefinitionDigestV2(decimal);
if (decimalDigest.ok || decimalDigest.code !== "unsupported_canonical_json_number") throw new Error("TypeScript SDK accepted a non-canonical number");
console.log(JSON.stringify({ digest: digest.value, effectReview: reviewEffects(definition.value), invalidCode: rejected.code, receiptStatus: fixture.receipt.status }));
