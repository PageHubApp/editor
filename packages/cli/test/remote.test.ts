import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient, ApiError } from "../src/remote/client.ts";
import { clearCredentials, readCredentials, resolveRemote, writeCredentials } from "../src/remote/config.ts";
import { login } from "../src/login.ts";
import { chunkChanges, locate } from "../src/push.ts";
import { pageInputFromPath } from "../src/remote/pageFromPath.ts";
import { hashText, isSourcePath, walkLocal } from "../src/remote/paths.ts";
import { tempDir, writeFiles } from "./fakeServer.ts";

const KEY = "ph_secret_test_key_123";

/** A fetch that answers from a table and records every call. */
function fakeFetch(handler: (method: string, url: string, body: any, headers: Headers) => { status: number; body: unknown }) {
  const calls: Array<{ method: string; url: string; body: any; headers: Headers }> = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init.method ?? "GET", url, body, headers });
    const r = handler(init.method ?? "GET", url, body, headers);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { impl, calls };
}

test("source paths: the remote layout is accepted, anything else is not", () => {
  for (const ok of ["site.json", "theme.css", "pages/index.liquid", "pages/shop/[handle].liquid", "partials/header.liquid", "sections/hero.liquid", "assets/lab.js", "locales/en.json", "emails/order_receipt.liquid"]) assert.ok(isSourcePath(ok), ok);
  for (const bad of ["README.md", "pages/About.liquid", "pages/a b.liquid", "partials/a/b.liquid", "assets/app.css", "pages/../x.liquid", "data.json"]) assert.ok(!isSourcePath(bad), bad);
});

test("walkLocal finds site files, skips dot-folders and flags misnamed files in site folders only", () => {
  const dir = tempDir();
  writeFiles(dir, { "site.json": "{}", "README.md": "x", "data.json": "{}", ".pagehub/state.json": "{}", ".git/x.liquid": "x", "pages/Index.liquid": "x", "pages/ok.liquid": "x", "node_modules/p/x.liquid": "x" });
  const w = walkLocal(dir);
  assert.deepEqual(w.files, ["pages/ok.liquid", "site.json"]);
  assert.deepEqual(w.misnamed, ["pages/Index.liquid"]);
});

