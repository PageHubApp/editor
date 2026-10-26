// The canvas policy: the site's own scripts never run in an editor frame (docs/action-items/specs/site-js-allowed.md).
// The browser enforcement itself is checked in headless Chromium by `pnpm verify:canvas-isolation` (monorepo root).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canvasCsp, withCanvasPolicy } from "../src/features/canvas/frameDom.ts";

const RUNTIME = "https://app.test/api/editor/runtime.js";

describe("canvas CSP", () => {
  it("allows only the runtime and the pinned Leaflet build: no inline, no eval, no strict-dynamic", () => {
    const csp = canvasCsp(RUNTIME);
    assert.equal(csp, "script-src https://app.test/api/editor/runtime.js https://unpkg.com/leaflet@1.9.4/dist/leaflet.js; object-src 'none'; base-uri 'none'; form-action 'none'");
    for (const loose of ["'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'", "'unsafe-hashes'", "*", "'self'", "data:", "blob:"]) {
      assert.ok(!csp.split(/\s+/).includes(loose), `never ${loose}`);
    }
  });

  it("no runtime: no script at all; a query, a fragment, ';' and ',' never widen the source", () => {
    assert.match(canvasCsp(null), /^script-src 'none';/);
    assert.equal(canvasCsp("https://a.test/r.js?v=1;x,y#h").split(";")[0], "script-src https://a.test/r.js https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
    assert.match(canvasCsp("https://a.test/a;b,c.js"), /a%3Bb%2Cc\.js/);
  });

  it("the policy meta comes before every byte of the site's markup; a leading doctype stays first", () => {
    const page = `<!DOCTYPE html><html lang="en"><head><script>evil()</script></head><body onload="x()"></body></html>`;
    const out = withCanvasPolicy(page, RUNTIME);
    assert.ok(out.startsWith(`<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="script-src ${RUNTIME} `));
    assert.ok(out.indexOf("Content-Security-Policy") < out.indexOf("<script>"));
    assert.ok(out.endsWith(page.slice("<!DOCTYPE html>".length)), "the site's markup is untouched");
    const bare = withCanvasPolicy(`<script>evil()</script><p>hi</p>`, RUNTIME);
    assert.ok(bare.startsWith(`<meta http-equiv="Content-Security-Policy"`), "no doctype: the meta is the first thing written");
    const sneaky = withCanvasPolicy(`<!--><script>evil()</script>--><!doctype html>`, RUNTIME);
    assert.ok(sneaky.startsWith(`<meta http-equiv`), "only a doctype at the very start moves ahead of the meta");
  });
});
