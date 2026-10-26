import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { TAILWIND_GROUPS } from "../../engine/src/kits/tailwind/groups.ts";
import { PH_LOOP_NAMES, PH_MOD_NAMES } from "../../engine/src/kits/tailwind/phClasses.ts";

const css = readFileSync(new URL("../src/kit.css", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
const selectors = new Set([...css.matchAll(/\.(ph-[a-z0-9-]+)/g)].map((m) => m[1]!));

/** Groups whose class names are `ph-*` kit classes (not Tailwind utilities). */
const PH_GROUPS = ["animation-loop", "marquee-direction", "modifier-presets"];
const group = (id: string) => TAILWIND_GROUPS.find((g) => g.id === id);

describe("kit CSS covers the ph-* classes the Tailwind groups emit", () => {
  it("ships in dist beside animate.css", () => assert.match(build, /src\/kit\.css/));
  it("defines kit selectors", () => assert.ok(selectors.size >= 20, `only ${selectors.size}`));
  for (const id of PH_GROUPS) {
    it(`group ${id} exists and matches only defined selectors`, () => {
      const g = group(id);
      assert.ok(g, `${id} missing from TAILWIND_GROUPS`);
      const phTokens = [...selectors].filter((t) => g.match!(t));
      assert.ok(phTokens.length > 0, `${id}: no kit selector falls in this group`);
    });
  }
  it("every kit selector (bar internal helpers) lands in a ph-* group, so the editor can set and clear it", () => {
    for (const t of selectors) assert.ok(PH_GROUPS.some((id) => group(id)?.match?.(t)), `${t} is in no ph-* group`);
  });
  it("the names the editor and property map document all have rules", () => {
    for (const t of ["ph-marquee", "ph-marquee-reverse", "ph-mod-lift"]) assert.ok(selectors.has(t), t);
  });
  it("loops, spotlights and hover looks ported from the SDK are all present", () => {
    const wanted = ["spin", "pulse", "wiggle", "chain-spotlight-1", "chain-spotlight-2", "chain-spotlight-3", "chain-label-1", "chain-label-2", "grid-spotlight-1", "grid-spotlight-2", "grid-spotlight-3", "grid-spotlight-4"].map((n) => "ph-loop-" + n);
    for (const t of [...wanted, "ph-mod-grow", "ph-mod-glow", "ph-mod-press"]) assert.ok(selectors.has(t), t);
  });
  it("the shared loop and modifier name lists equal what kit.css defines", () => {
    const names = (prefix: string) => [...selectors].filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length)).sort();
    assert.deepEqual(names("ph-loop-"), [...PH_LOOP_NAMES].sort());
    assert.deepEqual(names("ph-mod-"), [...PH_MOD_NAMES].sort());
  });
  it("unknown ph-* names are rejected by every ph-* group", () => {
    for (const t of ["ph-loop-bogus", "ph-mod-bogus", "ph-pattern-bogus", "ph-bogus"]) assert.ok(!TAILWIND_GROUPS.some((g) => g.match?.(t)), t);
  });
  it("every animation name a rule uses has keyframes", () => {
    const used = [...css.matchAll(/animation: (ph-[a-z0-9-]+)/g)].map((m) => m[1]);
    for (const n of used) assert.match(css, new RegExp(`@keyframes ${n}\\b`), n);
  });
});
