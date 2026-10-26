/**
 * Breakpoints (Advanced) — edit the pixel widths where `sm:` / `md:` / `lg:` / `xl:` / `2xl:`
 * activate. A numeric input per breakpoint, clamped between its neighbours, showing the Tailwind
 * default, with a "Reset all to defaults" action. These are stored in `theme.css` as
 * `--breakpoint-*` (engine `themeBreakpoints`), written straight through `setBreakpoint`.
 */
import { BREAKPOINTS, DEFAULT_BREAKPOINT_PX, type Breakpoint, type ThemeBreakpoints } from "@pagehub/engine/kits";
import { CollapsibleSection } from "./parts";

interface Props {
  breakpoints: ThemeBreakpoints;
  setBreakpoint(bp: Breakpoint, px: number | null): void;
}

const LABEL = (bp: Breakpoint) => (bp === "2xl" ? "2XL" : bp.toUpperCase());

export function BreakpointsSection({ breakpoints, setBreakpoint }: Props) {
  const hasOverrides = Object.keys(breakpoints.custom).length > 0;

  const onInput = (bp: Breakpoint, raw: number) => {
    const idx = BREAKPOINTS.indexOf(bp);
    const prev = idx > 0 ? BREAKPOINTS[idx - 1]! : null;
    const next = idx < BREAKPOINTS.length - 1 ? BREAKPOINTS[idx + 1]! : null;
    const prevPx = prev ? breakpoints.values[prev] : 240;
    const nextPx = next ? breakpoints.values[next] : 3840;
    const clamped = Math.max(prevPx + 1, Math.min(nextPx - 1, raw));
    setBreakpoint(bp, clamped);
  };

  return (
    <CollapsibleSection title="Breakpoints (Advanced)" hint="The widths where sm: / md: / lg: / xl: / 2xl: turn on. Affects every responsive class on this site.">
      {BREAKPOINTS.map((bp) => {
        const px = breakpoints.values[bp];
        const isCustom = breakpoints.custom[bp] !== undefined;
        return (
          <div key={bp} className="flex items-center gap-2 text-xs">
            <label htmlFor={`ds-bp-${bp}`} className="text-base-content w-12 shrink-0 font-mono uppercase">{LABEL(bp)}</label>
            <input
              id={`ds-bp-${bp}`}
              type="number"
              min={241}
              max={3839}
              value={px}
              placeholder={`${DEFAULT_BREAKPOINT_PX[bp]}`}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) onInput(bp, n);
              }}
              className={`input-wrapper h-8 w-20 shrink-0 bg-transparent px-2 tabular-nums ${isCustom ? "text-primary" : "text-base-content"}`}
            />
            <span className="text-base-content/50 shrink-0">px</span>
            <span className="text-base-content/50 shrink-0">default {DEFAULT_BREAKPOINT_PX[bp]}</span>
          </div>
        );
      })}
      {hasOverrides && (
        <button type="button" onClick={() => BREAKPOINTS.forEach((bp) => setBreakpoint(bp, null))} className="text-base-content/50 hover:text-base-content mt-1 cursor-pointer text-left text-[10px] underline transition-colors">
          Reset all to defaults
        </button>
      )}
    </CollapsibleSection>
  );
}
