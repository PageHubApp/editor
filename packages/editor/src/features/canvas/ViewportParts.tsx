// The viewport's small parts: scope band, coachmark, edge handles, device guides, preview "Edit" pill.
/**
 * The viewport's small parts: the scope band (which layer the next write targets), the one-time
 * scope coachmark, the canvas edge handles, the device guide lines and the preview "Edit" pill.
 */
import { useRef, useState, type ReactNode } from "react";
import type { Breakpoint, View } from "@pagehub/engine/kits";
import { useRunCommand } from "../../react/bindings";
import { useDragGesture } from "../../primitives/useDragGesture";
import { readJSON, writeJSON } from "../../primitives/storage";
import { tooltip } from "../../primitives/tooltip";
import { Icon } from "../../primitives/icons";
import { DEVICE_GUIDES, edgeDragWidth, scopeBand, type BreakpointWidths } from "./viewportMath";

const BAND = "canvas-scope-band pointer-events-none relative z-30 flex h-[22px] w-full min-w-0 flex-shrink-0 items-center justify-center gap-2 overflow-hidden px-3 text-xs leading-none select-none";

export function ScopeBand({ view, multiScope, bp }: { view: View; multiScope: readonly Breakpoint[]; bp?: BreakpointWidths }) {
  const run = useRunCommand();
  const band = scopeBand(view, multiScope, bp);
  return (
    <div role="status" aria-label={band.label} data-scope-band="" className={BAND} style={{ backgroundColor: band.color, color: band.text }}>
      <span className="shrink-0 font-semibold whitespace-nowrap">{band.head}</span>
      <span className="min-w-0 truncate opacity-90">{band.detail}</span>
      {band.clearable && (
        <button type="button" onClick={() => run("ui.set", { multiScope: [] })} className="pointer-events-auto shrink-0 rounded bg-current/15 px-1.5 py-0.5 text-[11px] transition-colors hover:bg-current/25">
          Clear
        </button>
      )}
    </div>
  );
}

export const COACHMARK_KEY = "scope-coachmark-seen";

/** Shown once per browser, on the first switch to a breakpoint view. */
export function ScopeCoachmark({ view }: { view: View }) {
  const [seen, setSeen] = useState(() => readJSON<boolean>(COACHMARK_KEY, false));
  if (seen || view === "desktop" || view === "mobile") return null;
  const dismiss = () => {
    writeJSON(COACHMARK_KEY, true);
    setSeen(true);
  };
  return (
    <div role="dialog" aria-label="Breakpoint editing" data-scope-coachmark="" className="bg-base-100 text-base-content border-base-300 absolute top-8 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-3 py-2 text-xs shadow-lg">
      <span>
        Your edits now write <code className="font-mono">{view}:</code> classes
      </span>
      <button type="button" className="btn btn-xs btn-primary" onClick={dismiss}>
        Got it
      </button>
      <button type="button" aria-label="Dismiss" className="opacity-60 hover:opacity-100" onClick={dismiss}>
        <Icon name="x" className="size-3.5" />
      </button>
    </div>
  );
}

/** 20px strips left and right of the canvas; drag = 2× delta ÷ zoom (240–3840), double-click resets. */
export function EdgeHandles({ width, zoom }: { width: number; zoom: number }) {
  const run = useRunCommand();
  const start = useRef(width);
  const side = useRef<"left" | "right">("right");
  const { onPointerDown } = useDragGesture({
    onStart: () => void (start.current = width),
    onMove: (_e, m) => void run("canvas.set", { widthOverride: edgeDragWidth(start.current, m.dx, zoom, side.current) }),
  });
  const strip = (s: "left" | "right") => (
    <div
      key={s}
      data-edge-handle={s}
      role="separator"
      aria-orientation="vertical"
      aria-label="Canvas width"
      {...tooltip(`${width}px — drag to resize, double-click to reset`)}
      className={`group absolute top-0 bottom-0 z-20 flex w-5 cursor-ew-resize items-center justify-center ${s === "left" ? "-left-5" : "-right-5"}`}
      onPointerDown={(e) => {
        side.current = s;
        onPointerDown(e);
      }}
      onDoubleClick={() => run("canvas.set", { widthOverride: null })}
    >
      <div className="bg-base-content/30 group-hover:bg-base-content/60 h-10 w-1 rounded-full" />
    </div>
  );
  return <>{[strip("left"), strip("right")]}</>;
}

/** Dotted, non-interactive lines at common device widths. */
export function DeviceGuides({ zoom }: { zoom: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10" data-device-guides="">
      {DEVICE_GUIDES.map((px) => (
        <div key={px} data-guide={px} className="border-base-content/30 absolute top-0 bottom-0 border-l border-dotted" style={{ left: `calc(50% + ${(px / 2) * zoom}px)` }} />
      ))}
    </div>
  );
}

/** Floating pill in preview mode; restores the selection and scroll the preview started with. */
export function PreviewEditButton({ onExit, before }: { onExit(): void; before?: ReactNode }) {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2">
      {before}
      <button type="button" data-preview-edit="" onClick={onExit} className="btn btn-sm btn-primary rounded-full shadow-lg">
        Edit
      </button>
    </div>
  );
}
