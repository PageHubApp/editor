/**
 * Inspector rows from the property map: which map entries are rows (a bundle's sub-keys live
 * inside their parent's control), and each row's label, order, hide key, popover kind, default,
 * keywords and binding (class groups, attribute or tag argument). Pure data, no React.
 *
 *   inspectorRows().filter((r) => r.section === "size")   // width, height, minWidth, …
 *
 * Values mirror today's registry (`inspector/registry/properties/*`): hide keys, pinned rows,
 * popover-mode inputs, the single-inline sections and the unpinnable ones.
 */
import { PROPERTY_MAP, SECTIONS, type PropEntry } from "../../../property-map/propertyMap";

/** A hide key (engine `HideKey`): a section or property an element type leaves out. */
export type HideKey = string;

export interface RowDef {
  /** The entry key. */
  id: string;
  entry: PropEntry;
  label: string;
  section: string;
  /** Position in its section (map order = registry order). */
  sortOrder: number;
  hideKey?: HideKey;
  /** The control opens a popover (colour, gradient, effects, action …). */
  popover: boolean;
  /** Always shown, never in the "+" picker. */
  pinned: boolean;
  /** Written when the row is added from "+"; none = added empty for the session. */
  defaultValue?: string;
  /** Shown by default (an unset control), common per-section rows; never in the "+" picker. */
  defaultShown: boolean;
  keywords: string[];
  /** Class groups the row reads / writes (`cls("…")` in the binding). */
  groups: string[];
  /** The HTML attribute it binds (`attr("…")`). */
  attr?: string;
  /** The Liquid tag argument it binds (`arg("…")`). */
  arg?: string;
  /** Attribute value kind, from the binding's schema. */
  kind: "string" | "number" | "boolean" | "enum";
  options?: string[];
  /** Shown only when the element is positioned (`relative`, `absolute`, `fixed`, `sticky`). */
  whenPositioned?: boolean;
  /** Shown only on elements with this tag (a container row that belongs to one tag). */
  whenTag?: string;
  /** Help text (the "+" tooltip). */
  help: string;
}

/** Section id → the hide key that removes the whole section (`sectionDefs.ts`). */
export const SECTION_HIDE: Readonly<Record<string, HideKey>> = {
  modifiers: "modifiers", alignment: "alignment", size: "size", typography: "font", background: "background",
  hover: "hoverClick", action: "hoverClick", handlers: "hoverClick", effects: "effectsClass", properties: "accessibility",
  "import-export": "importExport",
};

/** Row key → its own hide key (`hideKey` on the registry property). */
const ROW_HIDE: Readonly<Record<string, HideKey>> = {
  color: "textColor", background: "bgColor", bgPattern: "pattern", shadow: "shadow", opacity: "opacity", border: "border",
  borderRadius: "radius", ring: "ringOutline", outline: "ringOutline", cursor: "cursor", animation: "animations",
  transition: "effectsClass", "effects.transform": "effectsClass", filter: "effectsClass", backdrop: "effectsClass", importExport: "importExport",
};

/** Sections that are one inline custom input: body always rendered, no "+". */
export const INLINE_SECTIONS: ReadonlySet<string> = new Set(["permissions", "import-export", "ai-context", "custom-css"]);
/** Sections the pin button never shows on. */
export const UNPINNABLE: ReadonlySet<string> = new Set(["component", "modifiers", "advanced-settings", "import-export", "ai-context", "permissions"]);
export const MAX_PINS = 10;

const PINNED: ReadonlySet<string> = new Set(["layoutPreset", "modifiers", "typographyPreset", "preset-items", "stateBindings", "computedStateBindings", "action", "conditions"]);

/**
 * The common controls each section shows by default — an unset control the user can fill without
 * first adding it from "+", the full default control set per section.
 * Element-type eligibility still applies (`rowEligible`): a `Container Data`-only row (e.g.
 * `flexDirection`) never shows on a Text element, a `Text`-only row (e.g. `fontFamily`) never on a
 * Container. Everything not listed here (and not pinned / valued) stays behind "+".
 */
const DEFAULT_SHOWN: ReadonlySet<string> = new Set([
  // Layout
  "flexDirection", "alignItems", "justifyContent", "gap", "alignSelf", "justifySelf", "padding", "margin",
  // Size
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  // Text / typography
  "fontFamily", "fontSize", "fontWeight", "color", "textAlign", "spacing", "typography.transform",
  // Background
  "background", "backgroundGradient", "bgImage",
  // Styles
  "display", "border", "borderRadius", "shadow", "opacity",
  // Hover
  "hover.background", "hover.textColor",
  // Effects
  "animation", "transition", "effects.transform",
]);

