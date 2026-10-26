/**
 * Builds one published package into `dist/` (run from the package folder, as its `build` script):
 *
 *   1. esbuild bundles the package's entry points into ESM with shared chunks (`splitting`), dependencies left external.
 *      The entries come from `package.json`: every `exports` subpath whose `pagehub-source` is a .ts(x) file (its `import`
 *      path names the output file) and every `bin`. `--also <dir>` adds every `.ts` file in `src/<dir>` as an entry too.
 *      The source uses extensionless relative specifiers (bundler resolution); bundling is what turns that into ESM that
 *      Node and npm consumers can load.
 *   2. non-code files under `src` (css, md, json) are copied across;
 *   3. `tsc -p tsconfig.build.json --noCheck` emits the `.d.ts` files, and their relative specifiers get the `.js`
 *      extension Node's ESM type resolution needs (`./x` -> `./x.js`, `./dir` -> `./dir/index.js`). Type errors do not
 *      stop the build; `pnpm typecheck` is the type gate.
 *
 *   node ../../scripts/build-package.mjs [--out dist/lib] [--also chunks]
 *
 * `--out`: the output folder (default `dist`). A `bin` file is made executable afterwards (it starts with a `#!`).
 * The d.ts step reads the other workspace packages through their `types` condition, so build in dependency order
 * (`pnpm -r build` does).
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = process.cwd();
const outRel = arg("--out", "dist").replace(/^\.\//, "").replace(/\/+$/, "");
const out = join(root, outRel);
const src = join(root, "src");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

const walk = async (dir) => {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
};

/** `./dist/lib/head/theme.js` -> `head/theme` (the entry's name under `out`). */
const entryName = (distPath) => {
  const p = distPath.replace(/^\.\//, "");
  if (!p.startsWith(outRel + "/") || !p.endsWith(".js")) throw new Error(`${pkg.name}: ${distPath} is not a .js file under ${outRel}/`);
  return p.slice(outRel.length + 1, -3);
};
const entries = {};
for (const [sub, target] of Object.entries(pkg.exports ?? {})) {
  if (!target || typeof target !== "object" || !/\.tsx?$/.test(target["pagehub-source"] ?? "")) continue; // stylesheets build separately
  if (!target.import) throw new Error(`${pkg.name}: export "${sub}" has a pagehub-source but no import path`);
  entries[entryName(target.import)] = join(root, target["pagehub-source"]);
}
const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {});
for (const bin of bins) {
  const name = entryName(bin);
  const file = [".ts", ".tsx"].map((ext) => join(src, name + ext)).find(existsSync);
  if (!file) throw new Error(`${pkg.name}: no src/${name}.ts for bin ${bin}`);
  entries[name] = file;
}
const also = arg("--also");
if (also) {
  for (const f of await readdir(join(src, also))) if (/\.tsx?$/.test(f) && !/\.d\.ts$/.test(f)) entries[`${also}/${f.replace(/\.tsx?$/, "")}`] = join(src, also, f);
}

const all = await walk(src);
const isTs = (f) => /\.tsx?$/.test(f) && !/\.d\.[cm]?ts$/.test(f);
const assets = all.filter((f) => !isTs(f) && !/\.d\.[cm]?ts$/.test(f) && !/\.m?js$/.test(f));

// Only the build's own output goes: site-runtime keeps its published assets next to its library in `dist`.
await rm(out, { recursive: true, force: true });
await build({
  entryPoints: entries,
  outdir: out,
  bundle: true,
  splitting: true,
  // shared chunks sit at the root of `out`, so module-relative paths (`import.meta.url`) keep the source's depth
  chunkNames: "[name]-[hash]",
  packages: "external",
  format: "esm",
  platform: "neutral",
  target: "es2022",
  sourcemap: true,
  sourcesContent: false,
  tsconfig: join(root, "tsconfig.build.json"),
  logLevel: "warning",
});
for (const f of assets) {
  const to = join(out, f.slice(src.length + 1));
  await mkdir(dirname(to), { recursive: true });
  await copyFile(f, to);
}

const tsc = spawnSync(process.execPath, [join(import.meta.dirname, "../node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json", "--noCheck", "--outDir", out], { cwd: root, stdio: "inherit" });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

// Node's ESM type resolution (and so `moduleResolution: node16/nodenext` consumers) needs full relative specifiers.
const SPEC = /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"'\n]*?)\2/g;
for (const f of (await walk(out)).filter((f) => f.endsWith(".d.ts"))) {
  const text = await readFile(f, "utf8");
  const next = text.replace(SPEC, (m, pre, q, spec) => {
    if (/\.(js|json|css)$/.test(spec)) return m;
    const base = resolve(dirname(f), spec);
    if (existsSync(base + ".d.ts")) return `${pre}${q}${spec}.js${q}`;
    if (existsSync(join(base, "index.d.ts"))) return `${pre}${q}${spec}/index.js${q}`;
    throw new Error(`${pkg.name}: ${f.slice(root.length + 1)} imports ${spec}, which has no declaration file`);
  });
  if (next !== text) await writeFile(f, next);
}

for (const bin of bins) await chmod(join(root, bin), 0o755);
console.log(`${root.split("/").pop()}: ${Object.keys(entries).length} entries -> ${outRel}`);
