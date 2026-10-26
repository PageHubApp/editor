// Pure viewport math: breakpoint widths, canvas widths, device frames, fit zoom, scope band.
/**
 * Pure viewport math: breakpoint widths, the canvas width for a view, device frames, the fit
 * zoom, the edge-handle drag and the scope band's text and colour.
 */
import type { Breakpoint, View } from "@pagehub/engine/kits";
import { DEFAULT_BREAKPOINT_PX as BREAKPOINT_PX } from "@pagehub/engine/kits";

export type BreakpointWidths = Readonly<Record<Breakpoint, number>>;
const MOBILE_PX = 390;
export const BREAKPOINT_ORDER: readonly Breakpoint[] = ["sm", "md", "lg", "xl", "2xl"];
interface ViewChip {
  view: View;
  label: string;
  px: number;
}
/** Switcher chips, in order, at the site's breakpoint widths. */
export function viewChips(bp: BreakpointWidths = BREAKPOINT_PX): ViewChip[] {
  return [{ view: "mobile", label: "Mobile", px: MOBILE_PX }, ...BREAKPOINT_ORDER.map((b) => ({ view: b as View, label: b === "2xl" ? "2XL" : b.toUpperCase(), px: bp[b] }))];
}
export const VIEW_CHIPS: readonly ViewChip[] = viewChips();

/** Phone models for the device frame (the last one is "Custom"). */
export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  dpr: number;
  /** Turned on its side: width and height are swapped from the preset's. The name stays the preset's. */
  landscape?: boolean;
}
export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { name: "iPhone 12 Pro", width: 390, height: 844, dpr: 3 },
  { name: "iPhone 12 Pro Max", width: 428, height: 926, dpr: 3 },
  { name: "iPhone SE", width: 375, height: 667, dpr: 2 },
  { name: "iPhone 13 Mini", width: 375, height: 812, dpr: 3 },
  { name: "iPhone 14", width: 390, height: 844, dpr: 3 },
  { name: "iPhone 14 Pro", width: 393, height: 852, dpr: 3 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932, dpr: 3 },
  { name: "Pixel 5", width: 393, height: 851, dpr: 2.75 },
  { name: "Pixel 7", width: 412, height: 915, dpr: 2.625 },
  { name: "Samsung Galaxy S21", width: 360, height: 800, dpr: 3 },
  { name: "Samsung Galaxy S22", width: 360, height: 780, dpr: 3 },
  { name: "iPad Mini", width: 744, height: 1133, dpr: 2 },
  { name: "iPad Air", width: 820, height: 1180, dpr: 2 },
  { name: 'iPad Pro 11"', width: 834, height: 1194, dpr: 2 },
  // iPhone Duo: Apple's App Store Connect screenshot sizes (1398x2034, 2007x2853) at 3x; Apple publishes no point sizes.
  { name: "iPhone Duo outer", width: 466, height: 678, dpr: 3 },
  { name: "iPhone Duo inner", width: 669, height: 951, dpr: 3 },
  { name: "Custom", width: 375, height: 667, dpr: 2 },
];
/** The same device turned a quarter: width and height swap, the name (and "Custom") stays. */
export function rotatedPreset(p: DevicePreset): DevicePreset {
  return { ...p, width: p.height, height: p.width, landscape: !p.landscape };
}
const MIN_CANVAS = 240;
const MAX_CANVAS = 3840;
/** Dotted, non-interactive device guide lines. */
export const DEVICE_GUIDES = [375, 390, 430, 768, 1024, 1440] as const;

/** `desktop` (fluid) on a wide window, else `mobile`. */
export function defaultView(windowWidth: number): View {
  return windowWidth < 768 ? "mobile" : "desktop";
}

/** The canvas width a view asks for (null = fluid desktop); an edge-drag override wins. */
export function viewWidth(view: View, override: number | null = null, bp: BreakpointWidths = BREAKPOINT_PX): number | null {
  if (override != null) return override;
  if (view === "desktop") return null;
  return view === "mobile" ? MOBILE_PX : bp[view];
}

/**
 * Canvas box style: responsive caps at the width; otherwise exact with horizontal scroll. The box
 * holds the iframe inside a CSS `zoom`, so its outer (screen) width is `width * zoom`: the iframe's
 * own CSS viewport is then exactly `width`, and the site's `@media` queries fire at the real breakpoints.
 */
