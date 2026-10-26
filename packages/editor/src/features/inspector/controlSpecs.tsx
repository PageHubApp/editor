/**
 * Control-spec registry: which inspector control a property renders, keyed by the
 * property-map key (`RowDef.id`). This is the presentation half of the control-dispatch seam —
 * the icons, option sets, shorthand modes and toggle sets each property carries. Reads and writes
 * go through the engine's class model (`classBinding` / `readClass` / `classes.set`), so a spec
 * never restates a binding; it only says HOW the value is picked.
 *
 *   controlSpecFor("alignItems") // → { kind: "radio", options: [...] }
 *
 * A property with no spec falls back (in `RowControl`) to the universal value field for a single
 * class group, or its attribute / argument / structure control. Specialized families plug in by
 * adding rows here — this is where later waves (effects, state, action bundles) hook on.
 */
import type { ReactNode } from "react";
import type { ControlIconName } from "./controlIcons";
import { ControlIcon } from "./controlIcons";
import { Icon, type IconName } from "../../primitives/icons";
import type { ValueType } from "../toolbar/universal/universalValue";

// Local glyph wrapper so the spec table can carry the multi-toggle icons (bold / italic / …) from
// the chrome's own icon set.
function IconGlyph({ name }: { name: IconName }) {
  return <Icon name={name} className="size-3.5" />;
}

/** One segmented-control option (icon or text + hover hint). */
interface RadioOption {
  value: string;
  icon?: ControlIconName;
  /** Text label when there is no icon (`flexBase`: Fill / Auto / …). */
  text?: string;
  hint: string;
}

/** One slot of a shorthand control — a single class group with its own value field. */
interface ShorthandSlot {
  /** Class group id the field reads / writes (`p`, `px`, `pt`, `top`, …). */
  group: string;
  /** Class prefix for arbitrary values (`p-[4px]`); defaults to the group id. */
  prefix?: string;
  /** Per-slot label (`X`, `T`, …); empty for a single uniform field. */
  label: string;
}

/** One mode of a shorthand control (uniform / axes / per-side). */
export interface ShorthandModeSpec {
  id: string;
  icon: ControlIconName;
  ariaLabel: string;
  slots: ShorthandSlot[];
  /** Grid columns for the slot row (per-side uses 2). */
  columns?: number;
}

/** One toggle of a multi-toggle row (its own class group + the token it writes). */
export interface ToggleSpec {
  group: string;
  className: string;
  icon: ReactNode;
  tooltip: string;
}

/** One sub-field of a bundle control — a single class group edited as a value field or colour swatch. */
export interface BundleItemSpec {
  /** Engine class group id the field reads / writes (`border-width`, `decoration-color`). */
  group: string;
  label: string;
  /** `value` → the universal value field; `color` → the colour swatch + picker; `tiles` → preset tiles drawn with the value (shadow size). */
  control: "value" | "color" | "tiles";
  /** Class prefix for arbitrary values on a value field (`ring`, `translate-x`); default: the group id. */
  prefix?: string;
  /** Autocomplete tokens for a value field (its finite Tailwind set). */
  options?: readonly string[];
  allowedTypes?: readonly ValueType[];
}

export type ControlSpec =
  | { kind: "radio"; options: RadioOption[] }
  | { kind: "shorthand"; modes: ShorthandModeSpec[]; allowedTypes?: readonly ValueType[] }
  | { kind: "color" }
  | { kind: "multi-toggle"; toggles: ToggleSpec[] }
  | { kind: "universal"; prefix?: string; options?: readonly string[]; allowedTypes?: readonly ValueType[] }
  | { kind: "font" }
  | { kind: "textStyle" }
  // ── bundle / effects families (rendered by `connectors/inspector/controls/*`) ──
  | { kind: "bundle"; items: BundleItemSpec[] }
  | { kind: "gradient" }
  | { kind: "pattern" }
  | { kind: "animation" }
  // ── layout-preset visual picker (rendered by `connectors/inspector/LayoutPresetControl`) ──
  | { kind: "layout" };

const ico = (name: ControlIconName, value: string, hint: string): RadioOption => ({ value, icon: name, hint });

const SIZE_TYPES: readonly ValueType[] = ["tailwind", "calc", "px", "%", "em", "rem", "vw", "vh"];
const SPACING_TYPES: readonly ValueType[] = ["tailwind", "calc", "px", "em", "rem", "%"];
const OFFSET_TYPES: readonly ValueType[] = ["tailwind", "calc", "px", "%", "em", "rem", "vw", "vh"];

/** Per-side shorthand mode builder (padding / margin). `p`, `px`/`py`, `pt`/`pr`/`pb`/`pl`. */
const boxModes = (all: string, x: string, y: string, t: string, r: string, b: string, l: string): ShorthandModeSpec[] => [
  { id: "uniform", icon: "TbSquare", ariaLabel: "All sides", slots: [{ group: all, label: "" }] },
  { id: "axes", icon: "TbSpacingHorizontal", ariaLabel: "Horizontal & vertical", slots: [{ group: x, label: "X" }, { group: y, label: "Y" }] },
  { id: "sides", icon: "TbBorderInner", ariaLabel: "Per side", columns: 2, slots: [{ group: t, label: "T" }, { group: r, label: "R" }, { group: b, label: "B" }, { group: l, label: "L" }] },
];

