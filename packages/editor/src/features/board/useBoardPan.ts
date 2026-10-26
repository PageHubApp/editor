/**
 * Board panning and zooming: Space+drag or middle-button drag pans; the wheel pans;
 * Ctrl/Cmd+wheel zooms (×(1 − deltaY·0.005), clamped 0.25–10 by `board.view`). Space is
 * tracked on `window` (ignored while typing in a field); the drag attaches `pointermove` /
 * `pointerup` / `pointercancel` / `blur` to `window` and detaches them on end.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { useEditorStore } from "../../react/bindings";
import { boardOf } from "./boardState";

const WHEEL_ZOOM_RATE = 0.005;

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function useBoardPan(surface: RefObject<HTMLElement | null>): { cursor: string; panning: boolean; space: boolean } {
  const store = useEditorStore();
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const spaceRef = useRef(false);
  spaceRef.current = space;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target)) return;
      setSpace(true);
      if (surface.current?.contains(e.target as Node) || e.target === document.body) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => void (e.code === "Space" && setSpace(false));
    const blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [surface]);

  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    let detach: (() => void) | null = null;
    const pan = (dx: number, dy: number) => {
      const b = boardOf(store.state);
      store.run("board.view", { pan: { x: b.pan.x + dx, y: b.pan.y + dy } });
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1 && !(e.button === 0 && spaceRef.current)) return;
      e.preventDefault();
      detach?.();
      let last = { x: e.clientX, y: e.clientY };
      const move = (ev: PointerEvent) => {
        if (ev.buttons === 0) return end();
        pan(ev.clientX - last.x, ev.clientY - last.y);
        last = { x: ev.clientX, y: ev.clientY };
      };
      const end = () => {
        detach?.();
        detach = null;
        setPanning(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      window.addEventListener("blur", end);
      detach = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        window.removeEventListener("blur", end);
      };
      setPanning(true);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) store.run("board.view", { zoom: boardOf(store.state).zoom * (1 - e.deltaY * WHEEL_ZOOM_RATE) });
      else pan(-e.deltaX, -e.deltaY);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      detach?.();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("wheel", onWheel);
    };
  }, [surface, store]);

  return { cursor: panning ? "grabbing" : space ? "grab" : "default", panning, space };
}
