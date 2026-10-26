import { test } from "node:test";
import assert from "node:assert/strict";
import { t, SchemaError } from "../src/schema/t.ts";

test("schema: number from \"6\", int and range checks", () => {
  assert.equal(t.number().parse("6"), 6);
  assert.equal(t.number().parse("-118.24", "arg"), -118.24);
  assert.throws(() => t.number().parse("six"), SchemaError);
  assert.throws(() => t.int().parse("1.5"), /integer/);
  assert.throws(() => t.number().min(-90).max(90).parse("91"), /≤ 90/);
  assert.equal(t.number().int().parse("14"), 14);
});

test("schema: enum rejects unknown values", () => {
  const tiles = t.enum(["osm", "dark"]);
  assert.equal(tiles.parse("osm"), "osm");
  assert.throws(() => tiles.parse("satellite"), /one of "osm", "dark"/);
  assert.equal(tiles.check("x").ok, false);
});

test("schema: default applied when the source is missing; optional passes; required fails", () => {
  assert.equal(t.int().default(14).parse(undefined), 14);
  assert.equal(t.int().default(14).check(undefined).ok && t.int().default(14).validate(undefined), 14);
  assert.equal(t.string().optional().parse(undefined), undefined);
  assert.throws(() => t.string().parse(undefined), /required/);
  assert.throws(() => t.int().default(1.5 as number), /bad default/);
});

test("schema: strings serialize with liquidString rules for tag arguments, raw for attributes", () => {
  const s = t.string();
  assert.equal(s.serialize("Book now", "arg"), `"Book now"`);
  assert.equal(s.serialize(`say "hi"`, "arg"), `'say "hi"'`);
  assert.throws(() => s.serialize(`it's "x"`, "arg"), /both/);
  assert.equal(s.serialize("Book now", "attr"), "Book now");
  assert.equal(s.parse(`"Book now"`, "arg"), "Book now");
  assert.equal(s.parse(`'x'`, "arg"), "x");
  assert.throws(() => s.parse("product.title", "arg"), /string literal/);
  assert.equal(t.boolean().parse("", "attr"), true);
  assert.equal(t.boolean().serialize(false, "arg"), "false");
  assert.equal(t.number().serialize(6), "6");
});

test("schema: arrays, objects and Liquid hashes", () => {
  assert.deepEqual(t.array(t.int()).parse("[1,2]"), [1, 2]);
  assert.throws(() => t.array(t.int()).parse("[1,2]", "arg"), /Liquid arguments/);
  assert.deepEqual(t.object({ a: t.string(), b: t.int().optional() }).check({ a: "x" }), { ok: true, value: { a: "x" } });
  assert.equal(t.object({ a: t.string() }).check({ a: "x", z: 1 }).ok, false);
  const h = t.hash({ width: t.int(), crop: t.enum(["center", "top"]).optional() });
  assert.deepEqual(h.parse(`width: 800, crop: "top"`), { width: 800, crop: "top" });
  assert.equal(h.serialize({ width: 400, crop: "center" }), `width: 400, crop: "center"`);
  assert.equal(t.handle().check({ path: "a", alive: true }).ok, true);
  assert.equal(t.handle().check("x").ok, false);
});

test("schema: JSON Schema snapshot", () => {
  const props = t.object({
    lat: t.number().min(-90).max(90).describe("Latitude"),
    zoom: t.int().default(14),
    tiles: t.enum(["osm"]).default("osm"),
    label: t.string().optional(),
    tags: t.array(t.string()).max(5),
    live: t.boolean(),
    at: t.handle(),
  });
  assert.deepEqual(props.toJSONSchema(), {
    type: "object",
    properties: {
      lat: { type: "number", minimum: -90, maximum: 90, description: "Latitude" },
      zoom: { type: "integer", default: 14 },
      tiles: { type: "string", enum: ["osm"], default: "osm" },
      label: { type: "string" },
      tags: { type: "array", items: { type: "string" }, maxItems: 5 },
      live: { type: "boolean" },
      at: { type: "object", "x-handle": true },
    },
    required: ["lat", "tags", "live", "at"],
    additionalProperties: false,
  });
});