const DISPLAY_OPTS = ["block", "inline-block", "inline", "flex", "inline-flex", "grid", "inline-grid", "contents", "hidden", "table", "flow-root", "list-item"];
const POSITION_OPTS = ["static", "relative", "absolute", "fixed", "sticky"];
const OVERFLOW_OPTS = ["overflow-auto", "overflow-hidden", "overflow-clip", "overflow-visible", "overflow-scroll"];
const WEIGHT_OPTS = ["font-thin", "font-extralight", "font-light", "font-normal", "font-medium", "font-semibold", "font-bold", "font-extrabold", "font-black"];
const SIZE_OPTS = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl", "text-7xl"];
const LEADING_OPTS = ["leading-none", "leading-tight", "leading-snug", "leading-normal", "leading-relaxed", "leading-loose"];
const TRACKING_OPTS = ["tracking-tighter", "tracking-tight", "tracking-normal", "tracking-wide", "tracking-wider", "tracking-widest"];
const INDENT_OPTS = ["indent-0", "indent-px", "indent-1", "indent-2", "indent-4", "indent-6", "indent-8", "indent-12", "indent-16"];
const CURSOR_OPTS = ["cursor-auto", "cursor-default", "cursor-pointer", "cursor-wait", "cursor-text", "cursor-move", "cursor-help", "cursor-not-allowed", "cursor-grab", "cursor-grabbing", "cursor-crosshair", "cursor-zoom-in", "cursor-zoom-out"];
const TRANSFORM_OPTS = ["uppercase", "lowercase", "capitalize", "normal-case"];
/** Theme font tokens the font-family control offers (`font-heading` resolves to the site's heading face). */
export const FONT_FAMILY_OPTS = ["font-heading", "font-body", "font-accent", "font-sans", "font-serif", "font-mono"];
const RADIUS_OPTS = ["rounded-none", "rounded-xs", "rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-box", "rounded-full"];
const SHADOW_OPTS = ["shadow-none", "shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl", "shadow-inner"];
const OPACITY_OPTS = ["opacity-0", "opacity-5", "opacity-10", "opacity-20", "opacity-25", "opacity-30", "opacity-40", "opacity-50", "opacity-60", "opacity-70", "opacity-75", "opacity-80", "opacity-90", "opacity-95", "opacity-100"];

// Finite token sets for the bundle / effects value fields (their groups accept these + arbitrary).
const BORDER_WIDTH_OPTS = ["border", "border-0", "border-2", "border-4", "border-8"];
const BORDER_STYLE_OPTS = ["border-solid", "border-dashed", "border-dotted", "border-double", "border-hidden", "border-none"];
const RING_WIDTH_OPTS = ["ring", "ring-0", "ring-1", "ring-2", "ring-4", "ring-8"];
const RING_OFFSET_OPTS = ["ring-offset-0", "ring-offset-1", "ring-offset-2", "ring-offset-4", "ring-offset-8"];
const TRANSITION_OPTS = ["transition", "transition-none", "transition-all", "transition-colors", "transition-opacity", "transition-shadow", "transition-transform"];
const DURATION_OPTS = ["duration-75", "duration-100", "duration-150", "duration-200", "duration-300", "duration-500", "duration-700", "duration-1000"];
const DELAY_OPTS = ["delay-75", "delay-100", "delay-150", "delay-200", "delay-300", "delay-500", "delay-700", "delay-1000"];
const EASE_OPTS = ["ease-linear", "ease-in", "ease-out", "ease-in-out"];
const WILL_CHANGE_OPTS = ["will-change-auto", "will-change-scroll", "will-change-contents", "will-change-transform"];
const GPU_OPTS = ["transform-gpu", "transform-cpu", "transform-none"];
const SCALE_OPTS = ["scale-0", "scale-50", "scale-75", "scale-90", "scale-95", "scale-100", "scale-105", "scale-110", "scale-125", "scale-150"];
const ROTATE_OPTS = ["rotate-0", "rotate-1", "rotate-2", "rotate-3", "rotate-6", "rotate-12", "rotate-45", "rotate-90", "rotate-180"];
const SKEW_OPTS = (a: string) => [`skew-${a}-0`, `skew-${a}-1`, `skew-${a}-2`, `skew-${a}-3`, `skew-${a}-6`, `skew-${a}-12`];
const ORIGIN_OPTS = ["origin-center", "origin-top", "origin-top-right", "origin-right", "origin-bottom-right", "origin-bottom", "origin-bottom-left", "origin-left", "origin-top-left"];
const TEXT_WRAP_OPTS = ["text-wrap", "text-nowrap", "text-balance", "text-pretty"];
const WHITESPACE_OPTS = ["whitespace-normal", "whitespace-nowrap", "whitespace-pre", "whitespace-pre-line", "whitespace-pre-wrap", "whitespace-break-spaces"];
const TEXT_OVERFLOW_OPTS = ["truncate", "text-ellipsis", "text-clip"];
const BREAK_OPTS = ["break-normal", "break-words", "break-all", "break-keep"];
const DECO_LINE_OPTS = ["underline", "overline", "line-through", "no-underline"];
const DECO_STYLE_OPTS = ["decoration-solid", "decoration-double", "decoration-dotted", "decoration-dashed", "decoration-wavy"];
const DECO_THICKNESS_OPTS = ["decoration-auto", "decoration-from-font", "decoration-0", "decoration-1", "decoration-2", "decoration-4", "decoration-8"];
const UNDERLINE_OFFSET_OPTS = ["underline-offset-auto", "underline-offset-0", "underline-offset-1", "underline-offset-2", "underline-offset-4", "underline-offset-8"];
const FILTER_SCALE_OPTS = (p: string, steps: number[]) => steps.map((n) => `${p}-${n}`);
const BLUR_OPTS = ["blur-none", "blur-xs", "blur-sm", "blur-md", "blur-lg", "blur-xl", "blur-2xl", "blur-3xl"];
const HUE_OPTS = (p: string) => [`${p}-0`, `${p}-15`, `${p}-30`, `${p}-60`, `${p}-90`, `${p}-180`];
const TW_ONLY: readonly ValueType[] = ["tailwind"];
const LEN_TYPES: readonly ValueType[] = ["tailwind", "px", "rem", "em", "%"];

