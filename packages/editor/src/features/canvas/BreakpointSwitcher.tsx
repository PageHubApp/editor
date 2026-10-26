// The breakpoint / zoom switcher (top bar): state is the `ui` / `chrome` / `canvas` fields, writes are commands.
/**
 * The default `BreakpointSwitcher` slot (top bar). The trigger shows the view (icon on desktop,
 * else the label) or the zoom % when zoom ≠ 100%. It opens on hover:
 * Responsive and Device toggles, the view chips (Mobile·390 … 2XL with px; clicking the active
 * chip goes back to desktop), and the zoom row.
 */
import { useEffect, useRef, useState } from "react";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { useOverlay } from "../../primitives/overlayStack";
import { tooltip } from "../../primitives/tooltip";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, chromeOf } from "../../shell/chromeState";
import { canvasOf } from "./canvasState";
import { viewChips } from "./viewportMath";
import { useBreakpointWidths } from "./useBreakpointWidths";

/** Hover grace before the menu closes. */
export const HOVER_CLOSE_MS = 160;
/** The switcher's own grace after the pointer leaves the trigger or the menu. */
export const SWITCHER_CLOSE_MS = 180;

const pct = (z: number) => `${Math.round(z * 100)}%`;
const TOGGLE = "flex items-center justify-between gap-3 rounded-md px-2 py-1 text-xs hover:bg-base-200";

export function ZoomControl() {
  const run = useRunCommand();
  const zoom = useEditorState((s) => chromeOf(s).zoom);
  const fit = useEditorState((s) => chromeOf(s).fit);
  return (
    <div data-zoom-control="" className="flex items-center gap-1 text-xs">
      <button type="button" aria-label="Zoom out" className="btn btn-ghost btn-xs" disabled={zoom <= ZOOM_MIN + 1e-9} onClick={() => run("canvas.zoomOut")}>
        −
      </button>
      <select aria-label="Zoom level" className="select select-xs w-24" value={fit ? "fit" : String(zoom)} onChange={(e) => (e.target.value === "fit" ? run("canvas.zoomFit") : run("canvas.zoomSet", { zoom: Number(e.target.value) }))}>
        <option value="fit">{fit ? `Fit · ${pct(zoom)}` : "Fit to window"}</option>
        {!fit && !ZOOM_PRESETS.includes(zoom) && <option value={String(zoom)}>{pct(zoom)}</option>}
        {ZOOM_PRESETS.map((z) => (
          <option key={z} value={String(z)}>
            {pct(z)}
          </option>
        ))}
      </select>
      <button type="button" aria-label="Zoom in" className="btn btn-ghost btn-xs" disabled={zoom >= ZOOM_MAX - 1e-9} onClick={() => run("canvas.zoomIn")}>
        +
      </button>
      <button type="button" aria-label="Reset zoom to 100%" className="btn btn-ghost btn-xs" onClick={() => run("canvas.zoomReset")} {...tooltip("Reset zoom to 100%", "bottom")}>
        Reset
      </button>
    </div>
  );
}

export function BreakpointSwitcher() {
  const run = useRunCommand();
  const view = useUi((u) => u.view);
  const zoom = useEditorState((s) => chromeOf(s).zoom);
  const fit = useEditorState((s) => chromeOf(s).fit);
  const { device, responsive, mirror } = useEditorState(canvasOf);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useOverlay({ id: "breakpoint-menu", isOpen: open, onDismiss: () => setOpen(false) });
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), SWITCHER_CLOSE_MS);
  };
  const chips = viewChips(useBreakpointWidths().values);
  const chip = chips.find((c) => c.view === view);
  return (
    <div data-slot="BreakpointSwitcher" onMouseEnter={enter} onMouseLeave={leave}>
      <button ref={trigger} type="button" data-bp-trigger="" aria-label="Breakpoints and zoom" aria-haspopup="menu" aria-expanded={open} className="btn btn-ghost btn-sm gap-1" onClick={() => setOpen((o) => !o)} {...tooltip("Breakpoints and zoom", "bottom")}>
        {!fit && zoom !== 1 ? (
          <span data-bp-zoom="">{pct(zoom)}</span>
        ) : chip ? (
          <span data-bp-label="">{chip.label}</span>
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10z M7 20h10 M9 16v4 M15 16v4" />
          </svg>
        )}
      </button>
      <AnchoredPopover open={open} onOpenChange={setOpen} anchor={trigger} placement="bottom-start" className="bg-base-100 border-base-300 w-64 rounded-xl border p-2 shadow-lg">
        <div role="menu" aria-label="Breakpoints" data-bp-menu="" onMouseEnter={enter} onMouseLeave={leave} className="flex flex-col gap-1">
          <label className={TOGGLE}>
            Responsive
            <input type="checkbox" className="toggle toggle-xs" checked={responsive} onChange={() => run("canvas.set", { responsive: !responsive })} />
          </label>
          <label className={TOGGLE}>
            Device
            <input type="checkbox" className="toggle toggle-xs" checked={device} onChange={() => run("canvas.toggleDevice")} />
          </label>
          <div className="text-neutral-content mt-1 px-0.5 text-[10px] font-semibold tracking-wide uppercase">Breakpoints</div>
          <div className="grid grid-cols-3 gap-1 py-1">
            {chips.map((c) => (
              <button
                key={c.view}
                type="button"
                role="menuitemradio"
                aria-checked={view === c.view}
                data-view-chip={c.view}
                className={`flex flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center transition ${view === c.view ? "border-primary bg-primary/10 text-primary" : "border-base-300 text-base-content hover:bg-base-200"}`}
                onClick={() => run("canvas.view", { view: c.view })}
              >
                <span className="text-[11px] leading-none font-bold tracking-tight">{c.label}</span>
                <span className="text-neutral-content mt-0.5 text-[9px] leading-none">{c.px}</span>
              </button>
            ))}
          </div>
          {!device && (
            <div data-side-by-side="" className="border-base-300 mt-1 flex flex-col gap-1 border-t pt-2 text-xs">
              <div className="flex items-baseline gap-1.5 px-0.5">
                <span className="text-neutral-content text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase">Side by side</span>
                <span className="text-neutral-content text-[10px] whitespace-nowrap">read-only</span>
              </div>
              <div className="grid grid-cols-6 gap-1 pb-1">
                {chips.map((c) => (
                  <button
                    key={c.view}
                    type="button"
                    aria-pressed={mirror === c.view}
                    data-mirror-chip={c.view}
                    className={`rounded-md border px-1 py-0.5 text-center text-[11px] font-medium transition ${mirror === c.view ? "border-primary bg-primary/10 text-primary" : "border-base-300 text-base-content hover:bg-base-200"}`}
                    onClick={() => run("canvas.set", { mirror: mirror === c.view ? null : c.view })}
                  >
                    {c.label === "Mobile" ? "M" : c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ZoomControl />
        </div>
      </AnchoredPopover>
    </div>
  );
}
