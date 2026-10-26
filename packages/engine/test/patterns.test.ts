import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TAILWIND_GROUPS } from "../src/kits/tailwind/groups.ts";
import { PATTERNS } from "../src/kits/tailwind/patterns/patternData.ts";
import { patternCss, patternFromClasses } from "../src/kits/tailwind/patterns/patternCss.ts";
import { PATTERN_SLUGS } from "../src/kits/tailwind/patterns/patternSlugs.ts";
import { patternSvg, toSvgColor, type PatternDef } from "../src/kits/tailwind/patterns/patternSvg.ts";

/** Verbatim logic of the reference `generatePattern` (pattern library port), dead branches kept. */
function pagehubReference(pattern: PatternDef, root: Record<string, any>): string {
  const { vHeight, mode, path, width, height, colors: maxColors } = pattern;
  const join: number = 1; // the reference compares it with 2 (dead branch kept)
  const stroke = root.patternStroke || 1;
  const moveLeft = root.patternHorizontalPosition || 0;
  const moveTop = root.patternVerticalPosition || 0;
  const scale = root.patternZoom || 1;
  const angle = root.patternAngle || 0;
  const co = ["transparent", "transparent", ...[...Array(maxColors - 1).keys()].map((i) => (root[`patternColor${i + 1}`] ? toSvgColor(root[`patternColor${i + 1}`]) : undefined)).filter((c) => c)];
  const spacing: [number, number] = [+root.patternSpacingX || 0, +root.patternSpacingY || 0];
  const colorCounts = maxColors;
  const multiStroke = (i: number) => {
    let defColor = co[i + 1];
    if (vHeight === 0 && maxColors > 2) {
      if (colorCounts === 3 && maxColors === 4 && i === 2) defColor = co[1];
      else if (colorCounts === 4 && maxColors === 5 && i === 3) defColor = co[1];
      else if (colorCounts === 3 && maxColors === 5 && i === 3) defColor = co[1];
      else if (colorCounts === 3 && maxColors === 5 && i === 2) defColor = co[1];
      else if (colorCounts === 2) defColor = co[1];
    }
    let strokeFill = "", joinMode = "";
    if (mode === "stroke-join") { strokeFill = ` stroke='${defColor}' fill='none'`; joinMode = join === 2 ? "stroke-linejoin='round' stroke-linecap='round' " : "stroke-linecap='square' "; }
    else if (mode === "stroke") strokeFill = ` stroke='${defColor}' fill='none'`;
    else strokeFill = ` stroke='none' fill='${defColor || "white"}'`;
    return path.split("~")[i]!.replace("/>", ` transform='translate(${spacing[0] / 2},0)' ${joinMode}stroke-width='${stroke}'${strokeFill}/>`).replace("transform='translate(0,0)' ", " ");
  };
  let g = "";
  const count = vHeight === 0 && maxColors > 2 ? maxColors - 1 : colorCounts - 1;
  for (let i = 0; i < count; i++) g += multiStroke(i);
  const svg = "<svg id='patternId' width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'><defs>" +
    `<pattern id='a' patternUnits='userSpaceOnUse' width='${width + spacing[0]}' height='${height - vHeight * (maxColors - colorCounts) + spacing[1]}' patternTransform='scale(${scale}) rotate(${angle})'><rect x='0' y='0' width='100%' height='100%' fill='${co[0] || "white"}'/>${g}</pattern></defs><rect width='800%' height='800%' transform='translate(${scale * moveLeft},${scale * moveTop})' fill='url(#a)'/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const root = { patternColor1: "rgba(10,20,30,1)", patternColor2: "rgba(200,100,50,0.5)", patternColor3: "rgba(0,255,0,1)", patternColor4: "rgba(1,2,3,0.25)", patternStroke: 3, patternZoom: 1.5, patternAngle: 30, patternSpacingX: 4, patternSpacingY: 6, patternHorizontalPosition: 10, patternVerticalPosition: -5 };
const params = { colors: [root.patternColor1, root.patternColor2, root.patternColor3, root.patternColor4], stroke: 3, zoom: 1.5, angle: 30, spacingX: 4, spacingY: 6, x: 10, y: -5 };
const firstOf = (mode: string) => PATTERNS.find((p) => p.mode === mode && p.colors === 3)!;

describe("pattern library", () => {
  it("slugs file matches the data and slugs are unique", () => {
    assert.deepEqual(PATTERN_SLUGS, PATTERNS.map((p) => p.slug));
    assert.equal(new Set(PATTERN_SLUGS).size, PATTERNS.length);
    assert.equal(PATTERNS.length, 248);
  });
  for (const mode of ["stroke", "fill", "stroke-join"]) {
    it(`${mode}: same SVG as PageHub`, () => {
      const p = firstOf(mode);
      assert.equal(patternSvg(p, params), pagehubReference(p, root));
    });
  }
  it("every pattern matches PageHub across layer counts", () => {
    for (const p of PATTERNS) assert.equal(patternSvg(p, params), pagehubReference(p, root), p.slug);
  });
  it("a missing colour paints nothing (PageHub writes the string 'undefined', which paints nothing too)", () => {
    const p = firstOf("fill");
    assert.equal(patternSvg(p, { colors: [root.patternColor1] }), pagehubReference(p, { patternColor1: root.patternColor1 }));
    assert.ok(atob(patternSvg(firstOf("stroke"), {}).split(",")[1]!).includes("stroke='none'"));
  });
  it("rgba becomes hsla like PageHub; unsafe colours are dropped", () => {
    assert.equal(toSvgColor("rgba(255,0,0,1)"), "hsla(0,100%,50%,1)");
    assert.ok(!atob(patternSvg(firstOf("fill"), { colors: ["red' onload='x"] }).split(",")[1]!).includes("onload"));
  });
});

describe("patternCss", () => {
  const slug = firstOf("stroke").slug;
  it("emits one rule per used combination, keyed by the exact class tokens", () => {
    const a = [`ph-pattern-${slug}`, "[--pattern-stroke:2px]", "[--pattern-color-1:rgba(0,0,0,1)]", "p-4"];
    const css = patternCss([a, [...a], [`ph-pattern-${slug}`]]);
    assert.equal(css.split("\n").length, 2);
    assert.ok(css.includes(`[class~="ph-pattern-${slug}"][class~="[--pattern-stroke:2px]"]`));
    assert.ok(css.includes('background-image:url("data:image/svg+xml;base64,'));
    const p = patternFromClasses(a)!;
    assert.equal(p.params.stroke, 2);
    assert.deepEqual(p.params.colors, ["rgba(0,0,0,1)"]);
  });
  it("no pattern, no CSS; unknown slug ignored", () => {
    assert.equal(patternCss([["p-4"], ["ph-pattern-bogus"]]), "");
  });
});

describe("narrowed kit groups", () => {
  const match = (t: string) => TAILWIND_GROUPS.find((g) => g.match?.(t))?.id;
  it("accepts real names and rejects unknown ones", () => {
    assert.equal(match(`ph-pattern-${PATTERN_SLUGS[0]}`), "bg-pattern");
    assert.equal(match("ph-loop-spin"), "animation-loop");
    assert.equal(match("ph-mod-lift"), "modifier-presets");
    assert.equal(match("[--pattern-color-3:rgba(0,0,0,1)]"), "pattern-color-3");
    for (const t of ["ph-pattern-dots", "ph-loop-nope", "ph-mod-nope"]) assert.equal(match(t), undefined, t);
  });
});
