/**
 * Keeps `ENGINE_VERSION` (packages/engine/src/version.ts) equal to the engine's package.json version.
 * Runs after `changeset version` (the `version-packages` script); a test fails if the two ever differ.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "../packages/engine");
const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
const file = join(dir, "src/version.ts");
const next = readFileSync(file, "utf8").replace(/ENGINE_VERSION = "[^"]*"/, `ENGINE_VERSION = "${version}"`);
writeFileSync(file, next);
console.log(`ENGINE_VERSION = ${version}`);
