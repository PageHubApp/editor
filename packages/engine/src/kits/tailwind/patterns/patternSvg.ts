/**
 * One pattern → the SVG data URI painted as `background-image`. The library stores each colour layer's
 * path joined with `~`; colours, stroke, zoom, angle, spacing and offset are baked into the SVG.
 */
export interface PatternDef {
  title: string;
  slug: string;
  mode: "stroke" | "fill" | "stroke-join";
  /** Colour layers including the background; `colors - 1` are paintable. */
  colors: number;
  maxStroke: number;
  maxScale: number;
  maxSpacing: [number, number];
  width: number;
  height: number;
  vHeight: number;
  path: string;
}

export interface PatternParams {
  /** User colours 1..colors-1 (any CSS colour); missing ones paint nothing. */
  colors?: (string | undefined)[];
  stroke?: number;
  zoom?: number;
  angle?: number;
  spacingX?: number;
  spacingY?: number;
  x?: number;
  y?: number;
}

const RGBA = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*(?:\.\d+)?)\s*\)$/;

/** `rgba()` becomes `hsla()` with the usual hex-to-HSL conversion; other colours pass through. */
export function toSvgColor(c: string): string {
  const m = RGBA.exec(c);
  if (!m) return c;
  const r = +m[1]! / 255, g = +m[2]! / 255, b = +m[3]! / 255;
  const min = Math.min(r, g, b), max = Math.max(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  const l = +(((max + min) / 2) * 100).toFixed(1);
  const s = +((d === 0 ? 0 : d / (1 - Math.abs(2 * ((max + min) / 2) - 1))) * 100).toFixed(1);
  return `hsla(${h},${s}%,${l}%,${m[4]})`;
}

/** Only colours that cannot break out of the single-quoted SVG attribute. */
const SAFE_COLOR = /^[a-zA-Z0-9#%.,() \-/]+$/;

export function patternSvg(p: PatternDef, params: PatternParams = {}): string {
  const { mode, width, height, colors: maxColors } = p;
  const stroke = params.stroke || 1;
  const scale = params.zoom || 1;
  const angle = params.angle || 0;
  const spacing: [number, number] = [params.spacingX || 0, params.spacingY || 0];
  const moveLeft = params.x || 0;
  const moveTop = params.y || 0;
  const user = Array.from({ length: Math.max(maxColors - 1, 0) }, (_, i) => params.colors?.[i])
    .filter((c): c is string => !!c && SAFE_COLOR.test(c))
    .map(toSvgColor);
  const co = ["transparent", "transparent", ...user];
  const layers = p.path.split("~");

  const layer = (i: number): string => {
    const color = co[i + 1];
    const paint = mode === "fill" ? ` stroke='none' fill='${color || "white"}'` : ` stroke='${color ?? "none"}' fill='none'`;
    const join = mode === "stroke-join" ? "stroke-linecap='square' " : "";
    return layers[i]!.replace("/>", ` transform='translate(${spacing[0] / 2},0)' ${join}stroke-width='${stroke}'${paint}/>`).replace("transform='translate(0,0)' ", " ");
  };

  let group = "";
  for (let i = 0; i < maxColors - 1; i++) group += layer(i);
  const svg =
    `<svg id='patternId' width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'><defs>` +
    `<pattern id='a' patternUnits='userSpaceOnUse' width='${width + spacing[0]}' height='${height + spacing[1]}' patternTransform='scale(${scale}) rotate(${angle})'>` +
    `<rect x='0' y='0' width='100%' height='100%' fill='${co[0] || "white"}'/>${group}</pattern></defs>` +
    `<rect width='800%' height='800%' transform='translate(${scale * moveLeft},${scale * moveTop})' fill='url(#a)'/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
