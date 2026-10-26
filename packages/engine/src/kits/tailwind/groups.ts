/** Class-group definitions the tailwind kit ships (a plugin adds its own through `classGroupsFacet`). */
import type { ClassGroup } from "../../elements/bindings";
import { defineFacet, uniqueBy } from "../../extensions/extension";
import { CLASS_CONFLICTS } from "./conflicts";
import { PATTERN_CLASS_PREFIX, PATTERN_VARS } from "./patterns/patternVars";
import { PATTERN_SLUGS } from "./patterns/patternSlugs";
import { PH_LOOP_NAMES, PH_MOD_NAMES } from "./phClasses";

type Match = NonNullable<ClassGroup["match"]>;
const re = (r: RegExp): Match => (t) => r.test(t);

// ── value scales ──────────────────────────────────────────────────────────────
const NUM = String.raw`\d+(?:\.\d+)?`;
/** `[...]` arbitrary value and `(--var)` custom-property shorthand. */
const ARB = String.raw`\[[^\]]+\]`;
const VAR = String.raw`\(--[^)]+\)`;
const NA = `(?:${NUM}|${ARB}|${VAR})`;
/** A length-ish arbitrary value (not a colour / url / custom property). */
const ARB_LEN = String.raw`\[(?!#|rgba?\(|hsla?\(|oklch\(|oklab\(|color:|color-mix\(|url\(|image:|--)[^\]]+\]`;
/** Spacing: numbers, `px`, `auto`, the `space-*` tokens, arbitrary values. */
const VAL = String.raw`(?:${NUM}|px|auto|space-[a-z0-9]+|${ARB}|${VAR})`;
/** Offsets and translations also take fractions and `full`. */
const POS = String.raw`(?:${VAL}|full|\d+/\d+)`;
const SIZE = String.raw`(?:${VAL}|full|screen|[sld]v[hw]|min|max|fit|none|\d+/\d+|[23]?xs|sm|md|lg|xl|[2-7]xl|prose|page|content|container|screen-[a-z0-9]+)`;
const NAMED_SHADOW_SIZE = "[23]?xs|sm|md|lg|xl|2xl|inner|none";

// ── colour tokens: palette words (`primary`, `base-200`, `red-500`), arbitrary colours, `/opacity` ──
const ARB_COLOR = String.raw`\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|color:|color-mix\()[^\]]*\]|\(color:--[^)]+\)`;
const COLOR_VALUE = new RegExp(String.raw`^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*|${ARB_COLOR})(?:/(?:\d+|${ARB}))?$`);
/** `prefix-<colour>`, minus the keywords of sibling groups that share the prefix. */
const color = (prefix: string, notColor: string): Match => {
  const skip = new RegExp(`^(?:${notColor})$`);
  return (t) => t.startsWith(`${prefix}-`) && !skip.test(t.slice(prefix.length + 1)) && COLOR_VALUE.test(t.slice(prefix.length + 1));
};
const NO_BASE_COLOR = "";

/** `^prefix-(words)$` (a bare `prefix` is allowed with `bare`). */
const kw = (prefix: string, words: string, bare = false): Match => re(new RegExp(`^${prefix}${bare ? `(?:-(?:${words}))?` : `-(?:${words})`}$`));
const g = (id: string, match: Match): ClassGroup => ({ id, match });
const k = (id: string, prefix: string, words: string, bare = false): ClassGroup => g(id, kw(prefix, words, bare));
const or = (...ms: Match[]): Match => (t) => ms.some((m) => m(t));

const TEXT_SIZE = /^text-(?:xs|sm|base|lg|xl|[2-9]xl|\[\d[^\]]*\])$/;
const TEXT_ALIGN = /^text-(?:left|center|right|justify|start|end)$/;
const SPACING_GROUPS = ["p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr", "mb", "ml"] as const;

