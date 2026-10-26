/**
 * Colour refs: the one string the colour picker reads and writes.
 *
 *   `palette:primary`  a theme token        `blue-500`    a Tailwind shade
 *   `white` `black` `transparent`           `#3b82f6` `#3b82f680`   hex
 *   `rgba(59,130,246,0.5)`                  `""`          no colour
 *
 * The connector turns a ref into a class token (`bg-primary`, `bg-[#3b82f6]`) and back.
 */
import type { ThemeColor } from "@pagehub/engine/host";
import { TAILWIND_COLOR_VALUES } from "./tailwindColors.data";

export const SPECIAL_COLORS = [
  { name: "White", value: "white", hex: "#ffffff" },
  { name: "Black", value: "black", hex: "#000000" },
  { name: "Transparent", value: "transparent", hex: "transparent" },
] as const;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(/i;
const SHADE = /^([a-z]+)-(\d{2,3})$/;

/** A CSS colour for a swatch (`""` when the ref has none). */
export function refToCss(ref: string, palette: readonly ThemeColor[] = []): string {
  if (!ref) return "";
  if (ref.startsWith("palette:")) {
    const name = ref.slice(8);
    return palette.find((p) => p.name === name)?.color ?? `var(--color-${name})`;
  }
  const special = SPECIAL_COLORS.find((s) => s.value === ref);
  if (special) return special.hex;
  const m = SHADE.exec(ref);
  if (m) return TAILWIND_COLOR_VALUES[m[1]!]?.[m[2]!] ?? "";
  return HEX.test(ref) || RGB.test(ref) ? ref : "";
}

/** The class token for a ref under a class prefix (`bg`, `text`, `border`…). `""` clears. */
export function refToToken(prefix: string, ref: string): string {
  if (!ref) return "";
  if (ref.startsWith("palette:")) return `${prefix}-${ref.slice(8)}`;
  if (HEX.test(ref) || RGB.test(ref)) return `${prefix}-[${ref.replace(/\s+/g, "")}]`;
  return `${prefix}-${ref}`;
}

/** The ref a class token stands for (opacity suffix dropped); `""` when it has no colour. */
export function tokenToRef(prefix: string, token: string, palette: readonly ThemeColor[] = []): string {
  if (!token.startsWith(`${prefix}-`)) return "";
  const body = token.slice(prefix.length + 1).replace(/\/(?:\d+|\[[^\]]+\])$/, "");
  const arb = /^\[(.+)\]$/.exec(body);
  if (arb) return HEX.test(arb[1]!) || RGB.test(arb[1]!) ? arb[1]! : "";
  if (SPECIAL_COLORS.some((s) => s.value === body) || (SHADE.test(body) && TAILWIND_COLOR_VALUES[body.replace(/-\d+$/, "")])) return body;
  return palette.some((p) => p.name === body) || /^[a-z][a-z0-9-]*$/.test(body) ? `palette:${body}` : "";
}

/** The class prefix a colour class group writes (`bg-color` → `bg`, `gradient-from` → `from`). */
export function colorPrefix(group: string): string {
  const special: Record<string, string> = { "gradient-from": "from", "gradient-via": "via", "gradient-to": "to" };
  return special[group] ?? group.replace(/-color$/, "");
}

export function isTranslucent(ref: string): boolean {
  const css = ref.startsWith("rgba(") ? ref : "";
  const a = css ? Number(css.replace(/\s+/g, "").split(",")[3]?.replace(")", "")) : 1;
  return ref === "transparent" || (Number.isFinite(a) && a < 1) || (HEX.test(ref) && ref.length === 9);
}

/** `#rrggbb` from a ref's CSS when it is a plain hex (the hex field's text). */
export function hexOf(ref: string): string {
  return /^#[0-9a-f]{6}$/i.test(ref) ? ref : /^#[0-9a-f]{8}$/i.test(ref) ? ref.slice(0, 7) : "";
}

export const CHECKER_BG = {
  backgroundImage: "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 4px 4px",
} as const;
