/**
 * Publish readiness for every published package: `publint` (package.json / exports sanity) and
 * `@arethetypeswrong/cli` (do the types resolve for ESM consumers), both run on the packed tarball.
 * Build first (`pnpm build:packages`).
 *
 *   node scripts/check-publish.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const bin = (name) => join(root, "node_modules/.bin", name);
let failed = false;

for (const dir of readdirSync(join(root, "packages")).sort()) {
  const cwd = join(root, "packages", dir);
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  if (pkg.private) continue;
  console.log(`\n== ${pkg.name}`);
  // Stylesheet subpaths carry no types, so the types check skips them.
  const css = Object.keys(pkg.exports ?? {}).filter((k) => k.endsWith(".css"));
  for (const [cmd, args] of [
    ["publint", ["--strict", "--pack", "pnpm"]],
    ["attw", ["--pack", ".", "--profile", "esm-only", ...(css.length ? ["--exclude-entrypoints", ...css] : [])]],
  ]) {
    const r = spawnSync(bin(cmd), args, { cwd, stdio: "inherit" });
    if (r.status !== 0) {
      failed = true;
      console.error(`${pkg.name}: ${cmd} failed`);
    }
  }
}

process.exit(failed ? 1 : 0);
