import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFileApi } from "../src/fileApi.ts";
import { engine, tempSite } from "./helpers.ts";

async function serve(dir: string): Promise<{ base: string; server: Server }> {
  const api = createFileApi({ root: dir, engine });
  const server = createServer(async (req, res) => {
    if (!(await api(req, res, new URL(req.url!, "http://x")))) res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server };
}

const put = (url: string, body: unknown, method = "PUT") => fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("list, read, write with versions, and a stale write conflicts", async () => {
  const dir = tempSite({ "index.liquid": "<p>a</p>", "notes.txt": "private" });
  const { base, server } = await serve(dir);
  try {
    const { files } = await (await fetch(`${base}/api/files`)).json();
    assert.deepEqual(files.map((f: { path: string }) => f.path), ["index.liquid"]); // only site files
    const read = await (await fetch(`${base}/api/file?path=index.liquid`)).json();
    assert.equal(read.text, "<p>a</p>");
    const ok = await put(`${base}/api/file?path=index.liquid`, { text: "<p>b</p>", baseVersion: read.version });
    assert.equal(ok.status, 200);
    assert.equal(readFileSync(join(dir, "index.liquid"), "utf8"), "<p>b</p>");
    const stale = await put(`${base}/api/file?path=index.liquid`, { text: "<p>c</p>", baseVersion: read.version });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).theirs, "<p>b</p>");
    assert.equal(readFileSync(join(dir, "index.liquid"), "utf8"), "<p>b</p>");
  } finally {
    server.close();
  }
});

test("a batch is all or nothing", async () => {
  const dir = tempSite({ "a.liquid": "a", "b.liquid": "b" });
  const { base, server } = await serve(dir);
  try {
    const { files } = await (await fetch(`${base}/api/files`)).json();
    const v = Object.fromEntries(files.map((f: { path: string; version: string }) => [f.path, f.version]));
    const stale = await put(`${base}/api/batch`, { changes: [{ path: "a.liquid", text: "A" }, { path: "b.liquid", text: "B" }], baseVersions: { "a.liquid": v["a.liquid"], "b.liquid": "stale" } }, "POST");
    assert.equal(stale.status, 409);
    assert.equal(readFileSync(join(dir, "a.liquid"), "utf8"), "a");
    const ok = await put(`${base}/api/batch`, { changes: [{ path: "a.liquid", text: "A" }, { path: "b.liquid", delete: true }], baseVersions: v }, "POST");
    assert.equal(ok.status, 200);
    assert.equal(readFileSync(join(dir, "a.liquid"), "utf8"), "A");
  } finally {
    server.close();
  }
});

test("paths outside the site or that are not site files are refused", async () => {
  const { base, server } = await serve(tempSite({ "index.liquid": "x", ".secret.json": "{}" }));
  try {
    for (const path of ["../x.json", "/etc/passwd", ".secret.json", "node_modules/a.json", "image.png"]) {
      assert.equal((await fetch(`${base}/api/file?path=${encodeURIComponent(path)}`)).status, 400, path);
    }
  } finally {
    server.close();
  }
});
