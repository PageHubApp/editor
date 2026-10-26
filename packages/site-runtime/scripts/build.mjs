import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Builds the published runtime into `outdir` (default `dist`): `runtime.js`, `chunks/*.js`, `animate.css`, `kit.css` and
 * `manifest.json` = `{ version, files: [{ path, bytes, sha256 }] }`. `version` hashes the file contents, so equal builds
 * have equal versions and a host can upload `files` under `<version>/`.
 */
export async function buildRuntime(outdir = root + "dist") {
  const chunks = (await readdir(root + "src/chunks")).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3));
  await rm(outdir, { recursive: true, force: true });
  await build({
    absWorkingDir: root,
    entryPoints: { runtime: "src/runtime.ts", ...Object.fromEntries(chunks.map((c) => ["chunks/" + c, `src/chunks/${c}.ts`])) },
    outdir,
    chunkNames: "chunks/shared-[hash]",
    bundle: true,
    splitting: true,
    format: "esm",
    target: "es2022",
    minify: true,
    legalComments: "none",
  });
  await mkdir(outdir, { recursive: true });
  await copyFile(root + "src/animate.css", outdir + "/animate.css");
  await copyFile(root + "src/kit.css", outdir + "/kit.css");

  const walk = async (dir, prefix = "") => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) out.push(...(e.isDirectory() ? await walk(dir + "/" + e.name, prefix + e.name + "/") : [prefix + e.name]));
    return out;
  };
  const paths = (await walk(outdir)).sort();
  const files = [];
  for (const path of paths) {
    const bytes = await readFile(outdir + "/" + path);
    files.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const version = createHash("sha256").update(files.map((f) => f.path + "\0" + f.sha256).join("\n")).digest("hex").slice(0, 12);
  const manifest = { version, files };
  await writeFile(outdir + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildRuntime(process.argv[2]);
