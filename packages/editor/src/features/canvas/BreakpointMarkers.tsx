// Draggable breakpoint lines over the canvas; each width lives in `theme.css` (`theme.setBreakpoint`).
/**
 * Breakpoint lines over the canvas (More › View › Show breakpoint lines): a dashed line per
 * breakpoint labelled "MD · 768". Dragging previews the new width (indigo) between its
 * neighbours (±1px) and inside 240–3840; release writes it to `theme.css` in one step (the
 * canvas re-renders with it). Double-click resets a custom width to Tailwind's default. A
 * custom width draws a stronger line.
 */
import { useRef, useState } from "react";
import type { Breakpoint } from "@pagehub/engine/kits";
import { useRunCommand } from "../../react/bindings";
import { useDragGesture } from "../../primitives/useDragGesture";
import { tooltip } from "../../primitives/tooltip";
import { BREAKPOINT_ORDER, clampMarker } from "./viewportMath";
import { useBreakpointWidths } from "./useBreakpointWidths";

export function BreakpointMarkers({ zoom }: { zoom: number }) {
  const run = useRunCommand();
  const { values, custom } = useBreakpointWidths();
  const [pending, setPending] = useState<{ bp: Breakpoint; px: number } | null>(null);
  const drag = useRef<{ bp: Breakpoint; start: number; px: number } | null>(null);
  const { onPointerDown } = useDragGesture({
    onMove: (_e, m) => {
      const d = drag.current;
      if (!d) return;
      d.px = clampMarker(d.bp, d.start + m.dx / (zoom || 1), values);
      setPending({ bp: d.bp, px: d.px });
    },
    onEnd: () => {
      const d = drag.current;
      drag.current = null;
      setPending(null);
      if (d && d.px !== d.start) run("theme.setBreakpoint", { breakpoint: d.bp, px: d.px });
    },
  });
  return (
    <div data-breakpoint-markers="" className="pointer-events-none absolute inset-0 z-30">
      {BREAKPOINT_ORDER.map((bp) => {
        const isPending = pending?.bp === bp;
        const px = isPending ? pending.px : values[bp];
        const isCustom = custom[bp] !== undefined;
        const name = bp.toUpperCase();
        return (
          <div
            key={bp}
            role="separator"
            aria-orientation="vertical"
            aria-label={`Breakpoint ${name} at ${px}px — drag to adjust, double-click to reset`}
            data-marker={bp}
            {...tooltip(`${name} · ${px}px — drag to adjust${isCustom ? ", double-click to reset" : ""}`, "right")}
            className="group pointer-events-auto absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize select-none"
            style={{ left: px * zoom }}
            onPointerDown={(e) => {
              drag.current = { bp, start: values[bp], px: values[bp] };
              onPointerDown(e);
            }}
            onDoubleClick={() => isCustom && run("theme.setBreakpoint", { breakpoint: bp, px: null })}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2" style={{ borderLeft: isPending ? "1px dashed rgba(99,102,241,0.9)" : isCustom ? "1px dashed rgba(99,102,241,0.6)" : "1px dashed rgba(120,120,120,0.45)" }} />
            <span className={`bg-base-200 pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded px-1 font-mono text-[10px] leading-none whitespace-nowrap ${isPending || isCustom ? "text-primary" : "text-base-content/70 group-hover:text-base-content"}`}>
              {name} · {px}
            </span>
          </div>
        );
      })}
    </div>
  );
}
