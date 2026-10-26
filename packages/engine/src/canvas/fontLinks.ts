/**
 * Web-font loading for a site's theme. A bundle's `theme.css` pulls its Google Fonts with an
 * `@import`, which the browser only discovers after it has parsed that stylesheet, and which a
 * rewritten canvas document drops and re-fetches. `splitThemeFonts` lifts those imports out so
 * they can be emitted as early `<link>` tags (with preconnect) at the top of the document head.
 */
import { escapeAttr } from "../runtime/escape";

const FONT_IMPORT = /@import\s+(?:url\(\s*)?(['"]?)(https:\/\/fonts\.googleapis\.com\/[^'")\s]+)\1\s*\)?[^;]*;/g;

export interface ThemeFonts {
  /** The theme CSS with the font `@import`s removed. */
  css: string;
  /** The font stylesheet URLs that were imported. */
  urls: string[];
}

export function splitThemeFonts(css: string): ThemeFonts {
  const urls: string[] = [];
  const rest = css.replace(FONT_IMPORT, (_m, _q, url: string) => {
    urls.push(url.replace(/&amp;/g, "&"));
    return "";
  });
  return { css: rest, urls };
}

/** One `@font-face` rule of a font stylesheet, read apart. */
export interface ParsedFontFace {
  /** The whole `@font-face { … }` rule, as written. */
  css: string;
  /** The `/* latin *\/` comment Google Fonts puts before each rule (`latin`, `latin-ext`, `cyrillic`, …), else null. */
  subset: string | null;
  family: string | null;
  style: string | null;
  weight: string | null;
  display: string | null;
  unicodeRange: string | null;
  /** Every `url(…)` in `src`, in order, with its `format(…)` when given. */
  sources: Array<{ url: string; format: string | null }>;
}

const FACE = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?(@font-face\s*\{[^}]*\})/g;
const SRC_URL = /url\(\s*(['"]?)([^)'"]+)\1\s*\)(?:\s*format\(\s*(['"]?)([^)'"]+)\3\s*\))?/g;

function declaration(rule: string, name: string): string | null {
  const m = new RegExp(`(?:^|[{;\\s])${name}\\s*:\\s*([^;}]+)`, "i").exec(rule);
  return m ? m[1]!.trim().replace(/^(['"])(.*)\1$/, "$2") : null;
}

/**
 * Every `@font-face` rule in a font stylesheet (the CSS Google Fonts answers with, or a site's own), with
 * the fields a host needs to localize it: which subset, which weight, where the files are. The rule text
 * is kept as written so a host can rewrite one `url(…)` and emit the rest unchanged. A rule without a
 * subset comment is still returned (`subset: null`).
 */
export function parseFontFaces(css: string): ParsedFontFace[] {
  const out: ParsedFontFace[] = [];
  for (const m of css.matchAll(FACE)) {
    const rule = m[2]!;
    const src = declaration(rule, "src") ?? "";
    out.push({
      css: rule,
      subset: m[1] ?? null,
      family: declaration(rule, "font-family"),
      style: declaration(rule, "font-style"),
      weight: declaration(rule, "font-weight"),
      display: declaration(rule, "font-display"),
      unicodeRange: declaration(rule, "unicode-range"),
      sources: [...src.matchAll(SRC_URL)].map((u) => ({ url: u[2]!.trim(), format: u[4]?.trim() ?? null })),
    });
  }
  return out;
}

/**
 * A metric-matched fallback for a web font: a local system face scaled and shifted to occupy the same box
 * as the web font, so the swap does not move the layout. The host computes the numbers (from the font's
 * `hhea` / `OS/2` tables); the engine only writes the rule.
 */
export interface FallbackFace {
  /** The web font's family; the fallback is named `"<family> Fallback"`. */
  family: string;
  /** System fonts to try, in order (`["Arial"]`, `["Times New Roman"]`). */
  local: readonly string[];
  /** Percentages, e.g. `107.4` for `107.4%`. */
  sizeAdjust: number;
  ascentOverride: number;
  descentOverride: number;
  lineGapOverride: number;
}

export const fallbackFamily = (family: string) => `${family} Fallback`;

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
const cssString = (s: string) => `"${s.replace(/["\\\n<]/g, "")}"`;

export function fallbackFaceCss(f: FallbackFace): string {
  return (
    `@font-face{font-family:${cssString(fallbackFamily(f.family))};src:${f.local.map((l) => `local(${cssString(l)})`).join(",")};` +
    `size-adjust:${pct(f.sizeAdjust)};ascent-override:${pct(f.ascentOverride)};descent-override:${pct(f.descentOverride)};line-gap-override:${pct(f.lineGapOverride)}}`
  );
}

/** Same-origin `@font-face` CSS plus the faces to preload, as produced by the host's font localizer. */
export interface LocalFonts {
  css: string;
  preload: readonly string[];
  /** Metric-matched fallbacks for the faces above (emitted after `css`, in the same `<style>`). */
  fallbacks?: readonly FallbackFace[];
}

/**
 * The head tags that load a site's fonts, for the top of `<head>`. Given `local` (self-hosted copies) it
 * preloads the above-the-fold `woff2` files and inlines the `@font-face` rules, so the faces are fetched in
 * parallel with the page and need no third-party round trip. Without it (offline / no host support) it falls
 * back to a preconnect + the remote stylesheet `<link>`s. Empty when there are no fonts.
 */
export function fontHeadTags(urls: readonly string[], local?: LocalFonts | null): string {
  if (!urls.length) return "";
  if (local && local.css) {
    return (
      local.preload.map((h) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${escapeAttr(h)}">`).join("") +
      `<style data-site-font>${local.css}${(local.fallbacks ?? []).map(fallbackFaceCss).join("")}</style>`
    );
  }
  return (
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    urls.map((u) => `<link rel="stylesheet" data-site-font href="${escapeAttr(u)}">`).join("")
  );
}