const BG_NOT_COLOR = String.raw`cover|contain|auto|fixed|local|scroll|no-repeat|repeat(?:-[xy]|-round|-space)?|round|space|clip-.+|origin-.+|blend-.+|(?:linear|radial|conic|gradient)-.+|none|center|top|bottom|left|right|(?:left|right)-(?:top|bottom)|(?:top|bottom)-(?:left|right)|size-.+|position-.+`;
const BG_POSITION = String.raw`center|top|bottom|left|right|(?:left|right)-(?:top|bottom)|(?:top|bottom)-(?:left|right)`;
const BORDER_NOT_COLOR = String.raw`solid|dashed|dotted|double|hidden|none|collapse|separate|spacing-.+|[trblxyse](?:-.+)?`;
const FILTER_NAMES = ["blur", "brightness", "contrast", "grayscale", "hue-rotate", "invert", "saturate", "sepia"] as const;
const FILTER_SCALE: Record<(typeof FILTER_NAMES)[number], string> = {
  blur: `(?:-(?:none|[23]?xs|sm|md|lg|xl|[2-3]xl|${ARB}|${VAR}))?`,
  brightness: `-${NA}`,
  contrast: `-${NA}`,
  grayscale: `(?:-${NA})?`,
  "hue-rotate": `-${NA}`,
  invert: `(?:-${NA})?`,
  saturate: `-${NA}`,
  sepia: `(?:-${NA})?`,
};
const filterGroup = (id: string, name: (typeof FILTER_NAMES)[number], prefix = ""): ClassGroup => ({
  id,
  match: re(new RegExp(`^${name === "hue-rotate" ? "-?" : ""}${prefix}${name}${FILTER_SCALE[name]}$`)),
});

const CURSORS = "auto|default|pointer|wait|text|move|help|not-allowed|none|context-menu|progress|cell|crosshair|vertical-text|alias|copy|no-drop|grab|grabbing|all-scroll|col-resize|row-resize|[nsew]{1,2}-resize|(?:nesw|nwse|ew|ns)-resize|zoom-in|zoom-out|" + ARB;
const ALIGN_ALL = "start|end|center|stretch|baseline|between|around|evenly|normal";

const PATTERN_SLUG_SET = new Set(PATTERN_SLUGS);