/** Property-map key → its control. */
export const CONTROL_SPECS: Readonly<Record<string, ControlSpec>> = {
  // ── Layout preset — the real row/column/grid visual picker (adds/removes child containers) ──
  layoutPreset: { kind: "layout" },
  // ── Layout / alignment — segmented icon pickers ──
  flexDirection: {
    kind: "radio",
    options: [
      ico("TbBoxAlignTop", "flex-col", "Top to bottom"),
      ico("TbBoxAlignBottom", "flex-col-reverse", "Bottom to top"),
      ico("TbBoxAlignLeft", "flex-row", "Left to right"),
      ico("TbBoxAlignRight", "flex-row-reverse", "Right to left"),
    ],
  },
  alignItems: {
    kind: "radio",
    options: [
      ico("TbLayoutAlignTop", "items-start", "Start"),
      ico("TbLayoutAlignMiddle", "items-center", "Center"),
      ico("TbLayoutAlignBottom", "items-end", "End"),
      ico("TbBaseline", "items-baseline", "Baseline"),
      ico("TbAlignBoxCenterStretch", "items-stretch", "Stretch"),
    ],
  },
  justifyContent: {
    kind: "radio",
    options: [
      ico("TbLayoutAlignLeft", "justify-start", "Start"),
      ico("TbLayoutAlignCenter", "justify-center", "Center"),
      ico("TbLayoutAlignRight", "justify-end", "End"),
      ico("TbLayoutDistributeHorizontal", "justify-between", "Between"),
      ico("TbSpaces", "justify-around", "Around"),
      ico("TbSpace", "justify-evenly", "Evenly"),
    ],
  },
  justifyItems: {
    kind: "radio",
    options: [
      ico("TbLayoutAlignLeft", "justify-items-start", "Start"),
      ico("TbLayoutAlignCenter", "justify-items-center", "Center"),
      ico("TbLayoutAlignRight", "justify-items-end", "End"),
      ico("TbAlignBoxCenterStretch", "justify-items-stretch", "Stretch"),
    ],
  },
  alignSelf: {
    kind: "radio",
    options: [
      ico("TbSquare", "self-auto", "Auto"),
      ico("TbLayoutAlignTop", "self-start", "Start"),
      ico("TbLayoutAlignMiddle", "self-center", "Center"),
      ico("TbLayoutAlignBottom", "self-end", "End"),
      ico("TbBaseline", "self-baseline", "Baseline"),
      ico("TbAlignBoxCenterStretch", "self-stretch", "Stretch"),
    ],
  },
  justifySelf: {
    kind: "radio",
    options: [
      ico("TbSquare", "justify-self-auto", "Auto"),
      ico("TbLayoutAlignLeft", "justify-self-start", "Start"),
      ico("TbLayoutAlignCenter", "justify-self-center", "Center"),
      ico("TbLayoutAlignRight", "justify-self-end", "End"),
      ico("TbAlignBoxCenterStretch", "justify-self-stretch", "Stretch"),
    ],
  },
  placeContent: {
    kind: "radio",
    options: [
      ico("TbLayoutAlignLeft", "place-content-start", "Start"),
      ico("TbLayoutAlignCenter", "place-content-center", "Center"),
      ico("TbLayoutAlignRight", "place-content-end", "End"),
      ico("TbLayoutDistributeHorizontal", "place-content-between", "Between"),
      ico("TbSpaces", "place-content-around", "Around"),
      ico("TbSpace", "place-content-evenly", "Evenly"),
      ico("TbAlignBoxCenterStretch", "place-content-stretch", "Stretch"),
    ],
  },
  placeItems: {
    kind: "radio",
    options: [
      ico("TbLayoutAlignTop", "place-items-start", "Start"),
      ico("TbLayoutAlignMiddle", "place-items-center", "Center"),
      ico("TbLayoutAlignBottom", "place-items-end", "End"),
      ico("TbBaseline", "place-items-baseline", "Baseline"),
      ico("TbAlignBoxCenterStretch", "place-items-stretch", "Stretch"),
    ],
  },
  placeSelf: {
    kind: "radio",
    options: [
      ico("TbSquare", "place-self-auto", "Auto"),
      ico("TbLayoutAlignTop", "place-self-start", "Start"),
      ico("TbLayoutAlignMiddle", "place-self-center", "Center"),
      ico("TbLayoutAlignBottom", "place-self-end", "End"),
      ico("TbAlignBoxCenterStretch", "place-self-stretch", "Stretch"),
    ],
  },
  flexBase: {
    kind: "radio",
    options: [
      { value: "flex-1", text: "Fill", hint: "Grow and shrink to fill remaining space" },
      { value: "flex-auto", text: "Auto", hint: "Size to content; can grow and shrink" },
      { value: "flex-initial", text: "Default", hint: "Size to content; can shrink only" },
      { value: "flex-none", text: "Fixed", hint: "Keep content size; no grow or shrink" },
    ],
  },

  // ── Spacing — shorthand box editors ──
  padding: { kind: "shorthand", allowedTypes: SPACING_TYPES, modes: boxModes("p", "px", "py", "pt", "pr", "pb", "pl") },
  margin: { kind: "shorthand", allowedTypes: SPACING_TYPES, modes: boxModes("m", "mx", "my", "mt", "mr", "mb", "ml") },
  gap: {
    kind: "shorthand",
    allowedTypes: SPACING_TYPES,
    modes: [
      { id: "uniform", icon: "TbSquare", ariaLabel: "Uniform gap", slots: [{ group: "gap", label: "" }] },
      { id: "axes", icon: "TbSpacingHorizontal", ariaLabel: "Gap X & Y", slots: [{ group: "gap-x", prefix: "gap-x", label: "X" }, { group: "gap-y", prefix: "gap-y", label: "Y" }] },
    ],
  },
  inset: {
    kind: "shorthand",
    allowedTypes: OFFSET_TYPES,
    modes: [
      { id: "uniform", icon: "TbSquare", ariaLabel: "Uniform inset", slots: [{ group: "inset", label: "" }] },
      { id: "axes", icon: "TbSpacingHorizontal", ariaLabel: "Inset X & Y", slots: [{ group: "inset-x", prefix: "inset-x", label: "X" }, { group: "inset-y", prefix: "inset-y", label: "Y" }] },
      { id: "sides", icon: "TbBorderInner", ariaLabel: "Per side", columns: 2, slots: [{ group: "top", label: "T" }, { group: "right", label: "R" }, { group: "bottom", label: "B" }, { group: "left", label: "L" }] },
    ],
  },

  // ── Typography ──
  textAlign: {
    kind: "radio",
    options: [
      ico("TbAlignLeft", "text-left", "Left"),
      ico("TbAlignCenter", "text-center", "Center"),
      ico("TbAlignRight", "text-right", "Right"),
      ico("TbAlignJustified", "text-justify", "Justify"),
    ],
  },
  typographyPreset: { kind: "textStyle" },
  fontFamily: { kind: "font" },
  fontSize: { kind: "universal", prefix: "text", options: SIZE_OPTS },
  fontWeight: { kind: "universal", prefix: "font", options: WEIGHT_OPTS, allowedTypes: ["tailwind"] },
  "typography.transform": { kind: "universal", options: TRANSFORM_OPTS, allowedTypes: ["tailwind"] },
  emphasis: {
    kind: "multi-toggle",
    toggles: [
      { group: "font-weight", className: "font-bold", icon: <IconGlyph name="bold" />, tooltip: "Bold" },
      { group: "font-style", className: "italic", icon: <IconGlyph name="italic" />, tooltip: "Italic" },
      { group: "text-decoration", className: "underline", icon: <IconGlyph name="underline" />, tooltip: "Underline" },
      { group: "text-decoration", className: "line-through", icon: <IconGlyph name="strike" />, tooltip: "Strikethrough" },
    ],
  },

  // ── Colour — the real colour picker ──
  color: { kind: "color" },
  background: { kind: "color" },
  borderColor: { kind: "color" },
  "hover.background": { kind: "color" },
  "hover.textColor": { kind: "color" },
  "hover.border": { kind: "color" },
  backgroundGradientFrom: { kind: "color" },
  backgroundGradientVia: { kind: "color" },
  backgroundGradientTo: { kind: "color" },
  shadowColor: { kind: "color" },
  ringColor: { kind: "color" },
  fill: { kind: "color" },
  stroke: { kind: "color" },

  // ── Display / styles value fields ──
  display: { kind: "universal", options: DISPLAY_OPTS, allowedTypes: ["tailwind", "calc"] },
  position: { kind: "universal", options: POSITION_OPTS, allowedTypes: ["tailwind", "calc"] },
  overflow: { kind: "universal", prefix: "overflow", options: OVERFLOW_OPTS, allowedTypes: ["tailwind", "calc"] },

  // ── Size value fields ──
  width: { kind: "universal", prefix: "w", allowedTypes: SIZE_TYPES },
  height: { kind: "universal", prefix: "h", allowedTypes: SIZE_TYPES },
  minWidth: { kind: "universal", prefix: "min-w", allowedTypes: SIZE_TYPES },
  minHeight: { kind: "universal", prefix: "min-h", allowedTypes: SIZE_TYPES },
  maxWidth: { kind: "universal", prefix: "max-w", allowedTypes: SIZE_TYPES },
  maxHeight: { kind: "universal", prefix: "max-h", allowedTypes: SIZE_TYPES },

  // ── Styles value fields ──
  borderRadius: { kind: "universal", prefix: "rounded", options: RADIUS_OPTS, allowedTypes: ["tailwind", "px", "rem"] },
  opacity: { kind: "universal", prefix: "opacity", options: OPACITY_OPTS, allowedTypes: ["tailwind"] },

  // ── Styles bundles (border / ring / shadow) ──
  shadow: {
    kind: "bundle",
    items: [
      { group: "shadow", label: "Size", control: "tiles", prefix: "shadow", options: SHADOW_OPTS, allowedTypes: TW_ONLY },
      { group: "shadow-color", label: "Color", control: "color" },
    ],
  },
  border: {
    kind: "bundle",
    items: [
      { group: "border-width", label: "Width", control: "value", prefix: "border", options: BORDER_WIDTH_OPTS, allowedTypes: TW_ONLY },
      { group: "border-style", label: "Style", control: "value", prefix: "border", options: BORDER_STYLE_OPTS, allowedTypes: TW_ONLY },
      { group: "border-color", label: "Color", control: "color" },
    ],
  },
  ring: {
    kind: "bundle",
    items: [
      { group: "ring-width", label: "Width", control: "value", prefix: "ring", options: RING_WIDTH_OPTS, allowedTypes: ["tailwind", "px"] },
      { group: "ring-color", label: "Color", control: "color" },
      { group: "ring-offset-width", label: "Offset", control: "value", prefix: "ring-offset", options: RING_OFFSET_OPTS, allowedTypes: ["tailwind", "px"] },
    ],
  },

  // ── Effects bundles (transition / transform / filter / backdrop) ──
  transition: {
    kind: "bundle",
    items: [
      { group: "transition", label: "Property", control: "value", prefix: "transition", options: TRANSITION_OPTS, allowedTypes: TW_ONLY },
      { group: "duration", label: "Duration", control: "value", prefix: "duration", options: DURATION_OPTS, allowedTypes: TW_ONLY },
      { group: "ease", label: "Easing", control: "value", prefix: "ease", options: EASE_OPTS, allowedTypes: TW_ONLY },
      { group: "delay", label: "Delay", control: "value", prefix: "delay", options: DELAY_OPTS, allowedTypes: TW_ONLY },
      { group: "will-change", label: "Will-change", control: "value", prefix: "will-change", options: WILL_CHANGE_OPTS, allowedTypes: TW_ONLY },
    ],
  },
  "effects.transform": {
    kind: "bundle",
    items: [
      { group: "transform", label: "GPU", control: "value", prefix: "transform", options: GPU_OPTS, allowedTypes: TW_ONLY },
      { group: "scale", label: "Scale", control: "value", prefix: "scale", options: SCALE_OPTS, allowedTypes: TW_ONLY },
      { group: "scale-x", label: "Scale X", control: "value", prefix: "scale-x", allowedTypes: TW_ONLY },
      { group: "scale-y", label: "Scale Y", control: "value", prefix: "scale-y", allowedTypes: TW_ONLY },
      { group: "rotate", label: "Rotate", control: "value", prefix: "rotate", options: ROTATE_OPTS, allowedTypes: TW_ONLY },
      { group: "translate-x", label: "Translate X", control: "value", prefix: "translate-x", allowedTypes: LEN_TYPES },
      { group: "translate-y", label: "Translate Y", control: "value", prefix: "translate-y", allowedTypes: LEN_TYPES },
      { group: "skew-x", label: "Skew X", control: "value", prefix: "skew-x", options: SKEW_OPTS("x"), allowedTypes: TW_ONLY },
      { group: "skew-y", label: "Skew Y", control: "value", prefix: "skew-y", options: SKEW_OPTS("y"), allowedTypes: TW_ONLY },
      { group: "origin", label: "Origin", control: "value", prefix: "origin", options: ORIGIN_OPTS, allowedTypes: TW_ONLY },
    ],
  },
  filter: {
    kind: "bundle",
    items: [
      { group: "blur", label: "Blur", control: "value", prefix: "blur", options: BLUR_OPTS, allowedTypes: TW_ONLY },
      { group: "brightness", label: "Brightness", control: "value", prefix: "brightness", options: FILTER_SCALE_OPTS("brightness", [0, 50, 75, 90, 100, 110, 125, 150, 200]), allowedTypes: TW_ONLY },
      { group: "contrast", label: "Contrast", control: "value", prefix: "contrast", options: FILTER_SCALE_OPTS("contrast", [0, 50, 75, 100, 125, 150, 200]), allowedTypes: TW_ONLY },
      { group: "grayscale", label: "Grayscale", control: "value", prefix: "grayscale", options: ["grayscale-0", "grayscale"], allowedTypes: TW_ONLY },
      { group: "hue-rotate", label: "Hue rotate", control: "value", prefix: "hue-rotate", options: HUE_OPTS("hue-rotate"), allowedTypes: TW_ONLY },
      { group: "invert", label: "Invert", control: "value", prefix: "invert", options: ["invert-0", "invert"], allowedTypes: TW_ONLY },
      { group: "saturate", label: "Saturate", control: "value", prefix: "saturate", options: FILTER_SCALE_OPTS("saturate", [0, 50, 100, 150, 200]), allowedTypes: TW_ONLY },
      { group: "sepia", label: "Sepia", control: "value", prefix: "sepia", options: ["sepia-0", "sepia"], allowedTypes: TW_ONLY },
    ],
  },
  backdrop: {
    kind: "bundle",
    items: [
      { group: "backdrop-blur", label: "Blur", control: "value", prefix: "backdrop-blur", options: BLUR_OPTS.map((b) => `backdrop-${b}`), allowedTypes: TW_ONLY },
      { group: "backdrop-brightness", label: "Brightness", control: "value", prefix: "backdrop-brightness", options: FILTER_SCALE_OPTS("backdrop-brightness", [0, 50, 75, 90, 100, 110, 125, 150, 200]), allowedTypes: TW_ONLY },
      { group: "backdrop-contrast", label: "Contrast", control: "value", prefix: "backdrop-contrast", options: FILTER_SCALE_OPTS("backdrop-contrast", [0, 50, 75, 100, 125, 150, 200]), allowedTypes: TW_ONLY },
      { group: "backdrop-grayscale", label: "Grayscale", control: "value", prefix: "backdrop-grayscale", options: ["backdrop-grayscale-0", "backdrop-grayscale"], allowedTypes: TW_ONLY },
      { group: "backdrop-saturate", label: "Saturate", control: "value", prefix: "backdrop-saturate", options: FILTER_SCALE_OPTS("backdrop-saturate", [0, 50, 100, 150, 200]), allowedTypes: TW_ONLY },
      { group: "backdrop-opacity", label: "Opacity", control: "value", prefix: "backdrop-opacity", options: OPACITY_OPTS.map((o) => `backdrop-${o}`), allowedTypes: TW_ONLY },
    ],
  },

  // ── Typography bundles (spacing / wrap / decoration) ──
  spacing: {
    kind: "bundle",
    items: [
      { group: "leading", label: "Line height", control: "value", prefix: "leading", options: LEADING_OPTS, allowedTypes: ["tailwind", "px", "rem", "em"] },
      { group: "tracking", label: "Tracking", control: "value", prefix: "tracking", options: TRACKING_OPTS, allowedTypes: ["tailwind", "px", "rem", "em"] },
      { group: "indent", label: "Indent", control: "value", prefix: "indent", options: INDENT_OPTS, allowedTypes: ["tailwind", "px", "rem", "em"] },
    ],
  },
  wrap: {
    kind: "bundle",
    items: [
      { group: "text-wrap", label: "Wrap", control: "value", prefix: "text", options: TEXT_WRAP_OPTS, allowedTypes: TW_ONLY },
      { group: "whitespace", label: "White space", control: "value", prefix: "whitespace", options: WHITESPACE_OPTS, allowedTypes: TW_ONLY },
      { group: "text-overflow", label: "Overflow", control: "value", prefix: "text", options: TEXT_OVERFLOW_OPTS, allowedTypes: TW_ONLY },
      { group: "break", label: "Word break", control: "value", prefix: "break", options: BREAK_OPTS, allowedTypes: TW_ONLY },
    ],
  },
  decoration: {
    kind: "bundle",
    items: [
      { group: "text-decoration", label: "Line", control: "value", prefix: "text-decoration", options: DECO_LINE_OPTS, allowedTypes: TW_ONLY },
      { group: "decoration-style", label: "Style", control: "value", prefix: "decoration", options: DECO_STYLE_OPTS, allowedTypes: TW_ONLY },
      { group: "decoration-color", label: "Color", control: "color" },
      { group: "decoration-thickness", label: "Thickness", control: "value", prefix: "decoration", options: DECO_THICKNESS_OPTS, allowedTypes: ["tailwind", "px"] },
      { group: "underline-offset", label: "Offset", control: "value", prefix: "underline-offset", options: UNDERLINE_OFFSET_OPTS, allowedTypes: ["tailwind", "px"] },
    ],
  },

  // ── Background: gradient + pattern (bespoke controls) ──
  backgroundGradient: { kind: "gradient" },
  bgPattern: { kind: "pattern" },

  // ── Effects: entrance animation preset picker (writes the `data-animate` attribute) ──
  animation: { kind: "animation" },

  // ── Display / box value fields (Tailwind keyword sets, so the dropdown offers every token) ──
  cursor: { kind: "universal", prefix: "cursor", options: CURSOR_OPTS, allowedTypes: TW_ONLY },
  zIndex: { kind: "universal", prefix: "z", options: ["z-0", "z-10", "z-20", "z-30", "z-40", "z-50", "z-auto"], allowedTypes: ["tailwind"] },
  order: { kind: "universal", prefix: "order", options: ["order-first", "order-last", "order-none", "order-1", "order-2", "order-3", "order-4"], allowedTypes: TW_ONLY },
  visibility: { kind: "universal", options: ["visible", "invisible", "collapse"], allowedTypes: TW_ONLY },
  pointerEvents: { kind: "universal", options: ["pointer-events-auto", "pointer-events-none"], allowedTypes: TW_ONLY },
  userSelect: { kind: "universal", options: ["select-none", "select-text", "select-all", "select-auto"], allowedTypes: TW_ONLY },
  float: { kind: "universal", options: ["float-left", "float-right", "float-none", "float-start", "float-end"], allowedTypes: TW_ONLY },
  verticalAlign: { kind: "universal", options: ["align-baseline", "align-top", "align-middle", "align-bottom", "align-text-top", "align-text-bottom", "align-sub", "align-super"], allowedTypes: TW_ONLY },
  fontSmoothing: { kind: "universal", options: ["antialiased", "subpixel-antialiased"], allowedTypes: TW_ONLY },
  resize: { kind: "universal", options: ["resize-none", "resize", "resize-x", "resize-y"], allowedTypes: TW_ONLY },
  touchAction: { kind: "universal", options: ["touch-auto", "touch-none", "touch-manipulation", "touch-pan-x", "touch-pan-y", "touch-pinch-zoom"], allowedTypes: TW_ONLY },
  boxSizing: { kind: "universal", options: ["box-border", "box-content"], allowedTypes: TW_ONLY },
  isolation: { kind: "universal", options: ["isolate", "isolation-auto"], allowedTypes: TW_ONLY },
  columns: { kind: "universal", prefix: "columns", options: ["columns-auto", "columns-1", "columns-2", "columns-3", "columns-4", "columns-5", "columns-6"], allowedTypes: TW_ONLY },
  captionSide: { kind: "universal", options: ["caption-top", "caption-bottom"], allowedTypes: TW_ONLY },
  srOnly: { kind: "universal", options: ["sr-only", "not-sr-only"], allowedTypes: TW_ONLY },
  aspectRatio: { kind: "universal", prefix: "aspect", options: ["aspect-auto", "aspect-square", "aspect-video", "aspect-4/3", "aspect-3/2", "aspect-16/9"], allowedTypes: TW_ONLY },
  textDecoration: { kind: "universal", options: DECO_LINE_OPTS, allowedTypes: TW_ONLY },
  bgClip: { kind: "universal", options: ["bg-clip-border", "bg-clip-padding", "bg-clip-content", "bg-clip-text"], allowedTypes: TW_ONLY },
  backgroundRepeat: { kind: "universal", options: ["bg-repeat", "bg-no-repeat", "bg-repeat-x", "bg-repeat-y", "bg-repeat-round", "bg-repeat-space"], allowedTypes: TW_ONLY },
  backgroundSize: { kind: "universal", options: ["bg-auto", "bg-cover", "bg-contain"], allowedTypes: TW_ONLY },
  backgroundOrigin: { kind: "universal", options: ["bg-origin-border", "bg-origin-padding", "bg-origin-content"], allowedTypes: TW_ONLY },
  backgroundPosition: { kind: "universal", options: ["bg-center", "bg-top", "bg-bottom", "bg-left", "bg-right", "bg-top-left", "bg-top-right", "bg-bottom-left", "bg-bottom-right"], allowedTypes: TW_ONLY },
  backgroundAttachment: { kind: "universal", options: ["bg-fixed", "bg-local", "bg-scroll"], allowedTypes: TW_ONLY },

  // ── Hover variants of the same value fields (the row's `variant` is applied by the binding) ──
  "hover.scale": { kind: "universal", prefix: "scale", options: SCALE_OPTS, allowedTypes: TW_ONLY },
  "hover.shadow": { kind: "universal", prefix: "shadow", options: SHADOW_OPTS, allowedTypes: TW_ONLY },
  "hover.opacity": { kind: "universal", prefix: "opacity", options: OPACITY_OPTS, allowedTypes: TW_ONLY },
  "hover.translateY": { kind: "universal", prefix: "translate-y", allowedTypes: LEN_TYPES },
  "hover.ring": { kind: "universal", prefix: "ring", options: RING_WIDTH_OPTS, allowedTypes: ["tailwind", "px"] },

  // ── More bundles ──
  gridSpan: {
    kind: "bundle",
    items: [
      { group: "col-span", label: "Columns", control: "value", prefix: "col-span", options: ["col-auto", ...[1, 2, 3, 4, 5, 6, 12].map((n) => `col-span-${n}`), "col-span-full"], allowedTypes: TW_ONLY },
      { group: "row-span", label: "Rows", control: "value", prefix: "row-span", options: ["row-auto", ...[1, 2, 3, 4, 6].map((n) => `row-span-${n}`), "row-span-full"], allowedTypes: TW_ONLY },
    ],
  },
  place: {
    kind: "bundle",
    items: [
      { group: "place-items", label: "Items", control: "value", prefix: "place-items", options: ["place-items-start", "place-items-center", "place-items-end", "place-items-baseline", "place-items-stretch"], allowedTypes: TW_ONLY },
      { group: "place-self", label: "Self", control: "value", prefix: "place-self", options: ["place-self-auto", "place-self-start", "place-self-center", "place-self-end", "place-self-stretch"], allowedTypes: TW_ONLY },
    ],
  },
  divide: {
    kind: "bundle",
    items: [
      { group: "divide-width", label: "Width", control: "value", prefix: "divide", options: ["divide-x", "divide-y", "divide-x-2", "divide-y-2", "divide-x-4", "divide-y-4", "divide-x-reverse", "divide-y-reverse"], allowedTypes: TW_ONLY },
      { group: "divide-style", label: "Style", control: "value", prefix: "divide", options: ["divide-solid", "divide-dashed", "divide-dotted", "divide-double", "divide-none"], allowedTypes: TW_ONLY },
      { group: "divide-color", label: "Color", control: "color" },
    ],
  },
  outline: {
    kind: "bundle",
    items: [
      { group: "outline-width", label: "Width", control: "value", prefix: "outline", options: ["outline-0", "outline-1", "outline-2", "outline-4", "outline-8"], allowedTypes: ["tailwind", "px"] },
      { group: "outline-style", label: "Style", control: "value", prefix: "outline", options: ["outline", "outline-solid", "outline-dashed", "outline-dotted", "outline-double", "outline-none", "outline-hidden"], allowedTypes: TW_ONLY },
      { group: "outline-color", label: "Color", control: "color" },
      { group: "outline-offset", label: "Offset", control: "value", prefix: "outline-offset", options: ["outline-offset-0", "outline-offset-1", "outline-offset-2", "outline-offset-4", "outline-offset-8"], allowedTypes: ["tailwind", "px"] },
    ],
  },
  blend: {
    kind: "bundle",
    items: [
      { group: "mix-blend", label: "Mix blend", control: "value", prefix: "mix-blend", options: ["mix-blend-normal", "mix-blend-multiply", "mix-blend-screen", "mix-blend-overlay", "mix-blend-darken", "mix-blend-lighten", "mix-blend-difference", "mix-blend-luminosity"], allowedTypes: TW_ONLY },
      { group: "bg-blend", label: "Background blend", control: "value", prefix: "bg-blend", options: ["bg-blend-normal", "bg-blend-multiply", "bg-blend-screen", "bg-blend-overlay", "bg-blend-darken", "bg-blend-lighten", "bg-blend-difference", "bg-blend-luminosity"], allowedTypes: TW_ONLY },
    ],
  },
  break: {
    kind: "bundle",
    items: [
      { group: "break-before", label: "Before", control: "value", prefix: "break-before", options: ["break-before-auto", "break-before-avoid", "break-before-all", "break-before-page", "break-before-column"], allowedTypes: TW_ONLY },
      { group: "break-inside", label: "Inside", control: "value", prefix: "break-inside", options: ["break-inside-auto", "break-inside-avoid", "break-inside-avoid-page", "break-inside-avoid-column"], allowedTypes: TW_ONLY },
      { group: "break-after", label: "After", control: "value", prefix: "break-after", options: ["break-after-auto", "break-after-avoid", "break-after-all", "break-after-page", "break-after-column"], allowedTypes: TW_ONLY },
    ],
  },
  list: {
    kind: "bundle",
    items: [
      { group: "list-style-type", label: "Marker", control: "value", prefix: "list", options: ["list-none", "list-disc", "list-decimal"], allowedTypes: TW_ONLY },
      { group: "list-style-position", label: "Position", control: "value", prefix: "list", options: ["list-inside", "list-outside"], allowedTypes: TW_ONLY },
    ],
  },
  table: {
    kind: "bundle",
    items: [
      { group: "table-layout", label: "Layout", control: "value", prefix: "table", options: ["table-auto", "table-fixed"], allowedTypes: TW_ONLY },
      { group: "caption", label: "Caption", control: "value", prefix: "caption", options: ["caption-top", "caption-bottom"], allowedTypes: TW_ONLY },
    ],
  },
  svg: {
    kind: "bundle",
    items: [
      { group: "fill", label: "Fill", control: "color" },
      { group: "stroke", label: "Stroke", control: "color" },
      { group: "stroke-width", label: "Stroke width", control: "value", prefix: "stroke", options: ["stroke-0", "stroke-1", "stroke-2"], allowedTypes: ["tailwind", "px"] },
    ],
  },
};

export const controlSpecFor = (id: string): ControlSpec | undefined => CONTROL_SPECS[id];

// Re-export so the dispatch can draw a radio option's icon.
export { ControlIcon };
