import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDevDefinition } from "../devkit/index.mjs";
for (const item of JSON.parse(readFileSync("tests/fixtures/semantics_conformance.json", "utf8"))) {
  const checked = validateDevDefinition(item.definition);
  assert.equal(checked.ok ? "ok" : checked.code, item.expected, item.label);
}
console.log("Devkit semantic conformance: 14 cases passed");
