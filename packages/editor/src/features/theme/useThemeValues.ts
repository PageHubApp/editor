/**
 * The site theme as the panel reads and writes it: the values parsed from `theme.css`, and
 * writers that rewrite that file in one transaction (one undo step) through the store's public
 * `dispatch`, exactly as `theme.setBreakpoint` does for breakpoints. A write changes the file,
 * which re-renders the canvas and re-runs the style bridge, so the edit shows live. No command
 * registration is needed — the panel is a host surface over the file.
 *
 * - `setVar(name, value)` — one `--var`.
 * - `setVars(entries)` — many in one undo step (used by presets, which touch the whole palette).
 * - `breakpoints` / `setBreakpoint` — the responsive widths (`--ph-bp-*`), read through the
 *   engine's pure `themeBreakpoints` and written as plain vars (same shape `setThemeBreakpoint`
 *   produces), so no separate command needs registering in the kit.
 */
import { diffSplices } from "@pagehub/engine";
import { breakpointVar, themeBreakpoints, type Breakpoint, type ThemeBreakpoints } from "@pagehub/engine/kits";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { readTheme, readThemeVar, setThemeVar, THEME_FILE, type ThemeValues } from "./themeModel";

interface ThemeApi {
  values: ThemeValues;
  /** Effective + declared breakpoint widths (px). */
  breakpoints: ThemeBreakpoints;
  /** The raw declared value of any `--var` (null when undeclared). */
  getVar(name: string): string | null;
  /** Set (or with `null` remove) a `--var` in `theme.css`. */
  setVar(name: string, value: string | null): void;
  /** Set several `--var`s in ONE undo step (null removes). */
  setVars(entries: ReadonlyArray<readonly [name: string, value: string | null]>): void;
  /** Set (or with `px: null` reset) one breakpoint width. */
  setBreakpoint(bp: Breakpoint, px: number | null): void;
}

export function useThemeValues(): ThemeApi {
  const store = useEditorStore();
  const css = useEditorState((s) => s.files.get(THEME_FILE));
  const values = readTheme(css);
  const breakpoints = themeBreakpoints(css);

  const commit = (after: string) => {
    const before = store.state.files.get(THEME_FILE) ?? "";
    if (after === before) return;
    const splices = diffSplices(before, after).sort((a, b) => b.from - a.from);
    store.dispatch((tr) => {
      for (const s of splices) tr.replace({ path: THEME_FILE, from: s.from, to: s.to }, s.insert);
      return tr;
    });
  };

  const setVar = (name: string, value: string | null) => {
    commit(setThemeVar(store.state.files.get(THEME_FILE) ?? "", name, value));
  };

  const setVars = (entries: ReadonlyArray<readonly [string, string | null]>) => {
    let after = store.state.files.get(THEME_FILE) ?? "";
    for (const [name, value] of entries) after = setThemeVar(after, name, value);
    commit(after);
  };

  const setBreakpoint = (bp: Breakpoint, px: number | null) => {
    setVar(breakpointVar(bp), px === null ? null : `${Math.round(px)}px`);
  };

  const getVar = (name: string) => readThemeVar(store.state.files.get(THEME_FILE), name);

  return { values, breakpoints, getVar, setVar, setVars, setBreakpoint };
}
