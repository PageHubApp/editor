import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestEditor } from "../src/testing/index.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";
import { liquidKit } from "../src/kits/liquid/liquidKit.ts";
import { tailwindKit } from "../src/kits/tailwind/tailwindKit.ts";
import { TAILWIND_GROUPS } from "../src/kits/tailwind/groups.ts";
import { classOverrides, readClass, scopePrefix, setClasses, type Scope } from "../src/kits/tailwind/classModel.ts";

const g = (id: string) => TAILWIND_GROUPS.find((x) => x.id === id)!;
const P = "p.html";

test("tailwind: classes.set writes per view × dark (propSystem prefixes), replacing only that scope's token", () => {
  const base = ["flex", "p-2", "md:p-6", "dark:p-1", "text-lg"];
  const table: Array<[Scope, string]> = [
    [{}, "flex p-4 md:p-6 dark:p-1 text-lg"],
    [{ breakpoint: "md" }, "flex p-2 md:p-4 dark:p-1 text-lg"],
    [{ dark: true }, "flex p-2 md:p-6 dark:p-4 text-lg"],
    [{ breakpoint: "md", dark: true }, "flex p-2 md:p-6 dark:p-1 text-lg md:dark:p-4"],
    [{ breakpoint: "sm" }, "flex p-2 md:p-6 dark:p-1 text-lg sm:p-4"],
    [{ breakpoint: "2xl", dark: true }, "flex p-2 md:p-6 dark:p-1 text-lg 2xl:dark:p-4"],
    [{ state: "hover" }, "flex p-2 md:p-6 dark:p-1 text-lg hover:p-4"],
  ];
  for (const [scope, out] of table) assert.equal(setClasses(base, g("p"), "p-4", [scope]).join(" "), out, scopePrefix(scope));
  assert.equal(setClasses(base, g("p"), null, [{}, { breakpoint: "md" }]).join(" "), "flex dark:p-1 text-lg");
  assert.equal(setClasses(["px-2", "p-1"], g("px"), "px-4").join(" "), "px-4 p-1", "px and p are separate groups");
  assert.equal(setClasses(["text-lg", "text-primary", "text-center"], g("text-color"), "text-base-content").join(" "), "text-lg text-base-content text-center");
});

test("tailwind: reads follow the editor's view fallbacks", () => {
  const c = ["p-2", "md:p-6", "dark:p-1", "lg:dark:p-8"];
  assert.deepEqual(readClass(c, g("p"), { view: "mobile" }), { value: "p-2", view: "mobile" });
  assert.deepEqual(readClass(c, g("p"), { view: "md" }), { value: "p-6", view: "md" });
  assert.deepEqual(readClass(c, g("p"), { view: "sm" }), { value: "p-2", view: "mobile" }, "breakpoints fall back to mobile");
  assert.deepEqual(readClass(c, g("p"), { view: "mobile", dark: true }), { value: "p-1", view: "mobile" });
  assert.deepEqual(readClass(c, g("p"), { view: "md", dark: true }), { value: "p-6", view: "md" }, "dark falls back to light");
  assert.deepEqual(readClass(c, g("p"), { view: "lg", dark: true }), { value: "p-8", view: "lg" });
  assert.deepEqual(readClass(["md:p-6"], g("p"), { view: "mobile" }), { value: "p-6", view: "md" }, "mobile falls back to the desktop layer");
  assert.deepEqual(readClass(["lg:p-3"], g("p"), { view: "desktop" }), { value: "p-3", view: "lg" }, "the full canvas scans every layer");
  assert.deepEqual(classOverrides(c, g("p")), [{ prefix: "md:", token: "p-6" }, { prefix: "dark:", token: "p-1" }, { prefix: "lg:dark:", token: "p-8" }]);
});

test("tailwind: classes.set is a command over the selection — minimal edit, multi-scope, undoable", () => {
  const src = `<div>\n  <p class="text-lg p-2">A</p>\n  <p>B</p>\n</div>\n`;
  const e = createTestEditor({ files: { [P]: src }, extensions: [htmlKit(), liquidKit(), tailwindKit()] });
  e.select(e.find(P, "p"));
  assert.ok(e.run("classes.set", { group: "p", token: "p-4", scopes: [{}, { breakpoint: "md" }] }));
  assert.equal(e.text(), `<div>\n  <p class="text-lg p-4 md:p-4">A</p>\n  <p class="p-4 md:p-4">B</p>\n</div>\n`);
  assert.equal(e.can("classes.set", { group: "p", token: "p-4", scopes: [{}, { breakpoint: "md" }] }), false, "no change → can't run");
  assert.equal(e.can("classes.set", { group: "p", token: "text-lg" }), false, "token outside the group");
  assert.equal(e.can("classes.set", { group: "nope", token: "x" }), false);
  assert.ok(e.undo());
  assert.equal(e.text(), src);
  const l = createTestEditor({ files: { [P]: `<p class="a {{ x }}">A</p>` }, extensions: [htmlKit(), tailwindKit()] });
  l.select(l.get("p"));
  assert.equal(l.can("classes.set", { group: "p", token: "p-1" }), false, "Liquid in class is edited as source");
});
