/** `pnpm demo`: bundle the editor demo (build.mjs) and serve it on http://localhost:<port> (default 5050). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const out = fileURLToPath(new URL("../.out/demo/", import.meta.url));
const port = Number(process.env.PORT) || 5050;

console.log("Building the demo…");
const built = spawnSync(process.execPath, [here("build.mjs")], { stdio: "inherit" });
if (built.status) process.exit(built.status ?? 1);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
createServer(async (req, res) => {
  const name = (req.url || "/").split("?")[0].replace(/^\/+/, "") || "index.html";
  try {
    const body = await readFile(out + name);
    res.writeHead(200, { "content-type": TYPES[extname(name)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`\n  Editor demo → http://localhost:${port}\n  (Ctrl+C to stop)\n`));
