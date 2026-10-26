// Image src in the converter's forms reads as a media reference and writes back the same form.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundSrc, mediaSrc, parseMediaSrc } from "../src/features/media/mediaRef.ts";

describe("media src", () => {
  it("reads the converter's forms", () => {
    assert.deepEqual(parseMediaSrc("{{ '08d10d2c-26e6-4246-12b5-7c7786d81600' | image_url }}"), { kind: "media", id: "08d10d2c-26e6-4246-12b5-7c7786d81600", args: "" });
    assert.deepEqual(parseMediaSrc("{{ 'abc' | image_url: width: 800 }}"), { kind: "media", id: "abc", args: ": width: 800" });
    assert.deepEqual(parseMediaSrc("{{ item.images.1 | image_url }}"), { kind: "bound", path: "item.images.1", args: "" });
    assert.deepEqual(parseMediaSrc("{{ company.logo }}"), { kind: "bound", path: "company.logo", args: "" });
    assert.deepEqual(parseMediaSrc("https://x.test/a.png"), { kind: "url", url: "https://x.test/a.png" });
    assert.equal(parseMediaSrc("{{ item.image | default: x }}").kind, "expression");
    assert.equal(parseMediaSrc("").kind, "empty");
  });

  it("writes them back, keeping filter arguments", () => {
    assert.equal(mediaSrc("abc"), "{{ 'abc' | image_url }}");
    assert.equal(mediaSrc("abc", ": width: 800"), "{{ 'abc' | image_url: width: 800 }}");
    assert.equal(boundSrc("item.image"), "{{ item.image | image_url }}");
    const src = "{{ 'abc' | image_url: width: 800 }}";
    const r = parseMediaSrc(src);
    assert.equal(r.kind === "media" && mediaSrc(r.id, r.args), src);
  });
});