export function canvasBoxStyle(width: number | null, responsive: boolean, zoom = 1): { maxWidth?: string; width?: string; overflowX?: "auto" } {
  if (width == null) return {};
  const outer = Math.round(width * (zoom || 1) * 100) / 100;
  return responsive ? { maxWidth: `min(100%, ${outer}px)`, width: "100%" } : { width: `${outer}px`, overflowX: "auto" };
}

/** Edge handles change width by twice the delta (both sides move), divided by zoom, clamped. */
export function edgeDragWidth(start: number, dx: number, zoom: number, side: "left" | "right"): number {
  const delta = ((side === "right" ? dx : -dx) * 2) / (zoom || 1);
  return Math.round(Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, start + delta)));
}

type DeviceKind = "phone" | "tablet" | "laptop" | "monitor";
export interface DeviceFrame {
  kind: DeviceKind;
  innerWidth: number;
  innerHeight: number;
  bezelX: number;
  bezelY: number;
  radius: { outer: string; inner: string };
  padding: { top: number; right: number; bottom: number; left: number };
  decoration: "notch" | "camera-top" | "camera-side" | "laptop-chin" | "monitor-stand";
}

const FRAME_BY_VIEW: Record<string, DeviceKind> = { mobile: "phone", sm: "phone", md: "tablet", lg: "tablet", xl: "laptop", "2xl": "monitor" };

export function deviceFrame(view: View, bp: Readonly<Record<Breakpoint, number>> = BREAKPOINT_PX, customPhone?: { width: number; height: number }): DeviceFrame {
  const kind = FRAME_BY_VIEW[view] ?? "phone";
  if (kind === "phone") {
    return {
      kind,
      innerWidth: customPhone?.width ?? (view === "sm" ? bp.sm : MOBILE_PX),
      innerHeight: customPhone?.height ?? (view === "sm" ? 1024 : 844),
      bezelX: 18, bezelY: 18,
      radius: { outer: "rounded-[44px]", inner: "rounded-[38px]" },
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
      decoration: "notch",
    };
  }
  if (kind === "tablet") {
    const landscape = view === "lg";
    return {
      kind,
      innerWidth: landscape ? bp.lg : bp.md,
      innerHeight: landscape ? 768 : 1024,
      bezelX: 30, bezelY: 30,
      radius: { outer: "rounded-[28px]", inner: "rounded-[16px]" },
      padding: { top: 14, right: 15, bottom: 14, left: 15 },
      decoration: landscape ? "camera-side" : "camera-top",
    };
  }
  if (kind === "laptop") {
    return {
      kind, innerWidth: bp.xl, innerHeight: 800, bezelX: 24, bezelY: 48,
      radius: { outer: "rounded-t-[14px] rounded-b-[20px]", inner: "rounded-[5px]" },
      padding: { top: 14, right: 12, bottom: 32, left: 12 },
      decoration: "laptop-chin",
    };
  }
  return {
    kind, innerWidth: bp["2xl"], innerHeight: 864, bezelX: 24, bezelY: 56,
    radius: { outer: "rounded-[10px]", inner: "rounded-[3px]" },
    padding: { top: 14, right: 12, bottom: 40, left: 12 },
    decoration: "monitor-stand",
  };
}

type FitMode =
  | { kind: "both"; targetW: number; targetH: number; offsetW: number; offsetH: number; max: number }
  | { kind: "width"; target: number; offset: number; max: number };

/** Fit targets: device → both axes, offset 220, max 1; breakpoint → its width, offset 420, max 1. */
export function fitModeFor(view: View, device: boolean, bp: BreakpointWidths = BREAKPOINT_PX, phone?: { width: number; height: number }): FitMode {
  if (device) {
    const f = deviceFrame(view, bp, phone);
    return { kind: "both", targetW: f.innerWidth + f.bezelX, targetH: f.innerHeight + f.bezelY, offsetW: 220, offsetH: 220, max: 1 };
  }
  const target = viewWidth(view, null, bp);
  // The fluid desktop view has no width to fit: it fills the window, so it stays at 100% (a smaller zoom would only
  // lay the page out at a wider viewport than the window, spreading its absolutely placed pieces).
  if (target == null) return { kind: "width", target: 1, offset: 0, max: 1 };
  return { kind: "width", target, offset: 420, max: 1 };
}

