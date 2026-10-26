/**
 * Editor preference "Indicator density": how many per-property breakpoint chips the inspector
 * shows — Auto (only where something is overridden), Always, Off. A browser preference
 * (`indicator-density`), applied to the session's `ui.density` by `useIndicatorDensityPersistence`.
 *
 *   <IndicatorDensityRow />   // for the Theme › Styles › "Editor preferences" section
 */
import { useEffect, useRef } from "react";
import { useRunCommand } from "../../../react/bindings";
import { useUi } from "../../../react/useUi";
import type { IndicatorDensity } from "../../../state/uiState";
import { readJSON, writeJSON } from "../../../primitives/storage";

export const DENSITY_KEY = "indicator-density";
const OPTIONS: ReadonlyArray<{ id: IndicatorDensity; label: string; desc: string }> = [
  { id: "auto", label: "Auto", desc: "Show only when overridden" },
  { id: "always", label: "Always", desc: "Show on every property" },
  { id: "off", label: "Off", desc: "Hide all chips" },
];
const isDensity = (v: unknown): v is IndicatorDensity => OPTIONS.some((o) => o.id === v);

/** Restore the stored density once, then keep it stored. Mount once per editor. */
export function useIndicatorDensityPersistence(): void {
  const run = useRunCommand();
  const density = useUi((u) => u.density);
  const restored = useRef(false);
  useEffect(() => {
    const saved = readJSON<unknown>(DENSITY_KEY, null);
    if (isDensity(saved) && saved !== density) run("ui.set", { density: saved });
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (restored.current && readJSON<unknown>(DENSITY_KEY, null) !== density) writeJSON(DENSITY_KEY, density);
  }, [density]);
}

export function IndicatorDensityRow() {
  const run = useRunCommand();
  const density = useUi((u) => u.density);
  return (
    <div data-indicator-density="" className="flex flex-col gap-1">
      <label className="text-base-content text-xs font-medium">Indicator density</label>
      <p className="text-neutral-content text-[10px] leading-snug">Per-property breakpoint chips next to labels. Right-click a chip for reset / promote / copy commands.</p>
      <div className="bg-base-200 mt-1 inline-flex gap-px rounded-md p-0.5">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={density === o.id}
            aria-label={`${o.label}: ${o.desc}`}
            onClick={() => run("ui.set", { density: o.id })}
            className={`flex-1 cursor-pointer rounded px-2 py-1 text-[11px] transition-colors ${density === o.id ? "bg-base-100 text-base-content font-semibold shadow-sm" : "text-neutral-content hover:text-base-content"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
