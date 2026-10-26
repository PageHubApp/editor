/**
 * The site's text styles as the inspector's "Text style" picker offers them: one per typography
 * token declared by the theme (Heading, Body, and Accent when `--font-accent` is set in
 * `theme.css`), applied as that token's font-family class (`font-heading`), plus whatever a host
 * adds through `typographyPresetsFacet` (multi-class styles like `font-heading text-3xl`).
 *
 *   typographyPresets(themeCss, hostPresets) // → [{ name: "Heading", className: "font-heading", fontFamily }]
 */
import { readTheme, readThemeVar } from "./themeModel";

export interface TextStyle {
  name: string;
  /** Space-separated class tokens the style writes. */
  className: string;
  fontFamily?: string;
}

const ACCENT_VAR = "--font-accent";

export function typographyPresets(css: string | undefined, host: readonly TextStyle[] = []): TextStyle[] {
  const { fonts } = readTheme(css);
  const out: TextStyle[] = [
    { name: "Heading", className: "font-heading", ...(fonts.heading ? { fontFamily: fonts.heading } : {}) },
    { name: "Body", className: "font-body", ...(fonts.body ? { fontFamily: fonts.body } : {}) },
  ];
  const accent = readThemeVar(css, ACCENT_VAR);
  if (accent) out.push({ name: "Accent", className: "font-accent", fontFamily: accent.split(",")[0]!.trim().replace(/^["']|["']$/g, "") });
  return [...out, ...host.filter((h) => !out.some((o) => o.name === h.name))];
}

/** The style whose tokens are all on the element (the one with the most tokens wins), or null. */
export function activeTextStyle(styles: readonly TextStyle[], classes: readonly string[]): TextStyle | null {
  let best: TextStyle | null = null;
  let bestN = 0;
  for (const s of styles) {
    const toks = s.className.split(/\s+/).filter(Boolean);
    if (toks.length > bestN && toks.every((t) => classes.includes(t))) [best, bestN] = [s, toks.length];
  }
  return best;
}
