import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname;
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.(ts|tsx)$/.test(n) ? [join(dir, n)] : []));

/** The editor never names a dev server's URL or a converter's file convention: the host supplies those through `canvasHost`. */
const HOST_ONLY = /__site\.css|__fonts|__runtime\.js|~view|location\.search|data\.json|icons\.json|imageBase/;

describe("the editor package is host-agnostic", () => {
  it("no dev-server URL, query-string read or site data file is hard-coded in src", () => {
    const hits = files(SRC).flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((line, i) => (HOST_ONLY.test(line) ? [`${f.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`] : [])));
    assert.deepEqual(hits, []);
  });

  it("the editor never calls fetch for the site: the canvas asks its host", () => {
    const hits = files(SRC).filter((f) => /\bfetch\(/.test(readFileSync(f, "utf8")));
    assert.deepEqual(hits.map((f) => f.slice(SRC.length + 1)), ["features/canvas/canvasContext.ts"], "only the font preload warm-up fetches (host-supplied hrefs)");
  });
});
