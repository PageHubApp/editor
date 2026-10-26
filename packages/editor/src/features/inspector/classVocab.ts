/**
 * The add-class input's autocomplete vocabulary — the "known Tailwind classes" it suggests.
 *
 * The engine has no flat class list (its groups are regex matchers), so this module GENERATES the
 * candidate stems from the real Tailwind + spatial scales and then keeps only the ones the engine's
 * own class groups recognise (`groupTest`). A suggestion is therefore always a class the editor can
 * actually place and scope — never a fabricated token.
 *
 *   validatedVocab(groups)                         // cached, engine-known base classes
 *   suggestClasses(input, vocab, present)          // substring matches, responsive-aware
 */
import { BREAKPOINT_PREFIXES } from "./classScope";
import { groupTest, splitClass, type ClassGroup } from "@pagehub/engine";

const PALETTE = [
  "primary", "primary-content", "secondary", "secondary-content", "accent", "accent-content",
  "neutral", "neutral-content", "base-100", "base-200", "base-300", "base-content",
  "info", "info-content", "success", "success-content", "warning", "warning-content", "error", "error-content",
];
const SPACE = [
  "0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "10", "11", "12",
  "14", "16", "20", "24", "28", "32", "36", "40", "48", "56", "64", "px", "auto",
  "space-3xs", "space-2xs", "space-xs", "space-sm", "space-md", "space-lg", "space-xl", "space-2xl", "space-3xl", "space-4xl",
];
const FRACTIONS = ["1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "full", "screen", "min", "max", "fit", "auto"];
const SIZES = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"];

const SPACING_KEYS = ["p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr", "mb", "ml", "gap", "gap-x", "gap-y", "space-x", "space-y"];
const COLOR_KEYS = ["bg", "text", "border", "ring", "from", "via", "to", "fill", "stroke", "decoration", "outline", "divide"];

const STATIC = [
  // display / layout
  "block", "inline-block", "inline", "flex", "inline-flex", "grid", "inline-grid", "hidden", "contents", "table", "flow-root",
  "static", "fixed", "absolute", "relative", "sticky",
  "flex-row", "flex-row-reverse", "flex-col", "flex-col-reverse", "flex-wrap", "flex-nowrap", "flex-1", "flex-auto", "flex-none", "flex-initial",
  "justify-start", "justify-end", "justify-center", "justify-between", "justify-around", "justify-evenly", "justify-stretch",
  "items-start", "items-end", "items-center", "items-baseline", "items-stretch",
  "self-start", "self-end", "self-center", "self-stretch", "self-auto",
  "content-start", "content-center", "content-between", "content-around",
  "place-items-center", "place-content-center",
  "grow", "shrink", "grow-0", "shrink-0", "order-first", "order-last", "order-none",
  "isolate", "isolation-auto", "visible", "invisible",
  "overflow-auto", "overflow-hidden", "overflow-clip", "overflow-visible", "overflow-scroll",
  "overflow-x-auto", "overflow-x-hidden", "overflow-y-auto", "overflow-y-scroll",
  "box-border", "box-content", "float-left", "float-right", "float-none",
  "sr-only", "not-sr-only",
  // sizing keywords
  "w-full", "w-screen", "w-auto", "w-fit", "w-min", "w-max", "h-full", "h-screen", "h-auto", "h-fit",
  "min-h-screen", "min-h-full", "min-w-0", "min-w-full", "max-w-full", "max-w-none", "max-w-prose", "max-w-page", "max-w-screen-lg",
  "aspect-square", "aspect-video", "aspect-auto",
  // typography
  "text-left", "text-center", "text-right", "text-justify",
  "font-thin", "font-extralight", "font-light", "font-normal", "font-medium", "font-semibold", "font-bold", "font-extrabold", "font-black",
  "font-sans", "font-serif", "font-mono", "font-heading", "font-body", "font-accent",
  "italic", "not-italic", "antialiased", "uppercase", "lowercase", "capitalize", "normal-case",
  "underline", "overline", "line-through", "no-underline",
  "truncate", "text-ellipsis", "text-clip", "text-wrap", "text-nowrap", "text-balance", "text-pretty",
  "whitespace-normal", "whitespace-nowrap", "whitespace-pre", "whitespace-pre-line", "whitespace-pre-wrap",
  "leading-none", "leading-tight", "leading-snug", "leading-normal", "leading-relaxed", "leading-loose",
  "tracking-tighter", "tracking-tight", "tracking-normal", "tracking-wide", "tracking-wider", "tracking-widest",
  "list-none", "list-disc", "list-decimal", "list-inside", "list-outside",
  "align-middle", "align-top", "align-bottom", "align-baseline",
  // backgrounds
  "bg-none", "bg-cover", "bg-contain", "bg-center", "bg-top", "bg-bottom", "bg-left", "bg-right",
  "bg-no-repeat", "bg-repeat", "bg-fixed", "bg-local", "bg-scroll", "bg-clip-text", "bg-clip-border",
  // borders / effects
  "border", "border-0", "border-2", "border-4", "border-8", "border-solid", "border-dashed", "border-dotted", "border-double", "border-none",
  "rounded", "rounded-none", "rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-full", "rounded-box",
  "shadow", "shadow-none", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl", "shadow-inner",
  "ring", "ring-0", "ring-1", "ring-2", "ring-4", "ring-inset",
  "outline", "outline-none", "outline-dashed", "outline-dotted",
  // object / position
  "object-contain", "object-cover", "object-fill", "object-none", "object-scale-down",
  "object-center", "object-top", "object-bottom",
  // transforms / transitions
  "transform", "transform-gpu", "transition", "transition-all", "transition-colors", "transition-opacity", "transition-transform", "transition-none",
  "duration-75", "duration-100", "duration-150", "duration-200", "duration-300", "duration-500", "duration-700", "duration-1000",
  "ease-linear", "ease-in", "ease-out", "ease-in-out", "delay-75", "delay-150", "delay-300",
  "scale-95", "scale-100", "scale-105", "scale-110", "rotate-45", "rotate-90", "rotate-180",
  "animate-none", "animate-spin", "animate-pulse", "will-change-transform",
  // interaction
  "cursor-pointer", "cursor-default", "cursor-not-allowed", "cursor-grab", "cursor-text", "cursor-move", "cursor-wait",
  "pointer-events-none", "pointer-events-auto", "select-none", "select-text", "resize", "resize-none", "appearance-none",
  "snap-x", "snap-y", "snap-start", "snap-center", "snap-mandatory",
];

/** Every raw candidate stem (no variant prefix), before engine validation. */
function generateCandidates(): string[] {
  const out = new Set<string>(STATIC);
  for (const k of SPACING_KEYS) for (const v of SPACE) out.add(`${k}-${v}`);
  for (const v of [...SPACE.filter((s) => s !== "auto"), ...FRACTIONS]) {
    out.add(`w-${v}`);
    out.add(`h-${v}`);
  }
  for (const v of SIZES) {
    out.add(`max-w-${v}`);
    out.add(`text-${v}`);
    out.add(`rounded-${v}`);
  }
  out.add("text-xs");
  out.add("text-base");
  out.add("text-8xl");
  out.add("text-9xl");
  for (const k of COLOR_KEYS) for (const c of PALETTE) out.add(`${k}-${c}`);
  for (let z = 0; z <= 50; z += 10) out.add(`z-${z}`);
  out.add("z-auto");
  for (let o = 0; o <= 100; o += 5) out.add(`opacity-${o}`);
  for (let c = 1; c <= 6; c++) out.add(`grid-cols-${c}`);
  for (let c = 1; c <= 6; c++) out.add(`col-span-${c}`);
  return [...out];
}

const CANDIDATES = generateCandidates();

let cacheGroups: ReadonlyMap<string, ClassGroup> | null = null;
let cacheVocab: string[] = [];

/** Candidate classes the engine's own groups recognise, cached by the groups map identity. */
export function validatedVocab(groups: ReadonlyMap<string, ClassGroup>): string[] {
  if (groups === cacheGroups) return cacheVocab;
  const tests = [...groups.values()].map(groupTest);
  cacheVocab = CANDIDATES.filter((c) => tests.some((t) => t(c)));
  cacheGroups = groups;
  return cacheVocab;
}

/**
 * Up to `limit` matches for `input`: a breakpoint-prefixed query
 * matches bases and re-prefixes; a bare query returns base matches plus a few responsive variants.
 * Classes already on the element (`present`) are dropped.
 */
export function suggestClasses(input: string, vocab: readonly string[], present: readonly string[], limit = 8): string[] {
  if (input.length < 2) return [];
  const bp = BREAKPOINT_PREFIXES.find((p) => input.startsWith(p));
  let results: string[];
  if (bp) {
    const after = input.slice(bp.length);
    results = after ? vocab.filter((c) => c.includes(after)).map((c) => `${bp}${c}`) : [];
  } else {
    const base = vocab.filter((c) => c.includes(input));
    const responsive = base.slice(0, 4).flatMap((c) => BREAKPOINT_PREFIXES.map((p) => `${p}${c}`));
    results = [...base, ...responsive];
  }
  const seen = new Set(present);
  return results.filter((c) => !seen.has(c)).slice(0, limit);
}
