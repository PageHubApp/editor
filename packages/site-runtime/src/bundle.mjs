/**
 * Node-only: the whole runtime as ONE self-contained browser module (a string). `start()` plus every
 * `src/chunks/*` is bundled and registered through `setChunkLoader`, so a page needs no chunk server and no network.
 * For previews and editing canvases, which load the same single file a published site's start-up runs, without Vite's
 * client inside the frame. The built `dist/` (chunks loaded by URL) is what a published site ships.
 *
 * Needs `esbuild` (an optional peer dependency).
 */
import { readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Path math on this file's own URL, not `new URL("..", import.meta.url)`: bundlers (Next's Turbopack) read that
// form as an asset reference and fail to resolve a directory.
const srcDir = dirname(fileURLToPath(import.meta.url)) + "/";
const pkgDir = dirname(srcDir.slice(0, -1)) + "/";

/** @param {{ minify?: boolean }} [options] */
export async function bundleInline({ minify = true } = {}) {
  const esbuild = await import("esbuild");
  const names = (await readdir(srcDir + "chunks")).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)).sort();
  const imports = names.map((n, i) => `import * as c${i} from ${JSON.stringify(srcDir + "chunks/" + n + ".ts")};`).join("\n");
  const table = names.map((n, i) => `${JSON.stringify(n)}: c${i}`).join(", ");
  // The loader is handed `chunkBase + name + ".js"`; nothing is fetched, the name maps straight to its bundled module.
  const entry =
    `import { start, setChunkLoader } from ${JSON.stringify(srcDir + "index.ts")};\n` +
    `${imports}\n` +
    `const mods = { ${table} };\n` +
    `setChunkLoader((url) => Promise.resolve(mods[url.replace(/\\.js(\\?.*)?$/, "").split("/").pop()] ?? {}));\n` +
    `import { get, set } from ${JSON.stringify(srcDir + "state-store.ts")};\nimport { runStateAction } from ${JSON.stringify(srcDir + "state-action.ts")};\nglobalThis.__siteRuntime = { start, state: { get, set, run: runStateAction } };\n` +
    `start();\n`;
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: pkgDir, loader: "ts" },
    write: false,
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    minify,
    logLevel: "warning",
  });
  return result.outputFiles[0].text;
}