const DEFINITIONS: readonly ClassGroup[] = [
  // ── layout ──
  g("display", re(/^(?:block|inline-block|inline|flex|inline-flex|grid|inline-grid|contents|hidden|table|inline-table|table-(?:row|cell|caption|column|row-group|header-group|footer-group|column-group)|flow-root|list-item)$/)),
  g("position", re(/^(?:static|fixed|absolute|relative|sticky)$/)),
  g("flex-direction", re(/^flex-(?:row|col)(?:-reverse)?$/)),
  g("justify-content", re(/^justify-(?:start|end|center|between|around|evenly|stretch|normal)$/)),
  g("align-items", re(/^items-(?:start|end|center|baseline|stretch)$/)),
  g("grid-cols", re(/^grid-cols-(?:\d+|none|subgrid|\[[^\]]+\])$/)),
  g("gap", re(new RegExp(`^gap-${VAL}$`))),
  g("gap-x", re(new RegExp(`^gap-x-${VAL}$`))),
  g("gap-y", re(new RegExp(`^gap-y-${VAL}$`))),
  ...SPACING_GROUPS.map((key) => g(key, re(new RegExp(`^-?${key}-${VAL}$`)))),
  g("width", re(/^w-/)),
  g("height", re(/^h-/)),
  g("max-width", re(/^max-w-/)),
  g("max-height", re(new RegExp(`^max-h-${SIZE}$`))),
  g("min-width", re(new RegExp(`^min-w-${SIZE}$`))),
  g("min-height", re(new RegExp(`^min-h-${SIZE}$`))),
  g("size", re(new RegExp(`^size-${SIZE}$`))),
  g("aspect", re(new RegExp(`^aspect-(?:auto|square|video|\\d+/\\d+|${ARB}|${VAR})$`))),
  g("box", re(/^box-(?:border|content)$/)),
  g("float", re(/^float-(?:left|right|none|start|end)$/)),
  g("isolation", re(/^(?:isolate|isolation-auto)$/)),
  g("visibility", re(/^(?:visible|invisible|collapse)$/)),
  g("overflow", re(/^overflow-(?:auto|hidden|clip|visible|scroll)$/)),
  g("overflow-x", re(/^overflow-x-(?:auto|hidden|clip|visible|scroll)$/)),
  g("overflow-y", re(/^overflow-y-(?:auto|hidden|clip|visible|scroll)$/)),
  g("sr-only", re(/^(?:sr-only|not-sr-only)$/)),
  g("inset", re(new RegExp(`^-?inset-${POS}$`))),
  g("inset-x", re(new RegExp(`^-?inset-x-${POS}$`))),
  g("inset-y", re(new RegExp(`^-?inset-y-${POS}$`))),
  ...(["top", "right", "bottom", "left"] as const).map((side) => g(side, re(new RegExp(`^-?${side}-${POS}$`)))),
  g("order", re(new RegExp(`^-?order-(?:\\d+|first|last|none|${ARB}|${VAR})$`))),
  g("col-span", re(/^col-(?:span-(?:\d+|full)|auto)$/)),
  g("row-span", re(/^row-(?:span-(?:\d+|full)|auto)$/)),
  g("columns", re(new RegExp(`^columns-(?:\\d+|auto|[23]xs|xs|sm|md|lg|xl|[2-7]xl|${ARB}|${VAR})$`))),
  g("z-index", re(/^-?z-(?:\d+|auto|\[[^\]]+\])$/)),
  g("table-layout", re(/^table-(?:auto|fixed)$/)),
  g("caption", re(/^caption-(?:top|bottom)$/)),
  g("break-before", re(/^break-before-(?:auto|avoid|all|avoid-page|page|left|right|column)$/)),
  g("break-after", re(/^break-after-(?:auto|avoid|all|avoid-page|page|left|right|column)$/)),
  g("break-inside", re(/^break-inside-(?:auto|avoid|avoid-page|avoid-column)$/)),
  g("break", re(/^break-(?:normal|words|all|keep)$/)),
  // ── flex / grid alignment ──
  g("flex", re(new RegExp(`^flex-(?:\\d+|auto|initial|none|\\d+/\\d+|${ARB}|${VAR})$`))),
  g("basis", re(new RegExp(`^basis-${SIZE}$`))),
  k("align-self", "self", "auto|start|end|center|stretch|baseline"),
  k("justify-items", "justify-items", "start|end|center|stretch|normal"),
  k("justify-self", "justify-self", "auto|start|end|center|stretch"),
  k("place-content", "place-content", ALIGN_ALL),
  k("place-items", "place-items", "start|end|center|stretch|baseline"),
  k("place-self", "place-self", "auto|start|end|center|stretch"),
  // ── typography ──
  g("text-size", re(TEXT_SIZE)),
  g("text-align", re(TEXT_ALIGN)),
  g("text-color", (t) => t.startsWith("text-") && !TEXT_SIZE.test(t) && !TEXT_ALIGN.test(t) && !/^text-(?:wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(t)),
  g("font-weight", re(/^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/)),
  g("font-family", re(new RegExp(`^font-(?:sans|serif|mono|heading|body|accent|${ARB}|${VAR})$`))),
  g("font-style", re(/^(?:italic|not-italic)$/)),
  g("font-smoothing", re(/^(?:antialiased|subpixel-antialiased)$/)),
  g("leading", re(new RegExp(`^leading-(?:none|tight|snug|normal|relaxed|loose|${NUM}|space-[a-z0-9]+|${ARB}|${VAR})$`))),
  g("tracking", re(new RegExp(`^tracking-(?:tighter|tight|normal|wide|wider|widest|${ARB}|${VAR})$`))),
  g("indent", re(new RegExp(`^-?indent-(?:px|${NUM}|${ARB}|${VAR})$`))),
  g("text-transform", re(/^(?:uppercase|lowercase|capitalize|normal-case)$/)),
  g("text-wrap", re(/^text-(?:wrap|nowrap|balance|pretty)$/)),
  g("text-overflow", re(/^(?:truncate|text-ellipsis|text-clip)$/)),
  g("whitespace", re(/^whitespace-(?:normal|nowrap|pre|pre-line|pre-wrap|break-spaces)$/)),
  g("text-decoration", re(/^(?:underline|overline|line-through|no-underline)$/)),
  g("decoration-style", re(/^decoration-(?:solid|double|dotted|dashed|wavy)$/)),
  g("decoration-color", color("decoration", "solid|double|dotted|dashed|wavy|auto|from-font")),
  g("decoration-thickness", re(new RegExp(`^decoration-(?:\\d+|auto|from-font|${ARB_LEN})$`))),
  g("underline-offset", re(new RegExp(`^-?underline-offset-(?:\\d+|auto|${ARB}|${VAR})$`))),
  g("align", re(/^align-(?:baseline|top|middle|bottom|text-top|text-bottom|sub|super)$/)),
  g("list-style-type", re(new RegExp(`^list-(?:none|disc|decimal|${ARB}|${VAR})$`))),
  g("list-style-position", re(/^list-(?:inside|outside)$/)),
  g("content", re(new RegExp(`^content-(?:none|${ARB}|${VAR})$`))),
  // ── backgrounds ──
  g("bg-color", color("bg", BG_NOT_COLOR)),
  g("bg-image", re(new RegExp(String.raw`^bg-(?:none|\[(?:url|image:)[^\]]*\])$`))),
  g("bg-gradient", re(/^bg-(?:linear|radial|conic|gradient)-.+$/)),
  g("bg-attachment", re(/^bg-(?:fixed|local|scroll)$/)),
  g("bg-clip", re(/^bg-clip-(?:border|padding|content|text)$/)),
  g("bg-origin", re(/^bg-origin-(?:border|padding|content)$/)),
  g("bg-blend", re(/^bg-blend-[a-z-]+$/)),
  g("bg-position", re(new RegExp(`^bg-(?:${BG_POSITION}|position-${NA}|\\[position:[^\\]]+\\])$`))),
  g("bg-repeat", re(/^bg-(?:repeat|no-repeat|repeat-x|repeat-y|repeat-round|repeat-space)$/)),
  g("bg-size", re(new RegExp(`^bg-(?:auto|cover|contain|size-${NA}|\\[length:[^\\]]+\\])$`))),
  g("gradient-from", color("from", NO_BASE_COLOR)),
  g("gradient-via", color("via", NO_BASE_COLOR)),
  g("gradient-to", color("to", NO_BASE_COLOR)),
  // Per-stop position (Tailwind `from-50%` / `via-50%` / `to-90%`) — distinct from the colour groups,
  // which only match colour values; a bare percent never satisfies `COLOR_VALUE`.
  g("gradient-from-pos", re(/^from-\d{1,3}%$/)),
  g("gradient-via-pos", re(/^via-\d{1,3}%$/)),
  g("gradient-to-pos", re(/^to-\d{1,3}%$/)),
  g("bg-pattern", (t) => t.startsWith(PATTERN_CLASS_PREFIX) && PATTERN_SLUG_SET.has(t.slice(PATTERN_CLASS_PREFIX.length))),
  ...PATTERN_VARS.map((p) => g(`pattern-${p}`, re(new RegExp(`^\\[--pattern-${p}:[^\\]]+\\]$`)))),
  // ── borders, outline, ring, shadow ──
  g("rounded", re(/^rounded(?:-(?:none|xs|sm|md|lg|xl|[23]xl|full|box|field|selector|\[[^\]]+\]))?$/)),
  g("shadow", re(/^shadow(?:-(?:none|xs|sm|md|lg|xl|2xl|inner))?$/)),
  g("shadow-color", color("shadow", NAMED_SHADOW_SIZE)),
  g("opacity", re(/^opacity-\d+$/)),
  g("border-width", re(/^border(?:-(?:0|2|4|8))?$/)),
  g("border-color", color("border", BORDER_NOT_COLOR)),
  g("border-style", re(/^border-(?:solid|dashed|dotted|double|hidden|none)$/)),
  g("divide-width", re(new RegExp(`^divide-[xy](?:-(?:${NUM}|reverse|${ARB}))?$`))),
  g("divide-style", re(/^divide-(?:solid|dashed|dotted|double|none)$/)),
  g("divide-color", color("divide", String.raw`[xy](?:-.+)?|solid|dashed|dotted|double|none|reverse`)),
  g("outline", re(/^outline(?:-(?:none|hidden|solid|dashed|dotted|double))?$/)),
  g("outline-style", re(/^outline(?:-(?:none|hidden|solid|dashed|dotted|double))?$/)),
  g("outline-width", re(new RegExp(`^outline-(?:\\d+|${ARB_LEN})$`))),
  g("outline-offset", re(new RegExp(`^-?outline-offset-(?:\\d+|${ARB}|${VAR})$`))),
  g("outline-color", color("outline", String.raw`none|hidden|solid|dashed|dotted|double|offset-.+`)),
  g("ring-width", re(new RegExp(`^ring(?:-(?:\\d+|${ARB_LEN}))?$`))),
  g("ring-color", color("ring", String.raw`inset|offset-.+`)),
  g("ring-offset-width", re(new RegExp(`^ring-offset-(?:\\d+|${ARB_LEN})$`))),
  g("fill", color("fill", NO_BASE_COLOR)),
  g("stroke", color("stroke", NO_BASE_COLOR)),
  g("stroke-width", re(new RegExp(`^stroke-(?:\\d+|${ARB_LEN})$`))),
  // ── images, objects ──
  k("object-fit", "object", "contain|cover|fill|none|scale-down"),
  g("object-position", re(new RegExp(`^object-(?:${BG_POSITION}|${ARB})$`))),
  // ── effects ──
  ...FILTER_NAMES.map((n) => filterGroup(n === "blur" ? "blur" : n, n)),
  ...FILTER_NAMES.map((n) => filterGroup(`backdrop-${n}`, n, "backdrop-")),
  g("backdrop-opacity", re(new RegExp(`^backdrop-opacity-${NA}$`))),
  k("mix-blend", "mix-blend", "normal|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity|plus-darker|plus-lighter"),
  // ── transforms ──
  g("transform", re(/^transform(?:-(?:gpu|cpu|none))?$/)),
  g("translate-x", re(new RegExp(`^-?translate-x-${POS}$`))),
  g("translate-y", re(new RegExp(`^-?translate-y-${POS}$`))),
  g("rotate", re(new RegExp(`^-?rotate-(?:${NUM}|none|${ARB}|${VAR})$`))),
  g("scale", re(new RegExp(`^-?scale-(?:${NUM}|none|${ARB}|${VAR})$`))),
  g("scale-x", re(new RegExp(`^-?scale-x-${NA}$`))),
  g("scale-y", re(new RegExp(`^-?scale-y-${NA}$`))),
  g("skew-x", re(new RegExp(`^-?skew-x-${NA}$`))),
  g("skew-y", re(new RegExp(`^-?skew-y-${NA}$`))),
  k("origin", "origin", `center|top|top-right|right|bottom-right|bottom|bottom-left|left|top-left|${ARB}|${VAR}`),
  // ── transitions and animation ──
  g("transition", re(new RegExp(`^transition(?:-(?:none|all|colors|opacity|shadow|transform|${ARB}|${VAR}))?$`))),
  g("duration", re(new RegExp(`^duration-(?:${NUM}|initial|${ARB}|${VAR})$`))),
  g("delay", re(new RegExp(`^delay-(?:${NUM}|${ARB}|${VAR})$`))),
  g("ease", re(new RegExp(`^ease-(?:linear|in|out|in-out|initial|${ARB}|${VAR})$`))),
  g("animate", re(new RegExp(`^animate-(?:none|[a-z][a-z0-9:-]*|${ARB}|${VAR})$`))),
  g("animation-loop", kw("ph", `marquee|loop-(?:${PH_LOOP_NAMES.join("|")})`)),
  // Entrance-animation param overrides — arbitrary `--anim-*` custom-property utilities. The
  // `animate-css-<preset>` rules in site-runtime/animate.css read these vars inside their single
  // `animation:` shorthand, so an element-level value wins no matter where the compiled utility sits
  // in the published source order (a plain `animation-duration` longhand would lose to the unlayered
  // shorthand, or to `@layer utilities` being layered). Edited in the Animation control.
  g("anim-duration", re(/^\[--anim-duration:[^\]]+\]$/)),
  g("anim-delay", re(/^\[--anim-delay:[^\]]+\]$/)),
  g("anim-easing", re(/^\[--anim-easing:[^\]]+\]$/)),
  g("anim-iteration", re(/^\[--anim-iteration:[^\]]+\]$/)),
  g("animation-timeline", re(/^\[animation-timeline:[^\]]+\]$/)),
  g("animation-range", re(/^\[animation-range:[^\]]+\]$/)),
  g("marquee-speed", re(/^\[--marquee-speed:[^\]]+\]$/)),
  g("marquee-direction", re(/^(?:ph-marquee-reverse|\[animation-direction:(?:normal|reverse|alternate|alternate-reverse)\])$/)),
  g("will-change", re(new RegExp(`^will-change-(?:auto|scroll|contents|transform|${ARB}|${VAR})$`))),
  g("modifier-presets", kw("ph-mod", PH_MOD_NAMES.join("|"))),
  // ── interaction ──
  g("cursor", re(new RegExp(`^cursor-(?:${CURSORS})$`))),
  k("pointer-events", "pointer-events", "none|auto"),
  g("resize", re(/^resize(?:-(?:none|x|y))?$/)),
  k("select", "select", "none|text|all|auto"),
  k("touch", "touch", "auto|none|manipulation|pan-x|pan-y|pan-left|pan-right|pan-up|pan-down|pinch-zoom"),
  g("appearance", re(/^appearance-(?:none|auto)$/)),
  // ── scroll, snap, spacing helpers ──
  g("snap-type", re(/^snap-(?:none|x|y|both|mandatory|proximity)$/)),
  g("snap-align", re(/^snap-(?:start|end|center|align-none)$/)),
  g("snap", re(/^snap-(?:none|x|y|both|mandatory|proximity|start|end|center|align-none)$/)),
  g("decoration", or(re(/^decoration-(?:solid|double|dotted|dashed|wavy)$/), color("decoration", "solid|double|dotted|dashed|wavy|auto|from-font"), re(new RegExp(`^decoration-(?:\\d+|auto|from-font|${ARB_LEN})$`)))),
  g("scroll-m", re(new RegExp(`^-?scroll-m-${VAL}$`))),
  g("scroll-mt", re(new RegExp(`^-?scroll-mt-${VAL}$`))),
  g("scroll-p", re(new RegExp(`^-?scroll-p-${VAL}$`))),
  g("scroll-pt", re(new RegExp(`^-?scroll-pt-${VAL}$`))),
  g("scroll-px", re(new RegExp(`^-?scroll-px-${VAL}$`))),
  g("scroll-py", re(new RegExp(`^-?scroll-py-${VAL}$`))),
  g("space-x", re(new RegExp(`^-?space-x-(?:${VAL}|reverse)$`))),
  g("space-y", re(new RegExp(`^-?space-y-(?:${VAL}|reverse)$`))),
];

/** Every group the kit ships, with its cross-group conflicts (`conflicts.ts`) attached. */
export const TAILWIND_GROUPS: readonly ClassGroup[] = DEFINITIONS.map((d) => (CLASS_CONFLICTS[d.id] ? { ...d, conflicts: CLASS_CONFLICTS[d.id] } : d));

export const classGroupsFacet = defineFacet<ClassGroup, ReadonlyMap<string, ClassGroup>>({ id: "classGroups", combine: uniqueBy<ClassGroup>("class group", (g) => g.id) });