/** Below this pane width the editor is a phone-sized window: the margins fit-to-window leaves would eat the whole pane. */
const NARROW_PANE = 640;
const NARROW_GUTTER = 32;

/**
 * The fit zoom for the editor's own box, clamped to ≥ 0.25 and ≤ the mode's max. The width margin (420 / 220 / 48)
 * is room for a wide pane's chrome around the frame; a pane narrower than `NARROW_PANE` keeps only a small gutter,
 * so a 390-px window fits a 390-px view at ~92% instead of collapsing to the 0.25 floor.
 */
export function fitZoom(mode: FitMode, rootWidth: number, rootHeight: number): number {
  const narrow = (offset: number) => (rootWidth < NARROW_PANE ? Math.min(offset, NARROW_GUTTER) : offset);
  const z = mode.kind === "both" ? Math.min((rootWidth - narrow(mode.offsetW)) / mode.targetW, (rootHeight - mode.offsetH) / mode.targetH) : (rootWidth - narrow(mode.offset)) / mode.target;
  return Math.max(0.25, Math.min(mode.max, z));
}

const BAND_COLOR: Readonly<Record<string, string>> = {
  base: "#64748b", sm: "#0ea5e9", md: "#10b981", lg: "#8b5cf6", xl: "#ec4899", "2xl": "#f43f5e", multi: "#f59e0b",
};

export interface ScopeBand {
  color: string;
  /** Text colour with the best contrast on `color`. */
  text: string;
  /** What is being edited: "Editing Base", "Editing SM", "Editing MD + LG". */
  head: string;
  /** What that means for the next change. */
  detail: string;
  label: string;
  /** Multi-scope band: show Clear. */
  clearable: boolean;
}

const bpLabel = (bp: string) => (bp === "2xl" ? "2XL" : bp.toUpperCase());

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const DARK_TEXT = "#0f172a";
/** White or near-black, whichever reads better on the band colour. */
export function textOn(hex: string): string {
  const l = luminance(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminance(DARK_TEXT) + 0.05) ? "#ffffff" : DARK_TEXT;
}

/** The 22px band above the canvas: which layer the next write targets. Multi-scope wins. */
export function scopeBand(view: View, multiScope: readonly Breakpoint[], bp: Readonly<Record<Breakpoint, number>> = BREAKPOINT_PX): ScopeBand {
  if (multiScope.length) {
    const targets = BREAKPOINT_ORDER.filter((b) => multiScope.includes(b));
    const summary = targets.map(bpLabel).join(" + ");
    const color = targets.length === 1 ? BAND_COLOR[targets[0]!]! : BAND_COLOR.multi!;
    return {
      color,
      text: textOn(color),
      head: `Editing ${summary}`,
      detail: "changes go to these sizes, whatever the canvas shows",
      label: `Multi-scope editing — writes target ${summary}, not the canvas view. Overrides Base at those widths.`,
      clearable: true,
    };
  }
  if (view === "desktop" || view === "mobile") {
    return { color: BAND_COLOR.base!, text: textOn(BAND_COLOR.base!), head: "Editing Base", detail: "changes apply to all sizes", label: "Editing Base — applies to all sizes. Override per breakpoint with S, M, L, XL, or 2XL.", clearable: false };
  }
  const size = `${bp[view]}px and up`;
  return {
    color: BAND_COLOR[view]!,
    text: textOn(BAND_COLOR[view]!),
    head: `Editing ${bpLabel(view)}`,
    detail: `${size} · changes here override Base`,
    label: `Editing ${bpLabel(view)} breakpoint — ${size}. Overrides Base from this width and up.`,
    clearable: false,
  };
}

/** Breakpoint marker drag: stays between its neighbours (±1) and inside 240–3840. */
export function clampMarker(bp: Breakpoint, px: number, values: Readonly<Record<Breakpoint, number>>): number {
  const i = BREAKPOINT_ORDER.indexOf(bp);
  const lo = i > 0 ? values[BREAKPOINT_ORDER[i - 1]!] + 1 : MIN_CANVAS;
  const hi = i < BREAKPOINT_ORDER.length - 1 ? values[BREAKPOINT_ORDER[i + 1]!] - 1 : MAX_CANVAS;
  return Math.round(Math.min(hi, Math.max(lo, Math.max(MIN_CANVAS, Math.min(MAX_CANVAS, px)))));
}