const POPOVER: ReadonlySet<string> = new Set([
  "color", "background", "backgroundGradient", "bgImage", "bgPattern", "hover.background", "hover.textColor", "hover.border", "shadow",
  "animation", "transition", "effects.transform", "filter", "backdrop", "scrollEffect", "action", "handlers", "conditions", "dataSource",
  "stateBindings", "stateModifiers", "visibilityStateKey", "computedStateBindings", "inViewState",
]);

/** Keys edited inside another row's control (a bundle's parts). Dotted keys under a same-section key are parts too. */
const PARTS: Readonly<Record<string, readonly string[]>> = {
  filter: ["blur", "brightness", "contrast", "grayscale", "hueRotate", "invert", "saturate", "sepia"],
  backdrop: ["backdropBlur", "backdropBrightness", "backdropContrast", "backdropGrayscale", "backdropHueRotate", "backdropInvert", "backdropSaturate", "backdropSepia", "backdropOpacity"],
  transition: ["transitionProperty", "duration", "delay", "ease", "willChange"],
  "effects.transform": ["twTransform", "translateX", "translateY", "rotate", "scale", "scaleX", "scaleY", "skewX", "skewY", "transformOrigin"],
  animation: ["animationLoop", "animationDuration", "animationDelay", "animationEasing", "animationStagger", "animationTrigger", "animationExit", "twAnimate"],
  scrollEffect: ["scrollDirection", "scrollSpeed", "scrollTimelineRunway", "scrollSmoothing", "root.scrollTimeline.preset", "root.scrollTimeline._timing"],
  spacing: ["lineHeight", "tracking", "indent"],
  border: ["borderWidth", "borderStyle", "borderColor"],
  ring: ["ringWidth", "ringColor", "ringOffsetWidth"],
  shadow: ["shadowColor"],
  list: ["listStyleType", "listStylePosition"],
  bgPattern: ["patternAngle", "patternSpacingX", "patternSpacingY", "patternStroke", "patternZoom", "patternHorizontalPosition", "patternVerticalPosition"],
  backgroundGradient: ["backgroundGradientFrom", "backgroundGradientVia", "backgroundGradientTo"],
  gap: ["gapX", "gapY"],
  gridSpan: ["gridColSpan", "gridRowSpan"],
  place: ["placeItems", "placeSelf"],
  break: ["breakBefore", "breakInside", "breakAfter"],
  table: ["tableLayout"],
  conditions: ["condType", "condOp", "condAuthField", "condAuthMember", "condAuthPlan", "condAuthBoolValue", "condAuthValue", "condCompanyField", "condConnCollection", "condConnProvider", "condDevice", "condFormTarget"],
  handlers: ["handlerEvent", "handlerOptions"],
  action: ["actionType", "actionTrigger", "actionDirection", "urlTarget", "relation", "toggleThemeDismissMethod", "setStateKind", "toggleStateKind"],
  autoScroll: ["autoScrollInterval"],
  infiniteSpeed: ["infiniteDirection"],
  svg: ["fill", "stroke", "strokeWidth"],
  overflow: [],
};

const LABELS: Readonly<Record<string, string>> = {
  color: "Color", background: "Background", bgImage: "Image", bgPattern: "Pattern", borderRadius: "Radius", className: "Classes",
  formName: "Name",
  "image.src": "Source", alt: "Alt text",
  "effects.transform": "Transform", "hover.background": "Background", "hover.textColor": "Text color", "hover.border": "Border",
  layoutPreset: "Layout", typographyPreset: "Text style", "preset-items": "Items", zIndex: "Z-index",
  "state.text": "State text", "details.open": "Open by default",
  dataSource: "Source", // the group is already "Data source"; don't repeat it on the primary field
};

const humanize = (key: string): string => {
  const last = key.split(".").pop()!;
  const words = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const partOf = new Map<string, string>(Object.entries(PARTS).flatMap(([p, ks]) => ks.map((k) => [k, p] as const)));

function isPart(e: PropEntry, keys: ReadonlyMap<string, PropEntry>): boolean {
  if (partOf.has(e.key)) return true;
  const parts = e.key.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const parent = keys.get(parts.slice(0, i).join("."));
    if (parent && parent.section === e.section) return true;
  }
  return false;
}

