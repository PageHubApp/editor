/**
 * The site theme as CSS custom properties in `theme.css` — new declarations go in `:root`, the
 * block `theme.setBreakpoint` writes to (themeBreakpoints.ts) and the published stylesheet reads,
 * so the canvas, the published site and this panel read one source. The Theme panel edits the
 * palette (`--color-*`), the corner radii (`--radius-*`), the spacing density (`--spacing-density`,
 * a unitless multiplier of every `space-*` token: `py-space-lg`, `gap-space-sm`), the
 * heading / body fonts (`--font-heading` / `--font-body`), a dark-mode palette variant
 * (`--color-dark-*`), the style-guide tokens (depth / noise / shadow / border / input + link
 * colours) and the responsive breakpoint widths (`--ph-bp-*`).
 *
 * Reading is a plain scan (`readThemeVar`); writing reuses the breakpoint file's set/remove
 * splice logic generalised to any variable (`setThemeVar`), so one edit is one undo step. Live
 * reflection is the job of `CanvasStyleBridge`, which turns these values into scoped CSS.
 *
 * ── Theme slices → CSS variables ──────────────────────────────────────────────────────────────
 * The theme has no node-tree prop — the one source is `theme.css` — so each slice (palette,
 * dark palette, style guide, typography) is mapped onto a CSS custom property here:
 *   palette entry        → `--color-<token>`            (light)
 *   dark palette entry   → `--color-dark-<token>`       (dark; emitted under the dark scope)
 *   style-guide key      → `--<toCSSVarName(key)>`       (e.g. inputBorderColor → --input-border-color)
 *   typography[Heading]  → `--font-heading` / `--heading-*`
 */
import { addRootDecl, THEME_FILE } from "@pagehub/engine/kits";

export { THEME_FILE };

interface PaletteToken {
  /** DaisyUI token, used in classes as `bg-<name>` and as the var `--color-<name>`. */
  name: string;
  label: string;
}

/** The palette rows the panel shows, paired content colours next to their surface. */
export const PALETTE_TOKENS: readonly PaletteToken[] = [
  { name: "primary", label: "Primary" },
  { name: "primary-content", label: "On primary" },
  { name: "secondary", label: "Secondary" },
  { name: "secondary-content", label: "On secondary" },
  { name: "accent", label: "Accent" },
  { name: "accent-content", label: "On accent" },
  { name: "neutral", label: "Neutral" },
  { name: "neutral-content", label: "On neutral" },
  { name: "base-100", label: "Base 100" },
  { name: "base-200", label: "Base 200" },
  { name: "base-300", label: "Base 300" },
  { name: "base-content", label: "Base content" },
];

interface RadiusKey {
  /** CSS var suffix (`--radius-<key>`). */
  key: string;
  label: string;
  /** DaisyUI default, shown when the site has no override (rem). */
  fallback: number;
}

export const RADIUS_KEYS: readonly RadiusKey[] = [
  { key: "box", label: "Boxes", fallback: 0.5 },
  { key: "field", label: "Fields", fallback: 0.25 },
  { key: "selector", label: "Selectors", fallback: 0.5 },
];

/** The default spacing density (unitless): the multiplier every `space-*` token (`py-space-lg`) is scaled by. */
export const DENSITY_DEFAULT = 1;
export const DENSITY_VAR = "--spacing-density";

export const FONT_VARS = { heading: "--font-heading", body: "--font-body" } as const;

/** Which palette variant a colour row edits. */
type PaletteMode = "light" | "dark";

/**
 * The seed dark-mode palette, used when the Dark tab is first opened on a site with no declared
 * light overrides to copy — the core semantic tokens, so a fresh site gets a sensible dark palette
 * to diverge from.
 */
