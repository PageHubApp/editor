// The hovered element's tool strip (shown when the hovered element isn't the selection).
/**
 * The hovered element's tool strip (the hovered element, when it isn't the selection). Each
 * tool decides whether it shows on hover; today only the page background's read-only name chip
 * does. The page background is the page's top-level element: its chip sits at top / start and
 * falls back to bottom / start when the top would be clipped by the canvas.
 */
import { editSrcOf } from "@pagehub/engine/canvas";
import { useEditorState } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { useCanvasFrame } from "./canvasContext";
import { crumbName } from "./Breadcrumb";
import { elementsFor, hostRect, toRect } from "./frameDom";
import { CHIP_ROOM, isPageBackground } from "./CanvasOverlays";
import { useKeepInView } from "./useKeepInView";
import { useCanvasScrollSync } from "./useSelectionGeometry";

// Re-exported here: `isPageBackground` lives in CanvasOverlays (the name-chip owner) so the
// selected background name chip and the hover chip share one predicate without an import cycle.
export { isPageBackground } from "./CanvasOverlays";

export function HoverStrip() {
  const { doc, frame, host } = useCanvasFrame();
  useCanvasScrollSync();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const hover = useEditorState((s) => {
    const h = s.selection.hover;
    return h?.alive && h !== s.selection.primary ? h : null;
  });
  const shown = !!hover && !!doc && !!frame && !!host && isPageBackground(hover);
  const el = shown && doc && hover ? elementsFor(doc, editSrcOf(hover))[0] : undefined;
  const r = el && frame && host ? hostRect(toRect(el.getBoundingClientRect()), frame, host, zoom) : null;
  const keep = useKeepInView<HTMLSpanElement>(r);
  if (!hover || !r) return null;
  const bottom = r.top < CHIP_ROOM;
  return (
    <div data-hover-strip="" className="pointer-events-none absolute inset-0">
      <span
        ref={keep}
        data-hover-chip={bottom ? "bottom-start" : "top-start"}
        className="bg-base-100 text-base-content absolute z-40 rounded px-2 text-xs whitespace-nowrap shadow-sm"
        style={bottom ? { left: r.left, top: r.bottom - 2, transform: "translateY(-100%)" } : { left: r.left, top: r.top - 2, transform: "translateY(-100%)" }}
      >
        {crumbName(hover)}
      </span>
    </div>
  );
}
