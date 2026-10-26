/**
 * The public API snapshot: for every published package and every `exports` subpath that has an `import` target,
 * the sorted runtime export names of the BUILT file. Compared with `api.txt` at the repo root.
 *
 *   node scripts/check-api.mjs            compare (needs built packages: `pnpm build:packages`; says so if not)
 *   node scripts/check-api.mjs --update   rewrite api.txt after an intended API change
 *
 * A removed or renamed export fails the check; so does a new one that was not recorded, so every API change is a
 * visible line in the diff of `api.txt`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const file = join(root, "api.txt");
const lines = [];

for (const dir of readdirSync(join(root, "packages")).sort()) {
  const pkgDir = join(root, "packages", dir);
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  if (pkg.private || !pkg.exports) continue;
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (typeof target !== "object" || !target.import) continue;
    const built = join(pkgDir, target.import);
    let mod;
    try {
      if (!existsSync(built)) throw new Error(`${target.import} is not built`);
      mod = await import(pathToFileURL(built).href);
    } catch (err) {
      // A stale or missing build (including a workspace dependency's dist) fails to import with an opaque error.
      console.error(`check-api: cannot load ${pkg.name}${subpath === "." ? "" : subpath.slice(1)}: ${err.message}`);
      console.error("Run `pnpm build:packages` first, then check:api again.");
      process.exit(1);
    }
    lines.push(`# ${pkg.name}${subpath === "." ? "" : subpath.slice(1)}`, ...Object.keys(mod).sort(), "");
  }
}

const next = lines.join("\n");
if (process.argv.includes("--update")) {
  writeFileSync(file, next);
  console.log(`check-api: wrote api.txt (${lines.filter((l) => l.startsWith("# ")).length} entry points)`);
  process.exit(0);
}

let current = "";
try {
  current = readFileSync(file, "utf8");
} catch {}
if (current === next) {
  console.log("check-api: ok");
  process.exit(0);
}
const a = new Set(current.split("\n"));
const b = new Set(next.split("\n"));
const removed = [...a].filter((l) => !b.has(l) && l);
const added = [...b].filter((l) => !a.has(l) && l);
console.error("check-api: the public API differs from api.txt");
for (const l of removed) console.error(`  - ${l}`);
for (const l of added) console.error(`  + ${l}`);
console.error("If intended, run: node scripts/check-api.mjs --update");
process.exit(1);