export const DEFAULT_DARK_COLORS: Readonly<Record<string, string>> = {
  primary: "#818cf8",
  "primary-content": "#0f0f1a",
  secondary: "#1e1b4b",
  "secondary-content": "#e0e7ff",
  accent: "#22d3ee",
  "accent-content": "#0f172a",
  neutral: "#1e293b",
  "neutral-content": "#94a3b8",
  "base-100": "#0f172a",
  "base-200": "#1e293b",
  "base-300": "#334155",
  "base-content": "#f1f5f9",
};

/** The var name for a palette token in a given mode (`--color-primary` / `--color-dark-primary`). */
export function colorVar(name: string, mode: PaletteMode): string {
  return mode === "dark" ? `--color-dark-${name}` : `--color-${name}`;
}

/**
 * Style-guide token rows. `cssVar` is the exact var emitted for that key, so the canvas CSS matches.
 */
export interface StyleTokenDef {
  key: string;
  label: string;
  cssVar: string;
  kind: "color" | "slider" | "select";
  /** Default shown when the site declares no override. */
  fallback: string;
  /** Slider bounds. */
  min?: number;
  max?: number;
  step?: number;
  /** Format a slider value for the suffix readout. */
  format?: (n: number) => string;
  /** Select options. */
  options?: readonly { value: string; label: string }[];
  group: "surface" | "inputs" | "links";
}

