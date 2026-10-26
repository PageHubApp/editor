/** Bundle the parity demo (esbuild for the app, Tailwind CLI for the stylesheet) into scripts/parity/.out/demo. */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("../.out/demo/", import.meta.url));
await mkdir(out, { recursive: true });
await build({
  entryPoints: [here + "main.tsx"],
  outfile: out + "app.js",
  bundle: true,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  // react / react-dom live in the editor package; the workspace packages resolve to their sources
  nodePaths: [root + "packages/editor/node_modules"],
  conditions: ["pagehub-source"],
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
execFileSync(process.execPath, [fileURLToPath(new URL("../../../node_modules/@tailwindcss/cli/dist/index.mjs", import.meta.url)), "-i", here + "styles.css", "-o", out + "app.css", "--minify"], { stdio: "inherit" });
await copyFile(here + "index.html", out + "index.html");
