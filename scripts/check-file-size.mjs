/**
 * Fails on any source or test file over 600 lines (packages/*\/src, packages/*\/test, examples/*\/*.test.ts).
 * Generated data files declare themselves with a leading "// generated" comment and are skipped.
 *
 *   node scripts/check-file-size.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 600;
const root = join(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "dist"]);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?[tj]sx?|css)$/.test(name)) out.push(full);
  }
  return out;
};

const roots = [];
for (const pkg of readdirSync(join(root, "packages"))) for (const d of ["src", "test"]) roots.push(join(root, "packages", pkg, d));
roots.push(join(root, "examples"), join(root, "apps"));

const over = [];
for (const dir of roots) {
  let files;
  try {
    files = walk(dir);
  } catch {
    continue;
  }
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    if (/^\s*\/\/ generated/i.test(text)) continue;
    const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    if (lines > LIMIT) over.push(`${f.slice(root.length + 1)}: ${lines} lines`);
  }
}

if (over.length) {
  console.error(`Files over ${LIMIT} lines:\n  ${over.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-file-size: ok (limit ${LIMIT})`);
