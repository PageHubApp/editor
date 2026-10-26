import { test } from "node:test";
import assert from "node:assert/strict";
import { PROPERTY_MAP } from "../../editor/src/property-map/propertyMap.ts";
import { TAILWIND_GROUPS } from "../src/kits/tailwind/groups.ts";
import { CLASS_CONFLICTS } from "../src/kits/tailwind/conflicts.ts";
import { setClasses } from "../src/kits/tailwind/classModel.ts";
import { cls, groupTest, splitClass } from "../src/elements/bindings.ts";
import { t, SchemaError } from "../src/schema/t.ts";

const byId = new Map(TAILWIND_GROUPS.map((g) => [g.id, g]));
const g = (id: string) => byId.get(id)!;
const groupsOf = (token: string) => TAILWIND_GROUPS.filter((x) => groupTest(x)(token)).map((x) => x.id);

test("tailwind groups: ids are unique and every property-map group exists", () => {
  assert.equal(byId.size, TAILWIND_GROUPS.length, "duplicate group id");
  const wanted = new Set<string>();
  for (const e of PROPERTY_MAP) {
    if (e.group) wanted.add(e.group);
    for (const m of e.binding.matchAll(/cls\("([^"]+)"/g)) wanted.add(m[1]!);
  }
  assert.deepEqual([...wanted].filter((id) => !byId.has(id)), []);
  for (const e of PROPERTY_MAP) if (e.group) assert.equal(e.newGroup === true, !EXISTING.has(e.group), e.key);
});
const EXISTING = new Set(["display", "position", "flex-direction", "justify-content", "align-items", "grid-cols", "gap", "p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr", "mb", "ml", "width", "height", "max-width", "text-size", "text-align", "text-color", "font-weight", "bg-color", "rounded", "shadow", "opacity", "z-index", "border-width", "border-color"]);

test("tailwind groups: conflicts only name real groups", () => {
  for (const [id, list] of Object.entries(CLASS_CONFLICTS)) for (const other of [id, ...list]) assert.ok(byId.has(other), `${id} -> ${other}`);
});

test("tailwind groups: tokens land in exactly their group (spatial, palette, arbitrary values)", () => {
  const table: Array<[string, string]> = [
    ["py-space-lg", "py"], ["-mt-[3px]", "mt"], ["gap-x-space-sm", "gap-x"], ["gap-space-md", "gap"], ["p-(--pad)", "p"],
    ["bg-primary", "bg-color"], ["bg-base-200/50", "bg-color"], ["bg-[#fff]", "bg-color"], ["bg-[url(https://a.b/c.png)]", "bg-image"],
    ["bg-cover", "bg-size"], ["bg-center", "bg-position"], ["bg-no-repeat", "bg-repeat"], ["bg-fixed", "bg-attachment"], ["bg-clip-text", "bg-clip"],
    ["bg-linear-to-b", "bg-gradient"], ["from-primary/90", "gradient-from"], ["via-base-100", "gradient-via"], ["to-[#000]", "gradient-to"],
    ["text-primary-content", "text-color"], ["text-lg", "text-size"], ["text-balance", "text-wrap"], ["uppercase", "text-transform"], ["truncate", "text-overflow"],
    ["border-base-300", "border-color"], ["border-dashed", "border-style"], ["border-t", ""], ["ring-2", "ring-width"], ["ring-primary", "ring-color"], ["ring-offset-2", "ring-offset-width"],
    ["outline-2", "outline-width"], ["outline-primary", "outline-color"], ["decoration-wavy", "decoration-style"], ["decoration-2", "decoration-thickness"], ["decoration-accent", "decoration-color"],
    ["shadow-lg", "shadow"], ["shadow-primary/30", "shadow-color"], ["divide-x-2", "divide-width"], ["divide-base-300", "divide-color"],
    ["backdrop-blur-md", "backdrop-blur"], ["blur-sm", "blur"], ["-hue-rotate-15", "hue-rotate"], ["backdrop-opacity-50", "backdrop-opacity"], ["grayscale", "grayscale"],
    ["max-h-screen", "max-height"], ["min-w-0", "min-width"], ["size-space-lg", "size"], ["aspect-video", "aspect"], ["basis-1/3", "basis"], ["flex-1", "flex"], ["flex-col", "flex-direction"],
    ["-translate-y-1/2", "translate-y"], ["rotate-45", "rotate"], ["scale-x-110", "scale-x"], ["scale-105", "scale"], ["-skew-y-3", "skew-y"], ["origin-top-left", "origin"],
    ["inset-0", "inset"], ["inset-x-4", "inset-x"], ["top-1/2", "top"], ["left-space-md", "left"], ["overflow-hidden", "overflow"], ["overflow-x-clip", "overflow-x"],
    ["duration-300", "duration"], ["delay-150", "delay"], ["ease-in-out", "ease"], ["transition-colors", "transition"], ["animate-spin", "animate"], ["animate-fade-up", "animate"],
    ["[animation-timeline:view()]", "animation-timeline"], ["[animation-range:entry_0%_cover_40%]", "animation-range"], ["[--pattern-angle:45deg]", "pattern-angle"], ["[--marquee-speed:30s]", "marquee-speed"],
    ["ph-pattern-african-1", "bg-pattern"], ["[--pattern-color-2:rgba(0,0,0,1)]", "pattern-color-2"], ["ph-marquee", "animation-loop"], ["ph-marquee-reverse", "marquee-direction"], ["ph-mod-lift", "modifier-presets"],
    ["snap-x", "snap-type"], ["snap-start", "snap-align"], ["scroll-mt-4", "scroll-mt"], ["space-y-space-sm", "space-y"], ["cursor-pointer", "cursor"], ["font-heading", "font-family"],
    ["leading-tight", "leading"], ["tracking-wide", "tracking"], ["object-cover", "object-fit"], ["object-left-top", "object-position"], ["mix-blend-multiply", "mix-blend"],
    ["fill-current", "fill"], ["stroke-primary", "stroke"], ["stroke-2", "stroke-width"], ["select-none", "select"], ["sr-only", "sr-only"], ["order-first", "order"], ["col-span-2", "col-span"], ["columns-3", "columns"],
    ["place-items-center", "place-items"], ["self-end", "align-self"], ["list-disc", "list-style-type"], ["list-inside", "list-style-position"], ["align-middle", "align"],
  ];
  for (const [token, id] of table) {
    const hit = groupsOf(token).filter((x) => !["decoration", "snap", "outline"].includes(x) && !(x === "outline-style" && id === "outline-style"));
    assert.deepEqual(hit, id ? [id] : [], token);
  }
});

test("class parser: variants split outside brackets, so arbitrary values keep their colons", () => {
  assert.deepEqual(splitClass("md:dark:hover:p-4"), ["md:dark:hover:", "p-4"]);
  assert.deepEqual(splitClass("md:[--x:1px]"), ["md:", "[--x:1px]"]);
  assert.deepEqual(splitClass("bg-[url(https://a.b/c.png)]"), ["", "bg-[url(https://a.b/c.png)]"]);
  assert.deepEqual(splitClass("[animation-range:entry_0%_cover_40%]"), ["", "[animation-range:entry_0%_cover_40%]"]);
  const cl = ["[animation-range:a_0%]", "md:[animation-range:b_0%]"];
  assert.equal(setClasses(cl, g("animation-range"), "[animation-range:c_0%]").join(" "), "[animation-range:c_0%] md:[animation-range:b_0%]");
  assert.equal(cls(g("animation-range")).name, "animation-range");
});

test("conflicts: p replaces px/py/sides, px keeps p and overrides its axis only", () => {
  assert.equal(setClasses(["px-2", "py-1", "pt-3", "mt-1"], g("p"), "p-4").join(" "), "mt-1 p-4");
  assert.equal(setClasses(["p-4", "pl-1"], g("px"), "px-2").join(" "), "p-4 px-2", "px drops pl, keeps p");
  assert.equal(setClasses(["p-4", "pt-1"], g("py"), "py-2").join(" "), "p-4 py-2");
  assert.equal(setClasses(["p-4", "px-2"], g("p"), null).join(" "), "px-2", "removing never displaces others");
  assert.equal(setClasses(["px-2", "md:px-3"], g("p"), "p-4").join(" "), "md:px-3 p-4", "only the written scope");
  assert.equal(setClasses(["px-2", "md:px-3"], g("p"), "p-4", [{}, { breakpoint: "md" }]).join(" "), "p-4 md:p-4");
  assert.equal(setClasses(["w-4", "h-4"], g("size"), "size-8").join(" "), "size-8");
  assert.equal(setClasses(["text-sm", "leading-6"], g("text-size"), "text-lg").join(" "), "text-lg");
  assert.equal(setClasses(["gap-x-2", "gap-y-1"], g("gap"), "gap-4").join(" "), "gap-4");
  assert.equal(setClasses(["inset-x-2", "top-1", "left-1"], g("inset"), "inset-0").join(" "), "inset-0");
  assert.equal(setClasses(["mx-auto", "mr-2"], g("m"), "m-0").join(" "), "m-0");
});

test("t.tokens: space-separated subset of a fixed list", () => {
  const s = t.tokens(["dots", "arrows"]);
  assert.deepEqual(s.parse("dots arrows"), ["dots", "arrows"]);
  assert.deepEqual(s.parse(""), []);
  assert.deepEqual(s.parse("  dots   dots "), ["dots"]);
  assert.throws(() => s.parse("dots bogus"), SchemaError);
  assert.equal(s.serialize(["arrows", "dots"]), "arrows dots");
  assert.equal(s.serialize(["dots"], "arg"), '"dots"');
  assert.deepEqual(s.parse('"dots arrows"', "arg"), ["dots", "arrows"]);
  assert.equal(s.check("dots").ok, false);
  assert.deepEqual(s.toJSONSchema(), { type: "array", items: { type: "string", enum: ["dots", "arrows"] }, uniqueItems: true });
  assert.equal(s.optional().check(undefined).ok, true);
});

test("t.expression: an unquoted Liquid expression that can't leave its tag", () => {
  const s = t.expression();
  assert.equal(s.parse(" collections.blog ", "arg"), "collections.blog");
  assert.equal(s.parse("(1..5)", "arg"), "(1..5)");
  assert.equal(s.serialize("products", "arg"), "products");
  for (const bad of ["", "  ", "a %} b", "{{ x }}", "a\nb"]) assert.throws(() => s.parse(bad, "arg"), SchemaError, JSON.stringify(bad));
  assert.equal(s.check(5).ok, false);
  assert.equal(s.toJSONSchema()["x-liquid-expression"], true);
});
