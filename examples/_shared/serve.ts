/**
 * Open an example in the editor:
 *
 *   npx tsx --conditions=pagehub-source examples/_shared/serve.ts examples/plain-html [--port 5170]
 *
 * Bundles the editor (esbuild + the Tailwind CLI, like `pnpm demo`), then serves it with the
 * example's site folder behind `/__api/*` (the engine's file-system storage: optimistic versions,
 * temp-file-then-rename writes) and as plain static files (so a page's `<link href="/assets/…">`
 * resolves inside the canvas). The example folder's `example.json` names the site root:
 * `{ "root": "site" }`. Saving in the editor rewrites those files in place.
 */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { fsStorage } from "@pagehub/engine/fs";

const require = createRequire(import.meta.url);
const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "../..");
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const dir = resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--port") ?? "");
if (!existsSync(join(dir, "example.json"))) {
  console.error("usage: npx tsx --conditions=pagehub-source examples/_shared/serve.ts <example dir> [--port 5170]\n(the folder needs an example.json)");
  process.exit(1);
}
const { root } = JSON.parse(readFileSync(join(dir, "example.json"), "utf8")) as { root: string };
const siteRoot = resolve(dir, root);
if (!existsSync(siteRoot)) {
  console.error(`site root ${siteRoot} does not exist yet (see the example's README for the step that creates it)`);
  process.exit(1);
}
const port = Number(flag("--port") ?? process.env.PORT ?? 5170);
const out = join(here, ".out", dir.split("/").pop()!);
const config = ["editor.config.ts", "editor.config.tsx"].map((f) => join(dir, f)).find(existsSync) ?? join(here, "defaultConfig.ts");

console.log("Building the editor…");
await mkdir(out, { recursive: true });
await build({
  entryPoints: [join(here, "main.tsx")],
  outfile: join(out, "app.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  conditions: ["pagehub-source"],
  alias: { "@example/config": config },
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
execFileSync(process.execPath, [join(repo, "node_modules/@tailwindcss/cli/dist/index.mjs"), "-i", require.resolve("@pagehub/editor/styles.tailwind.css"), "-o", join(out, "app.css"), "--minify"], { stdio: "inherit" });
await copyFile(join(here, "index.html"), join(out, "index.html"));

const storage = fsStorage({ root: siteRoot });
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};
const body = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((ok) => {
    let s = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (s += c));
    req.on("end", () => ok(s));
  });
const send = (res: import("node:http").ServerResponse, code: number, type: string, data: string | Buffer) => res.writeHead(code, { "content-type": type, "cache-control": "no-store" }).end(data);
const json = (res: import("node:http").ServerResponse, v: unknown, code = 200) => send(res, code, "application/json", JSON.stringify(v));

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/__api/list") return json(res, await storage.list());
    if (url.pathname === "/__api/read") {
      const f = await storage.read(url.searchParams.get("path") ?? "");
      return f ? json(res, f) : send(res, 404, "text/plain", "not found");
    }
    if (url.pathname === "/__api/write" && req.method === "PUT") {
      return json(res, await storage.write(url.searchParams.get("path") ?? "", await body(req), { baseVersion: url.searchParams.get("base") || null }));
    }
    if (url.pathname === "/__api/batch" && req.method === "POST") {
      const { changes, baseVersions } = JSON.parse(await body(req));
      return json(res, await storage.writeBatch!(changes, { baseVersions }));
    }
    const editor = url.pathname.startsWith("/__editor/") ? url.pathname.slice("/__editor/".length) : url.pathname === "/" ? "index.html" : null;
    if (editor !== null) return send(res, 200, TYPES[extname(editor)] ?? "application/octet-stream", await readFile(join(out, editor)));
    // anything else is a site file (stylesheets, images) so root-relative links in a page resolve
    const file = resolve(siteRoot, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(siteRoot + "/")) return send(res, 403, "text/plain", "forbidden");
    return send(res, 200, TYPES[extname(file)] ?? "application/octet-stream", await readFile(file));
  } catch (e) {
    send(res, (e as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500, "text/plain", String((e as Error).message));
  }
}).listen(port, () => console.log(`\n  ${dir.split("/").pop()} → http://localhost:${port}\n  (site files: ${siteRoot}; Ctrl+C to stop)\n`));