function bindingOf(binding: string): Pick<RowDef, "groups" | "attr" | "arg" | "kind" | "options"> {
  const groups = [...binding.matchAll(/cls\("([^"]+)"\)/g)].map((m) => m[1]!);
  const attr = /^attr\("([^"]+)"/.exec(binding)?.[1];
  const arg = /^arg\("([^"]+)"/.exec(binding)?.[1];
  const enumm = /t\.enum\(\[([^\]]*)\]\)/.exec(binding)?.[1];
  const options = enumm ? [...enumm.matchAll(/"([^"]*)"/g)].map((m) => m[1]!) : undefined;
  const kind = options?.length ? "enum" : /t\.boolean\(\)/.test(binding) ? "boolean" : /t\.(number|int)\(\)/.test(binding) ? "number" : "string";
  return { groups, ...(attr ? { attr } : {}), ...(arg ? { arg } : {}), kind, ...(options?.length ? { options } : {}) };
}

let cache: RowDef[] | null = null;

/** Every inspector row, in map order. Excludes the `site` and `ui` pseudo-tabs and bundle parts. */
export function inspectorRows(): readonly RowDef[] {
  if (cache) return cache;
  const keys = new Map(PROPERTY_MAP.map((e) => [e.key, e]));
  const order = new Map<string, number>();
  cache = PROPERTY_MAP.filter((e) => e.tab !== "site" && e.tab !== "ui" && !isPart(e, keys)).map((e) => {
    const n = order.get(e.section) ?? 0;
    order.set(e.section, n + 1);
    const b = bindingOf(e.binding);
    const parts = PARTS[e.key] ?? [];
    return {
      id: e.key,
      entry: e,
      label: LABELS[e.key] ?? humanize(e.key),
      section: e.section,
      sortOrder: n,
      ...(ROW_HIDE[e.key] ? { hideKey: ROW_HIDE[e.key] } : {}),
      popover: POPOVER.has(e.key),
      pinned: PINNED.has(e.key),
      defaultShown: DEFAULT_SHOWN.has(e.key),
      ...(b.kind === "boolean" && b.attr ? { defaultValue: "" } : {}),
      keywords: [...(e.aliases ?? []), ...parts, ...(e.group ? [e.group] : [])],
      ...b,
      ...(e.key === "inset" ? { whenPositioned: true } : {}),
      ...(e.key === "details.open" ? { whenTag: "details" } : {}),
      help: e.does,
    } satisfies RowDef;
  });
  return cache;
}

/** Section title, from the map's section table. */
export const sectionTitle = (id: string): string => SECTIONS[id]?.[1] ?? id;

/** Component-tab section title → the rows it holds (today's `mainTabs/*` panels). */
const COMPONENT_SECTION_ROWS: Readonly<Record<string, readonly string[]>> = {
  "Container Role": ["container.type"],
  Form: ["formName", "form.action", "method", "form.enctype", "form.target", "form.autocomplete", "form.novalidate"],
  "Conversion tracking": ["conversion"],
  "Edit HTML": ["text", "tagName", "richText", "textFitMode"],
  Playback: ["provider", "videoId", "autoPlay", "controls", "loop", "muted", "playsInline", "preload"],
  Accessibility: ["title"],
  Location: ["map.lat", "map.lng"],
  Details: ["map.title"],
  "Map Settings": ["zoom", "map.type", "tileStyle", "map.grayscale"],
  "Center Position": [],
};

/** The section id of a component-tab section title. */
export const componentSectionId = (title: string): string => `component:${title}`;

/**
 * Rows of a component-tab section. `component:<Title>` holds that title's rows (any map
 * section); plain `component` holds the type's component rows no titled section claims.
 */
export function componentSectionRows(id: string, titles: readonly string[]): readonly RowDef[] {
  const all = inspectorRows();
  const byId = new Map(all.map((r) => [r.id, r]));
  if (id.startsWith("component:")) return (COMPONENT_SECTION_ROWS[id.slice(10)] ?? []).map((k) => byId.get(k)).filter((r): r is RowDef => !!r);
  const claimed = new Set(titles.flatMap((t) => COMPONENT_SECTION_ROWS[t] ?? []));
  return all.filter((r) => r.section === "component" && !claimed.has(r.id));
}
