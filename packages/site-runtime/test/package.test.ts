import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { bundleInline } from "../src/bundle.mjs";
import { buildRuntime } from "../scripts/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(root + "package.json", "utf8"));
const out = mkdtempSync(tmpdir() + "/site-runtime-");
after(() => rmSync(out, { recursive: true, force: true }));

describe("build output and manifest", () => {
  let manifest: Awaited<ReturnType<typeof buildRuntime>>;
  let manifest2: typeof manifest;
  before(async () => {
    manifest = await buildRuntime(out);
    manifest2 = await buildRuntime(out);
  });
  it("lists every built file with its size and sha256, but not itself", () => {
    const walk = (d: string, p = ""): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + "/" + e.name, p + e.name + "/") : [p + e.name]));
    const onDisk = walk(out).filter((f) => f !== "manifest.json").sort();
    assert.deepEqual(manifest.files.map((f: { path: string }) => f.path), onDisk);
    for (const f of manifest.files) {
      const bytes = readFileSync(out + "/" + f.path);
      assert.equal(f.bytes, bytes.length);
      assert.equal(f.sha256, createHash("sha256").update(bytes).digest("hex"));
    }
    for (const must of ["runtime.js", "kit.css", "animate.css", "chunks/cart.js"]) assert.ok(onDisk.includes(must), must);
  });
  it("version is a content hash: a rebuild of the same source gives the same version", () => {
    assert.match(manifest.version, /^[0-9a-f]{12}$/);
    assert.equal(manifest2.version, manifest.version);
    assert.deepEqual(JSON.parse(readFileSync(out + "/manifest.json", "utf8")), manifest2);
  });
  it("manifest.json is written to disk", () => assert.ok(statSync(out + "/manifest.json").size > 0));
  it("the built core registers __siteRuntime", () => assert.ok(readFileSync(out + "/runtime.js", "utf8").includes("__siteRuntime")));
});

describe("package exports", () => {
  it("exposes ., head snippets, ./bundle and ./assets/*", () => {
    assert.deepEqual(Object.keys(pkg.exports).sort(), [".", "./assets/*", "./bundle", "./head/dismiss", "./head/theme"]);
    assert.equal(pkg.exports["./assets/*"], "./dist/*");
  });
  it("ships dist, src, the README and the licence", () => assert.deepEqual(pkg.files, ["dist", "src", "README.md", "LICENSE"]));
});

describe("bundleInline", () => {
  it("is one module that bundles every chunk and registers the global", async () => {
    const js = await bundleInline();
    assert.ok(js.includes("__siteRuntime"));
    for (const needle of ["cart:count", "data-carousel", "data-chat-send"]) assert.ok(js.includes(needle), needle);
  });
});

describe("neutral defaults", () => {
  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(d + e.name + "/") : [d + e.name]));
  it("no PageHub endpoint or Stripe path is hard-coded in src", () => {
    for (const f of files(root + "src/").filter((f) => /\.(ts|mjs)$/.test(f))) {
      const text = readFileSync(f, "utf8");
      assert.ok(!/storefront-checkout|pagehub\.dev|\/api\/stripe/.test(text), f); // names-check:allow
    }
  });
});
