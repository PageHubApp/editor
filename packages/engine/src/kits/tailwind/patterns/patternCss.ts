/**
 * Publish-time CSS for the patterns a page uses. An element carries `ph-pattern-<slug>` plus
 * `[--pattern-<name>:<value>]` classes; the SVG bakes those values in (a data-URI background cannot
 * read custom properties), so each distinct class combination gets one rule, selected by the exact
 * class tokens. A page with no pattern gets no CSS; a page with one gets one rule per combination.
 */
import { PATTERNS } from "./patternData";
import { PATTERN_CLASS_PREFIX, PATTERN_COLOR_VARS, PATTERN_NUMBER_VARS } from "./patternVars";
import { patternSvg, type PatternDef, type PatternParams } from "./patternSvg";

const BY_SLUG = new Map<string, PatternDef>(PATTERNS.map((p) => [p.slug, p]));
const VAR_TOKEN = /^\[--pattern-([a-z0-9-]+):([^\]]+)\]$/;
const NUMBER_KEY: Record<(typeof PATTERN_NUMBER_VARS)[number], keyof PatternParams> = {
  angle: "angle", "spacing-x": "spacingX", "spacing-y": "spacingY", stroke: "stroke", zoom: "zoom", x: "x", y: "y",
};

/** The pattern def and parameters a class list asks for, or null when it names no known pattern. */
export function patternFromClasses(classes: readonly string[]): { def: PatternDef; params: PatternParams; tokens: string[] } | null {
  const name = classes.find((c) => c.startsWith(PATTERN_CLASS_PREFIX));
  const def = name && BY_SLUG.get(name.slice(PATTERN_CLASS_PREFIX.length));
  if (!def || !name) return null;
  const params: PatternParams = { colors: [] };
  const tokens = [name];
  for (const c of classes) {
    const m = VAR_TOKEN.exec(c);
    if (!m) continue;
    const value = m[2]!.replaceAll("_", " ");
    const color = PATTERN_COLOR_VARS.indexOf(m[1] as (typeof PATTERN_COLOR_VARS)[number]);
    if (color >= 0) params.colors![color] = value;
    else if (m[1]! in NUMBER_KEY) {
      const n = parseFloat(value);
      if (Number.isFinite(n)) (params as Record<string, number>)[NUMBER_KEY[m[1] as keyof typeof NUMBER_KEY]] = n;
    } else continue;
    tokens.push(c);
  }
  return { def, params, tokens };
}

const attr = (t: string) => `[class~="${t.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`;

/** CSS for every pattern used by `classLists` (one class array per element); "" when none. */
export function patternCss(classLists: Iterable<readonly string[]>): string {
  const rules = new Map<string, string>();
  for (const classes of classLists) {
    const p = patternFromClasses(classes);
    if (!p) continue;
    const selector = p.tokens.map(attr).join("");
    if (!rules.has(selector)) rules.set(selector, `${selector}{background-image:url("${patternSvg(p.def, p.params)}")}`);
  }
  return [...rules.values()].join("\n");
}