test("a file's version is the sha256 of its text", () => {
  assert.equal(hashText("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("pageInputFromPath reads the route the way the server does", () => {
  assert.deepEqual(pageInputFromPath("pages/about-us.liquid"), { name: "About us", slug: "about-us", pathPattern: null, file: "pages/about-us.liquid" });
  assert.deepEqual(pageInputFromPath("pages/shop/[handle].liquid"), { name: "Shop", slug: "shop", pathPattern: ":handle", file: "pages/shop/[handle].liquid" });
  assert.deepEqual(pageInputFromPath("pages/docs/intro.liquid"), { name: "Intro", slug: "docs", pathPattern: "intro", file: "pages/docs/intro.liquid" });
  assert.equal((pageInputFromPath("pages/index.liquid") as { slug: string }).slug, "");
  assert.match((pageInputFromPath("pages/[x].liquid") as { error: string }).error, /fixed first segment/);
});

test("chunkChanges splits by count and by size, and keeps every change", () => {
  const changes = Array.from({ length: 7 }, (_, i) => ({ path: `partials/p${i}.liquid`, text: "x".repeat(1000) }));
  assert.equal(chunkChanges(changes).length, 1);
  assert.deepEqual(chunkChanges(changes, { maxCount: 3 }).map((c) => c.length), [3, 3, 1]);
  assert.deepEqual(chunkChanges(changes, { maxBytes: 2500 }).map((c) => c.length), [2, 2, 2, 1]);
  assert.deepEqual(chunkChanges([{ path: "a.liquid", delete: true }]).flat().length, 1);
});

test("locate turns an offset into path:line:col", () => {
  const text = "ab\ncd\nef";
  assert.equal(locate("p.liquid", text, 0), "p.liquid:1:1");
  assert.equal(locate("p.liquid", text, 4), "p.liquid:2:2");
  assert.equal(locate("p.liquid", text, 6), "p.liquid:3:1");
  assert.equal(locate("p.liquid", undefined, 3), "p.liquid");
});

test("the client sends the key as a Bearer header, lists files and reads one by its escaped path", async () => {
  const { impl, calls } = fakeFetch((_m, url) =>
    url.endsWith("/files") ? { status: 200, body: { paths: ["site.json"], versions: { "site.json": "h" }, version: 4, styling: "tailwind-daisy" } } : { status: 200, body: { text: "T", version: "v" } },
  );
  const client = createClient({ baseUrl: "https://x.test", apiKey: KEY }, impl);
  assert.deepEqual(await client.listFiles("s1"), { paths: ["site.json"], versions: { "site.json": "h" }, version: 4, styling: "tailwind-daisy" });
  assert.deepEqual(await client.readFile("s1", "pages/shop/[handle].liquid"), { text: "T", version: "v" });
  assert.equal(calls[0]!.url, "https://x.test/api/v1/sites/s1/files");
  assert.equal(calls[1]!.url, "https://x.test/api/v1/sites/s1/files/pages/shop/%5Bhandle%5D.liquid");
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${KEY}`);
});

test("readFiles uses the bulk read in groups of 40, and reads a skipped file alone", async () => {
  const paths = Array.from({ length: 45 }, (_, i) => `partials/p${i}.liquid`);
  const { impl, calls } = fakeFetch((_m, url) => {
    const m = /[?]read=(.*)$/.exec(url);
    if (!m) return { status: 200, body: { text: "ALONE", version: "va" } };
    const asked = decodeURIComponent(m[1]!).split(",");
    if (asked.length === 1 && asked[0] === "site.json") return { status: 200, body: { files: [], missing: ["site.json"], skipped: [] } };
    return { status: 200, body: { files: asked.filter((p) => p !== "partials/p3.liquid").map((p) => ({ path: p, text: p, version: "v" })), missing: [], skipped: asked.includes("partials/p3.liquid") ? [{ path: "partials/p3.liquid", chars: 9e5 }] : [] } };
  });
  const client = createClient({ baseUrl: "https://x.test", apiKey: KEY }, impl);
  const out = await client.readFiles("s1", paths);
  assert.equal(Object.keys(out).length, 45);
  assert.equal(out["partials/p3.liquid"]!.text, "ALONE");
  assert.equal(calls.filter((c) => c.url.includes("?read=") && !c.url.endsWith("site.json")).length, 2);
});

test("without the bulk read, files are read one by one", async () => {
  const { impl, calls } = fakeFetch((_m, url) => (url.includes("?read=") ? { status: 200, body: { paths: [], versions: {}, version: 1 } } : { status: 200, body: { text: "one", version: "v" } }));
  const client = createClient({ baseUrl: "https://x.test", apiKey: KEY }, impl);
  assert.equal(await client.supportsBulk("s1"), false);
  const out = await client.readFiles("s1", ["partials/a.liquid", "partials/b.liquid"]);
  assert.deepEqual(Object.keys(out).sort(), ["partials/a.liquid", "partials/b.liquid"]);
  assert.equal(calls.filter((c) => c.url.includes("/files/partials/")).length, 2);
});

test("saveBatch maps each answer: ok, conflict, lint, lock, maintenance", async () => {
  const answers: Array<{ status: number; body: unknown }> = [
    { status: 200, body: { versions: { a: "h" }, version: 2, advisories: ["note"], pages: [{ pageId: "p", file: "pages/p.liquid", url: "/p" }] } },
    { status: 409, body: { error: "version_conflict", conflicts: [{ path: "a", theirs: "T", version: "v" }] } },
    { status: 422, body: { error: "lint", message: "x", path: "pages/a.liquid", issues: [{ rule: "r", message: "m", range: { start: 3 } }] } },
    { status: 403, body: { error: "rejected", message: "pages/a.liquid: removes a locked element" } },
    { status: 503, body: { error: "maintenance", message: "back soon" } },
  ];
  const { impl, calls } = fakeFetch(() => answers.shift()!);
  const client = createClient({ baseUrl: "https://x.test", apiKey: KEY }, impl);
  const send = () => client.saveBatch("s1", [{ path: "a", text: "t" }], { a: null }, [{ path: "pages/p.liquid", name: "P" }]);
  const ok = await send();
  assert.equal(ok.kind, "ok");
  assert.deepEqual(calls[0]!.body.pages, [{ path: "pages/p.liquid", name: "P" }]);
  assert.deepEqual((await send()).kind, "conflict");
  const lint = await send();
  assert.equal(lint.kind === "lint" && lint.issues[0]!.range!.start, 3);
  assert.deepEqual(await send(), { kind: "rejected", status: 403, message: "pages/a.liquid: removes a locked element" });
  assert.deepEqual(await send(), { kind: "maintenance", message: "back soon" });
});

test("a rejected key, a missing site and an unreachable server are errors that never contain the key", async () => {
  const rejected = createClient({ baseUrl: "https://x.test", apiKey: KEY }, fakeFetch(() => ({ status: 401, body: { error: "unauthorized" } })).impl);
  await assert.rejects(rejected.listFiles("s1"), (e: Error) => e instanceof ApiError && /rejected \(401\)/.test(e.message) && !e.message.includes(KEY));
  const missing = createClient({ baseUrl: "https://x.test", apiKey: KEY }, fakeFetch(() => ({ status: 404, body: { error: "site_not_found" } })).impl);
  await assert.rejects(missing.listFiles("nope"), /No site nope for this key/);
  const down = createClient({ baseUrl: "https://x.test", apiKey: KEY }, (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch);
  await assert.rejects(down.listFiles("s1"), (e: Error) => /Can't reach https:\/\/x\.test: ECONNREFUSED/.test(e.message) && !e.message.includes(KEY));
});

test("resolveRemote: env key beats the saved one, the flag beats env, and the default is pagehub.dev", () => {
  const dir = tempDir();
  const env = { PAGEHUB_CONFIG_DIR: dir } as NodeJS.ProcessEnv;
  assert.throws(() => resolveRemote({ env }), /No API key. Run `pagehub login`/);
  writeCredentials({ apiKey: "ph_saved", baseUrl: "https://saved.test/" }, env);
  assert.deepEqual(resolveRemote({ env }), { apiKey: "ph_saved", baseUrl: "https://saved.test" });
  assert.deepEqual(resolveRemote({ env: { ...env, PAGEHUB_API_KEY: "ph_env", PAGEHUB_API_BASE_URL: "https://env.test" } }), { apiKey: "ph_env", baseUrl: "https://env.test" });
  assert.throws(() => resolveRemote({ env, baseUrl: "https://flag.test/" }), /saved key is for https:\/\/saved\.test/);
  assert.equal(resolveRemote({ env: { ...env, PAGEHUB_API_KEY: "ph_env" }, baseUrl: "https://flag.test/" }).baseUrl, "https://flag.test");
  const bare = { PAGEHUB_CONFIG_DIR: tempDir(), PAGEHUB_API_KEY: "ph_x" } as NodeJS.ProcessEnv;
  assert.equal(resolveRemote({ env: bare }).baseUrl, "https://pagehub.dev");
});

test("login checks the key, saves it with mode 0600, and never prints it", async () => {
  const dir = tempDir();
  const env = { PAGEHUB_CONFIG_DIR: dir } as NodeJS.ProcessEnv;
  const out: string[] = [];
  const { impl } = fakeFetch(() => ({ status: 200, body: { sites: [{}, {}] } }));
  await login({ env, baseUrl: "https://x.test", readKey: async () => KEY, log: (l) => out.push(l), fetch: impl });
  assert.match(out.join("\n"), /Logged in to https:\/\/x\.test: the key works and sees 2 sites/);
  assert.ok(!out.join("\n").includes(KEY));
  const file = join(dir, "credentials.json");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readCredentials(env), { apiKey: KEY, baseUrl: "https://x.test" });
  assert.ok(clearCredentials(env));
  assert.ok(!existsSync(file));
});

test("login refuses a key that doesn't work or isn't a ph_ key, and saves nothing", async () => {
  const dir = tempDir();
  const env = { PAGEHUB_CONFIG_DIR: dir } as NodeJS.ProcessEnv;
  await assert.rejects(login({ env, baseUrl: "https://x.test", readKey: async () => "nope" }), /start with ph_/);
  await assert.rejects(login({ env, baseUrl: "https://x.test", readKey: async () => KEY, fetch: fakeFetch(() => ({ status: 401, body: {} })).impl }), /rejected/);
  assert.equal(readCredentials(env), null);
});

test("an API key is never sent over plain http to a remote host, and a saved key stays with its server", async () => {
  const env = { PAGEHUB_CONFIG_DIR: tempDir(), PAGEHUB_API_KEY: "ph_x" } as NodeJS.ProcessEnv;
  assert.throws(() => resolveRemote({ env, baseUrl: "http://evil.example" }), /Refusing to send an API key/);
  assert.throws(() => resolveRemote({ env: { ...env, PAGEHUB_API_BASE_URL: "ftp://x" } }), /Refusing/);
  assert.equal(resolveRemote({ env, baseUrl: "http://localhost:3000" }).baseUrl, "http://localhost:3000");
  assert.equal(resolveRemote({ env, baseUrl: "http://127.0.0.1:3000" }).baseUrl, "http://127.0.0.1:3000");
  await assert.rejects(login({ env, baseUrl: "http://evil.example", readKey: async () => KEY }), /Refusing to send an API key/);
});

test("a server-sent path outside the site layout is dropped from a listing and from a conflict, never reaching the disk or a printed command", async () => {
  const evil = ["../../.ssh/authorized_keys", "/etc/passwd", "pages/../../x.liquid", "pages/a; rm -rf ~.liquid", "x\ngit merge-file"];
  const { impl } = fakeFetch((m, url) =>
    m === "POST"
      ? { status: 409, body: { error: "version_conflict", conflicts: [...evil, "theme.css"].map((path) => ({ path, theirs: "t", version: "v" })) } }
      : { status: 200, body: { paths: [...evil, "theme.css"], versions: Object.fromEntries([...evil, "theme.css"].map((p) => [p, "v"])), version: 1 } },
  );
  const client = createClient({ baseUrl: "https://x.test", apiKey: KEY }, impl);
  const listing = await client.listFiles("s1");
  assert.deepEqual(listing.paths, ["theme.css"]);
  assert.deepEqual(Object.keys(listing.versions), ["theme.css"]);
  const saved = await client.saveBatch("s1", [{ path: "theme.css", text: "x" }], { "theme.css": "v" });
  assert.equal(saved.kind, "conflict");
  assert.deepEqual(saved.kind === "conflict" ? saved.conflicts.map((c) => c.path) : [], ["theme.css"]);
});
