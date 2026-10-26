/**
 * The Classes row's chips: one per token on the element.
 *
 * - Click copies the token to the clipboard.
 * - Shift + click arms a copy: the next breakpoint button below copies the token there.
 * - Right-click removes the token; Ctrl + right-click also removes its linked classes (the
 *   same property at every breakpoint, dark and state) — one undo step each.
 * - Drag a chip onto a breakpoint button to move it there (Shift + drag copies); dark and state
 *   prefixes are kept and that breakpoint's token of the same property is replaced. Dropping on
 *   the chip's own layer is invalid (the button shows it). The drag is pointer events with window
 *   listeners (`.claude/rules/drag-listeners.md`), not HTML5 drag.
 *
 * The breakpoint row is both a drop target AND the add-scope selector:
 * a plain click on a breakpoint (nothing armed, nothing dragging) selects the layer a newly-typed
 * bare class targets. The selected layer is highlighted. The buttons are a fixed size, so nothing
 * shifts while dragging.
 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { splitClass, type NodeHandle } from "@pagehub/engine";
import type { Breakpoint } from "@pagehub/engine/kits";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { tooltip } from "../../primitives/tooltip";
import { LAYERS, layerOf, type AddScope } from "./classScope";

const DRAG_THRESHOLD = 4;
const CHIP_TIP = "Click to copy · Shift+click to copy to a breakpoint · drag to move · right-click to remove (Ctrl also removes linked)";

export function ClassChips({ handle, addScope, onSelectScope }: { handle: NodeHandle; addScope: AddScope; onSelectScope: (s: AddScope) => void }) {
  const run = useRunCommand();
  const tokens = useEditorState(() => (handle.alive && handle.kind === "element" ? handle.classes().join(" ") : "")).split(" ").filter(Boolean);
  const [armed, setArmed] = useState<string | null>(null);
  const [over, setOver] = useState<{ to: AddScope; invalid: boolean } | null>(null);
  const [dragToken, setDragToken] = useState<string | null>(null);
  const detach = useRef<(() => void) | null>(null);
  const justDragged = useRef(false);
  useEffect(() => () => detach.current?.(), []);

  const click = (token: string, e: MouseEvent) => {
    e.preventDefault();
    if (justDragged.current) return void (justDragged.current = false);
    if (e.shiftKey) return setArmed((a) => (a === token ? null : token));
    void navigator.clipboard?.writeText(token).catch(() => {});
  };
  const layerClick = (to: AddScope) => {
    if (armed) {
      run("classes.move", { token: armed, to, copy: true, at: handle });
      setArmed(null);
      return;
    }
    onSelectScope(to);
  };
  const layerAt = (target: EventTarget | null): AddScope | null => ((target as Element | null)?.closest?.("[data-class-layer]") as HTMLElement | null)?.dataset.classLayer as AddScope | null ?? null;

  const startDrag = (token: string, e: PointerEvent) => {
    if (e.button !== 0) return;
    detach.current?.();
    const origin = { x: e.clientX, y: e.clientY };
    let active = false;
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      detach.current = null;
      setDragToken(null);
      setOver(null);
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.buttons === 0) return end();
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < DRAG_THRESHOLD) return;
      active = true;
      setDragToken(token);
      const to = layerAt(ev.target);
      setOver(to ? { to, invalid: to === layerOf(token) } : null);
    };
    const up = (ev: globalThis.PointerEvent) => {
      const to = active ? layerAt(ev.target) : null;
      if (active) {
        justDragged.current = true; // swallow the click the release fires on the chip
        window.setTimeout(() => (justDragged.current = false), 0);
      }
      end();
      if (to && to !== layerOf(token)) run("classes.move", { token, to, copy: ev.shiftKey, at: handle });
    };
    const cancel = () => end();
    detach.current = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  };

  return (
    <div className="flex flex-col gap-1" data-class-chips="">
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tokens.map((token, i) => (
            <button
              key={`${i}:${token}`}
              type="button"
              data-class-chip={token}
              data-armed={armed === token ? "" : undefined}
              data-dragging={dragToken === token ? "" : undefined}
              className={`bg-base-200 text-base-content/80 hover:bg-base-300 max-w-full cursor-grab touch-none truncate select-none rounded px-1.5 py-0.5 font-mono text-[11px] ${armed === token ? "ring-primary ring-1" : ""}`}
              {...tooltip(CHIP_TIP, "top")}
              onClick={(e) => click(token, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                run(e.ctrlKey ? "classes.removeLinked" : "classes.remove", { token, at: handle });
              }}
              onPointerDown={(e) => startDrag(token, e)}
            >
              {token}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-px" role="group" aria-label="Breakpoint: the scope a new class targets, or a drop target to move a class">
        {LAYERS.map((l) => {
          const active = addScope === l.to;
          const hover = over?.to === l.to;
          const invalid = hover && over.invalid;
          const hot = (hover && !invalid) || !!armed;
          return (
            <button
              key={l.to}
              type="button"
              data-class-layer={l.to}
              data-active={active ? "" : undefined}
              data-invalid={invalid ? "" : undefined}
              aria-pressed={active}
              className={`h-4 flex-1 rounded-sm text-[9px] leading-none transition-colors ${
                invalid ? "bg-error/20 text-error cursor-not-allowed" : hot ? "bg-primary/20 text-base-content" : active ? "bg-primary text-primary-content font-semibold" : "bg-base-200/60 text-base-content/50 hover:bg-base-300"
              }`}
              {...tooltip(armed ? `Copy ${armed} to ${l.label}` : `Add new classes to ${l.label} (${l.hint})${active ? " — current" : ""}`, "bottom")}
              onClick={() => layerClick(l.to)}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
