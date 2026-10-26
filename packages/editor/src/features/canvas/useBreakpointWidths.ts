/**
 * The site's breakpoint widths, read from `theme.css` (`--breakpoint-*`; Tailwind's defaults
 * otherwise). Storage decision: they are theme tokens the published CSS compiles from, so they
 * live in the theme file beside the palette, not in editor config — the canvas, the switcher
 * chips, the scope band and the breakpoint markers all read the same value the live site uses.
 */
import { useMemo } from "react";
import { useEditorState } from "../../react/bindings";
import { THEME_FILE, themeBreakpoints, type ThemeBreakpoints } from "@pagehub/engine/kits";

export function useBreakpointWidths(): ThemeBreakpoints {
  const css = useEditorState((s) => s.files.get(THEME_FILE));
  return useMemo(() => themeBreakpoints(css), [css]);
}
