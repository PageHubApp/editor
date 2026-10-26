/**
 * The site's colour palette as the picker's Design System list reads and writes it: the live light
 * palette from `theme.css` (declared `--color-<name>` overrides plus the DaisyUI defaults for the
 * structural tokens, then any custom tokens), and create / rename / recolour / delete writers that
 * go through the SAME `theme.css` seam the Theme panel's colour rows use (`useThemeValues`), so one
 * edit is one undo step and the canvas re-themes live.
 *
 * The one source is `theme.css`, so a palette token is a `--color-<name>` custom property (written
 * into the `@theme` block, so Tailwind emits `bg-<name>` / `text-<name>` for it, same as the
 * structural tokens).
 */
import { themeColorsFacet, type ThemeColor, type ThemeColors } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { PALETTE_TOKENS, THEME_FILE } from "./themeModel";
import { parseThemePalette } from "./themePalette";
import { useThemeValues } from "./useThemeValues";

/** A palette name as a CSS-var slug / class suffix: lowercase, spaces → `-`, invalid chars dropped. */
function paletteSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface PaletteTokenApi {
  /** The live light palette: declared `--color-*` overrides + the DaisyUI defaults + custom tokens. */
  tokens: ThemeColor[];
  /** Light + dark palettes in the shape the colour picker reads. */
  theme: ThemeColors;
  /** Add a token; returns its slug. */
  create(name: string, color: string): string;
  /** Rename / recolour `originalName` in ONE undo step; returns the (possibly new) slug. */
  update(originalName: string, name: string, color: string): string;
  /** Remove a token (a structural default reverts to its DaisyUI value). */
  remove(name: string): void;
}

export function usePaletteTokens(): PaletteTokenApi {
  const css = useEditorState((s) => s.files.get(THEME_FILE));
  const facet = useEditorState((s) => s.facet(themeColorsFacet));
  const { setVar, setVars } = useThemeValues();

  // Default hexes for the structural DaisyUI tokens (the swatch fallback when undeclared).
  const defaults = new Map(facet.light().map((c) => [c.name, c.color]));
  const parsed = parseThemePalette(css, PALETTE_TOKENS.map((t) => t.name));
  const build = (declared: Map<string, string>): ThemeColor[] => {
    const out: ThemeColor[] = PALETTE_TOKENS.map((t) => ({ name: t.name, color: declared.get(t.name) ?? defaults.get(t.name) ?? "" }));
    const seen = new Set(out.map((t) => t.name));
    for (const [name, color] of declared) if (!seen.has(name)) out.push({ name, color });
    return out;
  };
  const tokens = build(parsed.light);
  const darkTokens = build(parsed.dark);
  const theme: ThemeColors = { light: () => tokens, dark: () => darkTokens };

  const create = (name: string, color: string) => {
    const slug = paletteSlug(name) || "color";
    setVar(`--color-${slug}`, color);
    return slug;
  };
  const update = (originalName: string, name: string, color: string) => {
    const slug = paletteSlug(name) || originalName;
    if (slug !== originalName) setVars([[`--color-${originalName}`, null], [`--color-${slug}`, color]]);
    else setVar(`--color-${slug}`, color);
    return slug;
  };
  const remove = (name: string) => setVar(`--color-${name}`, null);

  return { tokens, theme, create, update, remove };
}
