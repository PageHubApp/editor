// The drop indicator drawn in the canvas overlay layer from the session's plan.
/**
 * The drop indicator, drawn in the canvas overlay layer from the session's plan: a 2px accent
 * outline around the drop parent (0.1s ease-out); a 2px bar across the parent's content box in
 * a column (2×8 end caps from 28px) or a 3px line at .55 opacity in a row (10×2 caps from 24px);
 * a 40px band at 6% when the parent is a page / header / footer; the ghost (dashed 2px, 8% fill,
 * the source's size); a beside bar with its label ("Insert into row" / "Split content" /
 * "Create split"). An invalid target paints everything red.
 */
import type { CSSProperties } from "react";
import { useEditorState } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { useCanvasFrame } from "../canvas/canvasContext";
import { hostRect, toRect } from "../canvas/frameDom";
import type { Rect } from "../canvas/geometry";
import { useDragSession } from "./dragSession";

const ACCENT = "rgb(59 130 246)";
const INVALID = "rgb(239 68 68)";

const box = (r: Rect): CSSProperties => ({ position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height });

export function DropIndicator() {
  const drag = useDragSession();
  const { frame, host } = useCanvasFrame();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const plan = drag?.plan;
  if (!plan || !frame || !host) return null;
  const color = plan.valid ? ACCENT : INVALID;
  const toHost = (r: Rect) => hostRect(r, frame, host, zoom);
  const bar = plan.bar;
  return (
    <div data-drop-indicator="" data-drop-invalid={plan.valid ? undefined : ""} className="pointer-events-none absolute inset-0 z-50">
      {plan.parentRect && <div data-drop-parent="" style={{ ...box(toHost(plan.parentRect)), outline: `2px solid ${color}`, borderRadius: 4, transition: "all 0.1s ease-out" }} />}
      {bar && plan.band && (() => {
        const r = toHost(toRect(bar.orientation === "horizontal" ? { left: bar.x, top: bar.y - 20, width: bar.length, height: 40 } : { left: bar.x - 20, top: bar.y, width: 40, height: bar.length }));
        return <div data-drop-band="" style={{ ...box(r), background: color, opacity: 0.06, borderRadius: 8 }} />;
      })()}
      {bar && bar.orientation === "horizontal" && (() => {
        const r = toHost(toRect({ left: bar.x, top: bar.y - 1, width: bar.length, height: 2 }));
        return (
          <div data-drop-bar="horizontal" style={{ ...box(r), background: color }}>
            {r.width >= 28 && ["left", "right"].map((s) => <span key={s} data-drop-cap="" style={{ position: "absolute", [s]: 0, top: -3, width: 2, height: 8, background: color }} />)}
          </div>
        );
      })()}
      {bar && bar.orientation === "vertical" && (() => {
        const r = toHost(toRect({ left: bar.x - 1.5, top: bar.y, width: 3, height: bar.length }));
        return (
          <div data-drop-bar="vertical" style={{ ...box(r), background: color, opacity: 0.55 }}>
            {r.height >= 24 && ["top", "bottom"].map((s) => <span key={s} data-drop-cap="" style={{ position: "absolute", [s]: 0, left: -3.5, width: 10, height: 2, background: color }} />)}
          </div>
        );
      })()}
      {plan.ghost && <div data-drop-ghost="" style={{ ...box(toHost(plan.ghost)), border: `2px dashed ${color}`, background: plan.valid ? "rgb(59 130 246 / 0.08)" : "rgb(239 68 68 / 0.08)", borderRadius: 4 }} />}
      {plan.beside && (() => {
        const t = toHost(plan.beside.target);
        const x = plan.beside.side === "left" ? t.left - 1 : t.right - 1;
        return (
          <>
            <div data-beside-bar={plan.beside.side} style={{ position: "absolute", left: x, top: t.top, width: 2, height: t.height, background: color }} />
            <span
              data-beside-label=""
              style={{
                position: "absolute", left: x + (plan.beside.side === "left" ? 8 : -8), top: t.top + 12,
                transform: plan.beside.side === "right" ? "translateX(-100%)" : undefined,
                background: "rgba(255,255,255,0.96)", color: "#111", border: `1px solid ${color}`, borderRadius: 0,
                padding: "6px 8px", fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                boxShadow: "0 6px 18px rgba(0,0,0,0.12)", whiteSpace: "nowrap",
              }}
            >
              {plan.beside.label}
            </span>
          </>
        );
      })()}
    </div>
  );
}
