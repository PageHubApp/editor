/**
 * Breakpoint widths live in the site's `theme.css` as `--ph-bp-<key>: 800px;` in `:root`, next to the
 * palette and spacing tokens. That is the variable the stylesheet compiler reads (`themeOptionsFromCss`,
 * the MCP `set_theme` breakpoints write it too), so the canvas, the editor's breakpoint markers, `/view`
 * and the published site read one value. (Tailwind's own `--breakpoint-*` is not read: an `@theme` block in
 * a published `theme.css` is inert, and an imported Bootstrap stylesheet declares its own `--breakpoint-*`.)
 * A breakpoint with no declaration uses Tailwind's default.
 *
 *   themeBreakpoints(files.get("theme.css")).values.md   // 768, or the declared width
 *   editor.run("theme.setBreakpoint", { breakpoint: "md", px: 800 });   // null resets it
 */
import { defineCommand } from "../../commands/defineCommand";
import { diffSplices } from "../../storage/diff";
import type { Path } from "../../state/changes";
import { BREAKPOINTS, type Breakpoint } from "./classModel";

export const THEME_FILE: Path = "theme.css";

/** Tailwind's default widths (px). */
export const DEFAULT_BREAKPOINT_PX: Readonly<Record<Breakpoint, number>> = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };

export interface ThemeBreakpoints {
  /** Effective width per breakpoint. */
  values: Record<Breakpoint, number>;
  /** Only the declared ones. */
  custom: Partial<Record<Breakpoint, number>>;
}

/** The custom property a breakpoint width is stored in. */
export const breakpointVar = (bp: Breakpoint) => `--ph-bp-${bp}`;

const decl = (bp: Breakpoint) => new RegExp(`${breakpointVar(bp)}\\s*:\\s*([\\d.]+)px\\s*;`);
/** The whole line of a declaration that sits alone on its line (for removal). */
const declLine = (bp: Breakpoint) => new RegExp(`^[ \\t]*${breakpointVar(bp)}\\s*:[^;\\n]*;?[ \\t]*\\n?`, "m");

/**
 * `css` with the declaration `decl` (`--name: value;`) added to the first `:root { … }` block that opens a line
 * (the one the theme tools write into), or in a new `:root` block at the end. NOT `@theme`: the published
 * stylesheet is plain CSS, so a variable there never reaches a visitor.
 */
export function addRootDecl(css: string, decl: string): string {
  const block = /(^|\n):root\s*\{/.exec(css);
  if (block) {
    const at = block.index + block[0].length;
    return `${css.slice(0, at)}\n  ${decl}${css.slice(at)}`;
  }
  const sep = css && !css.endsWith("\n") ? "\n" : "";
  return `${css}${sep}${css ? "\n" : ""}:root {\n  ${decl}\n}\n`;
}

export function themeBreakpoints(css: string | undefined): ThemeBreakpoints {
  const values = { ...DEFAULT_BREAKPOINT_PX };
  const custom: Partial<Record<Breakpoint, number>> = {};
  for (const bp of BREAKPOINTS) {
    const m = css ? decl(bp).exec(css) : null;
    if (!m) continue;
    values[bp] = custom[bp] = Math.round(Number(m[1]));
  }
  return { values, custom };
}

/** `css` with `--ph-bp-<bp>` set to `px` (null removes the declaration). */
export function setThemeBreakpoint(css: string, bp: Breakpoint, px: number | null): string {
  const m = decl(bp).exec(css);
  if (px === null) {
    if (!m) return css;
    const line = declLine(bp).exec(css);
    return line ? css.slice(0, line.index) + css.slice(line.index + line[0].length) : css.slice(0, m.index) + css.slice(m.index + m[0].length);
  }
  const value = `${breakpointVar(bp)}: ${Math.round(px)}px;`;
  if (m) return css.slice(0, m.index) + value + css.slice(m.index + m[0].length);
  return addRootDecl(css, value);
}

/** Set (or with `px: null` reset) one breakpoint width in `theme.css`: one transaction, one undo step. */
export const themeSetBreakpoint = defineCommand<{ breakpoint: Breakpoint; px: number | null; path?: Path }>({
  id: "theme.setBreakpoint",
  title: "Set breakpoint width",
  run(ctx, args) {
    if (!args || !(BREAKPOINTS as readonly string[]).includes(args.breakpoint)) return false;
    if (args.px !== null && !(Number.isFinite(args.px) && args.px > 0)) return false;
    const path = args.path ?? THEME_FILE;
    const before = ctx.state.files.get(path) ?? "";
    const after = setThemeBreakpoint(before, args.breakpoint, args.px);
    if (after === before) return false;
    for (const s of diffSplices(before, after).sort((a, b) => b.from - a.from)) ctx.tr.replace({ path, from: s.from, to: s.to }, s.insert);
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});
