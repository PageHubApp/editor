import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import { buildRuntime } from "../scripts/build.mjs";

const gz = (p: string) => gzipSync(readFileSync(p), { level: 9 }).length;

describe("bundle budget", () => {
  // A scratch build: the published `dist` (and its `dist/lib`) must survive a test run.
  const out = mkdtempSync(join(tmpdir(), "ph-budget-"));
  before(async () => void (await buildRuntime(out)));
  after(() => rmSync(out, { recursive: true, force: true }));
  it("core is at most 5 KB gzip", () => {
    assert.ok(gz(out + "/runtime.js") <= 5 * 1024);
  });
  it("every chunk entry is at most 3 KB gzip (map excepted)", () => {
    for (const f of readdirSync(out + "/chunks").filter((f) => !f.startsWith("shared-") && f !== "map.js")) {
      assert.ok(gz(out + "/chunks/" + f) <= 3 * 1024, f);
    }
  });
  it("the map chunk stays at most 4 KB gzip (Leaflet itself loads from the CDN, never bundled)", () => {
    assert.ok(gz(out + "/chunks/map.js") <= 4 * 1024);
    assert.ok(!readFileSync(out + "/chunks/map.js", "utf8").includes("L.Map"));
  });
  it("every new lazy chunk is emitted, and within 3 KB gzip including the shared code it imports", () => {
    for (const name of ["fit-text", "scroll-effect", "overflow", "carousel", "state", "state-view", "state-compute", "chat", "on", "show"]) {
      const entry = readFileSync(out + `/chunks/${name}.js`, "utf8");
      let total = gz(out + `/chunks/${name}.js`);
      for (const m of entry.matchAll(/from"\.\/(shared-[\w-]+\.js)"/g)) total += gz(out + "/chunks/" + m[1]);
      assert.ok(total <= 3 * 1024, `${name} ${total}`);
    }
  });
  it("emits the animate stylesheet", () => {
    assert.ok(readFileSync(out + "/animate.css", "utf8").includes("html[data-animate-ready]"));
  });
});
