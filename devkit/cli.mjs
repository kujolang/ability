#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAbilityDevServer, renderAbilityMarkdown, validateDevDefinition } from "./index.mjs";

function usage() {
  console.error("Usage: node devkit/cli.mjs validate <definition.json> | docs <definition.json> <output.md> | serve <manifest.json> [--port N]");
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "validate" && args.length === 1) {
    const result = validateDevDefinition(await readJson(args[0]));
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "docs" && args.length === 2) {
    await writeFile(resolve(args[1]), renderAbilityMarkdown(await readJson(args[0])));
    console.log(resolve(args[1]));
    return;
  }
  if (command === "serve" && args.length >= 1) {
    const manifestPath = resolve(args[0]);
    const manifest = await readJson(manifestPath);
    if (manifest.schema !== "kujo.ability.dev-manifest/v1" || !Array.isArray(manifest.entries)) throw new Error("invalid development manifest");
    const definitions = [];
    const handlers = new Map();
    for (const entry of manifest.entries) {
      const definition = await readJson(resolve(manifestPath, "..", entry.definition));
      definitions.push(definition);
      const result = entry.result;
      handlers.set(definition.id, async () => structuredClone(result));
    }
    const portIndex = args.indexOf("--port");
    const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 0;
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error("invalid port");
    const token = process.env.KUJO_ABILITY_DEV_TOKEN || randomBytes(24).toString("base64url");
    const server = createAbilityDevServer({ definitions, handlers, token });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      console.log(JSON.stringify({ ok: true, profile: "fixture", url: `http://127.0.0.1:${address.port}`, token_source: process.env.KUJO_ABILITY_DEV_TOKEN ? "environment" : "generated", token }));
    });
    return;
  }
  usage();
  process.exitCode = 2;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