const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "0 1px 2px 0 rgb(0 0 0 / 0.05)", label: "Subtle" },
  { value: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", label: "Soft" },
  { value: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", label: "Large" },
  { value: "0 25px 50px -12px rgb(0 0 0 / 0.25)", label: "Dramatic" },
] as const;

const BORDER_OPTIONS = [
  { value: "0px", label: "None" },
  { value: "1px", label: "Thin" },
  { value: "2px", label: "Medium" },
  { value: "4px", label: "Thick" },
] as const;

const UNDERLINE_OPTIONS = [
  { value: "no-underline", label: "None" },
  { value: "underline", label: "Underline" },
  { value: "hover:underline", label: "On hover" },
] as const;

/** All style-guide tokens the Tokens section edits, grouped by category. */
export const STYLE_TOKENS: readonly StyleTokenDef[] = [
  // Surface / component depth
  { key: "depth", label: "Depth", cssVar: "--depth", kind: "slider", fallback: "1", min: 0, max: 1, step: 1, format: (n) => (n ? "Raised" : "Flat"), group: "surface" },
  { key: "noise", label: "Noise", cssVar: "--noise", kind: "slider", fallback: "0", min: 0, max: 1, step: 1, format: (n) => (n ? "On" : "Off"), group: "surface" },
  { key: "shadowStyle", label: "Shadow", cssVar: "--shadow-style", kind: "select", fallback: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", options: SHADOW_OPTIONS, group: "surface" },
  { key: "border", label: "Border width", cssVar: "--border", kind: "select", fallback: "1px", options: BORDER_OPTIONS, group: "surface" },
  // Form inputs
  { key: "inputBorderColor", label: "Input border", cssVar: "--input-border-color", kind: "color", fallback: "", group: "inputs" },
  { key: "inputBgColor", label: "Input bg", cssVar: "--input-bg-color", kind: "color", fallback: "", group: "inputs" },
  { key: "inputTextColor", label: "Input text", cssVar: "--input-text-color", kind: "color", fallback: "", group: "inputs" },
  { key: "inputPlaceholderColor", label: "Placeholder", cssVar: "--input-placeholder-color", kind: "color", fallback: "", group: "inputs" },
  { key: "inputFocusRingColor", label: "Focus ring", cssVar: "--input-focus-ring-color", kind: "color", fallback: "", group: "inputs" },
  // Links
  { key: "linkColor", label: "Link", cssVar: "--link-color", kind: "color", fallback: "", group: "links" },
  { key: "linkHoverColor", label: "Link hover", cssVar: "--link-hover-color", kind: "color", fallback: "", group: "links" },
  { key: "linkUnderline", label: "Underline", cssVar: "--link-underline", kind: "select", fallback: "no-underline", options: UNDERLINE_OPTIONS, group: "links" },
];

export const STYLE_TOKEN_GROUPS: readonly { id: "surface" | "inputs" | "links"; label: string }[] = [
  { id: "surface", label: "Surfaces" },
  { id: "inputs", label: "Form inputs" },
  { id: "links", label: "Links" },
];

/** A typography token (Heading / Body / …). */
export interface TypographyToken {
  /** Reserved name; drives `--<name>-font-*` vars (`heading`, `body`). */
  name: string;
  label: string;
  /** The family var (`--font-heading`), kept for back-compat with the Fonts rows. */
  familyVar: string;
  /** The scale vars this token owns. */
  weightVar: string;
  sizeVar: string;
  lineHeightVar: string;
  letterSpacingVar: string;
}

export const TYPOGRAPHY_TOKENS: readonly TypographyToken[] = [
  { name: "heading", label: "Heading", familyVar: FONT_VARS.heading, weightVar: "--heading-font-weight", sizeVar: "--heading-font-size", lineHeightVar: "--heading-line-height", letterSpacingVar: "--heading-letter-spacing" },
  { name: "body", label: "Body", familyVar: FONT_VARS.body, weightVar: "--body-font-weight", sizeVar: "--body-font-size", lineHeightVar: "--body-line-height", letterSpacingVar: "--body-letter-spacing" },
];

const varRe = (name: string) => new RegExp(`${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;}]+)`);
const varLine = (name: string) => new RegExp(`^[ \\t]*${name.replace(/[-]/g, "\\-")}\\s*:[^;\\n]*;?[ \\t]*\\n?`, "m");

/** The raw value of a `--var` in `css` (trimmed), or `null` when it is not declared. */
export function readThemeVar(css: string | undefined, name: string): string | null {
  const m = css ? varRe(name).exec(css) : null;
  return m ? m[1]!.trim() : null;
}

/** A rem value from a declaration (`.5rem` / `8px`), or `null`. px folds to rem at 16px. */
function readRem(css: string | undefined, name: string): number | null {
  const raw = readThemeVar(css, name);
  if (!raw) return null;
  const m = /^([\d.]+)(px|rem)?$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? (m[2] === "px" ? n / 16 : n) : null;
}

/** A unitless number from a declaration (`1.5`), or `null`. */
function readNumber(css: string | undefined, name: string): number | null {
  const raw = readThemeVar(css, name);
  const n = raw && /^[\d.]+$/.test(raw) ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** A font family name from a declaration (first family, quotes stripped), or `""`. */
function readFont(css: string | undefined, name: string): string {
  const raw = readThemeVar(css, name);
  if (!raw) return "";
  return raw.split(",")[0]!.trim().replace(/^["']|["']$/g, "");
}

/** `css` with `--<name>` set to `value` (null removes the declaration). Mirrors setThemeBreakpoint. */
export function setThemeVar(css: string, name: string, value: string | null): string {
  const m = varRe(name).exec(css);
  if (value === null) {
    if (!m) return css;
    const line = varLine(name).exec(css);
    if (line) return css.slice(0, line.index) + css.slice(line.index + line[0].length);
    const end = css.indexOf(";", m.index);
    return css.slice(0, m.index) + css.slice(end === -1 ? m.index + m[0].length : end + 1);
  }
  const decl = `${name}: ${value};`;
  if (m) {
    const end = css.indexOf(";", m.index);
    return css.slice(0, m.index) + decl + css.slice(end === -1 ? m.index + m[0].length : end + 1);
  }
  return addRootDecl(css, decl);
}

/** Every theme override this panel manages, read off `theme.css`. */
export interface ThemeValues {
  colors: Record<string, string | null>;
  /** The dark-mode palette variant (`--color-dark-*`). */
  darkColors: Record<string, string | null>;
  radius: Record<string, number | null>;
  /** The declared `--spacing-density` multiplier, or null. */
  density: number | null;
  fonts: { heading: string; body: string };
  /** Style-guide tokens, keyed by `StyleTokenDef.key` (raw declared value or null). */
  tokens: Record<string, string | null>;
  /** True when any `--color-dark-*` is declared. */
  hasDarkPalette: boolean;
}

export function readTheme(css: string | undefined): ThemeValues {
  const colors: Record<string, string | null> = {};
  const darkColors: Record<string, string | null> = {};
  let hasDarkPalette = false;
  for (const t of PALETTE_TOKENS) {
    colors[t.name] = readThemeVar(css, `--color-${t.name}`);
    const dark = readThemeVar(css, `--color-dark-${t.name}`);
    darkColors[t.name] = dark;
    if (dark) hasDarkPalette = true;
  }
  const radius: Record<string, number | null> = {};
  for (const r of RADIUS_KEYS) radius[r.key] = readRem(css, `--radius-${r.key}`);
  const tokens: Record<string, string | null> = {};
  for (const tk of STYLE_TOKENS) tokens[tk.key] = readThemeVar(css, tk.cssVar);
  return {
    colors,
    darkColors,
    radius,
    density: readNumber(css, DENSITY_VAR),
    fonts: { heading: readFont(css, FONT_VARS.heading), body: readFont(css, FONT_VARS.body) },
    tokens,
    hasDarkPalette,
  };
}

/**
 * The live-reflection CSS: the overrides as plain custom properties (no `@theme`, which needs
 * compilation), scoped to `html[data-show-gridlines]` — an attribute the editor stamps only on
 * the canvas document (frameDom `applyFrameStates`), never on the chrome, so the page re-themes
 * without touching the editor's own colours. Heading / body fonts are also applied to the page's
 * headings and `body` so a font change is visible even on markup that uses no `font-*` class.
 *
 * `darkPreview` reflects the Palette panel's Light/Dark toggle: when editing the dark variant the
 * canvas shows the dark palette live. The dark colours still persist under the real dark scope so
 * a published site themes correctly in dark mode.
 */
export function themeVarsCss(values: ThemeValues, darkPreview = false): string {
  const SCOPE = "html[data-show-gridlines]";
  const decls: string[] = [];
  for (const [name, value] of Object.entries(values.colors)) if (value) decls.push(`--color-${name}: ${value};`);
  for (const [key, rem] of Object.entries(values.radius)) if (rem != null) decls.push(`--radius-${key}: ${rem}rem;`);
  if (values.density != null) decls.push(`${DENSITY_VAR}: ${values.density};`);
  for (const tk of STYLE_TOKENS) {
    const v = values.tokens[tk.key];
    if (v) decls.push(`${tk.cssVar}: ${v};`);
  }
  if (values.fonts.heading) decls.push(`${FONT_VARS.heading}: "${values.fonts.heading}", system-ui, sans-serif;`);
  if (values.fonts.body) decls.push(`${FONT_VARS.body}: "${values.fonts.body}", system-ui, sans-serif;`);

  const darkDecls: string[] = [];
  for (const [name, value] of Object.entries(values.darkColors)) if (value) darkDecls.push(`--color-${name}: ${value};`);

  let css = decls.length ? `${SCOPE} {\n  ${decls.join("\n  ")}\n}` : "";
  if (values.fonts.body) css += `\n${SCOPE} body { font-family: var(${FONT_VARS.body}); }`;
  if (values.fonts.heading) css += `\n${SCOPE} :is(h1,h2,h3,h4,h5,h6) { font-family: var(${FONT_VARS.heading}); }`;
  // The real dark scope for a published / system-dark site.
  if (darkDecls.length) css += `\n${SCOPE}[data-theme="dark"], ${SCOPE}.dark {\n  ${darkDecls.join("\n  ")}\n}`;
  // Preview the dark variant on the (light) canvas while its tab is active.
  if (darkPreview && darkDecls.length) css += `\n${SCOPE} {\n  ${darkDecls.join("\n  ")}\n}`;
  return css;
}
