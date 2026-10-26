/**
 * Examples are consumers: they import the packages by name (`@pagehub/engine`, `@pagehub/editor/...`), exactly as a
 * user's project would, never by a path into `packages/` (`../packages/engine/src/...`). Fails on any such import.
 *
 *   node scripts/check-examples.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const PATH_INTO_PACKAGES = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["'](?:\.{1,2}\/)+(?:[^"']*\/)?packages\/[^"']*["']/g;

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?[tj]sx?)$/.test(name)) out.push(full);
  }
  return out;
};

const bad = [];
for (const f of walk(join(root, "examples"))) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(PATH_INTO_PACKAGES)) bad.push(`${f.slice(root.length + 1)}: ${m[0]}`);
}

if (bad.length) {
  console.error(`Examples must import packages by name, not by path:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log("check-examples: ok");
