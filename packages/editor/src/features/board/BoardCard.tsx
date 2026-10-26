/**
 * One partial on the board. Above the card (screen space, unscaled): the grip with the name
 * ("Drag to move · Double-click to isolate") and the focus icon ("Isolate this component").
 * The card itself is scaled by the board zoom and renders the partial in its own frame; a click
 * inside selects that element (`board.select`). Grip drag moves the card, the right / bottom
 * edges and the corner resize it (min 200×80); each gesture commits once, on release, as
 * `board.moveCard` (one undo step). Gestures use window listeners (`useDragGesture`).
 */
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { editSrcOf } from "@pagehub/engine/canvas";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { tooltip } from "../../primitives/tooltip";
import { useDragGesture } from "../../primitives/useDragGesture";
import { CanvasRenderContext, defaultCanvasRender } from "../canvas/canvasContext";
import { useCanvasHost } from "../canvas/canvasHost";
import { applyFrameStates, srcOf, writeFrame } from "../canvas/frameDom";
import { MIN_H, MIN_W, SLOT_W, type CardBox } from "./boardLayout";
import { boardOf } from "./boardState";
import { BoardIcon } from "./boardIcons";

const HANDLE_HEIGHT = 24;
const HANDLE_GAP = 6;
const CARD_PAD = 12;
const BAND = 8;

type Edge = "right" | "bottom" | "corner";

interface BoardCardProps {
  name: string;
  path: string;
  box: CardBox;
  /** Measured content size (board units), for Arrange. */
  onMeasure?(name: string, size: { w: number; h: number }): void;
  /** Card frames ignore the pointer (while the board pans). */
  inert?: boolean;
}

export function BoardCard({ name, path, box, onMeasure, inert }: BoardCardProps) {
  const store = useEditorStore();
  const hostRender = useContext(CanvasRenderContext);
  const canvasHost = useCanvasHost();
  const render = useMemo(() => hostRender ?? defaultCanvasRender(store, canvasHost), [hostRender, store, canvasHost]);
  const text = useEditorState((s) => s.files.get(path));
  const { pan, zoom } = useEditorState((s) => boardOf(s), (a, b) => a.pan === b.pan && a.zoom === b.zoom);
  const selected = useEditorState((s) => (s.selection.primary?.alive && s.selection.primary.path === path && s.selection.primary.kind === "element" ? editSrcOf(s.selection.primary as never) : null));
  const frame = useRef<HTMLIFrameElement>(null);
  const [version, setVersion] = useState(0);
  const [contentH, setContentH] = useState<number | null>(null);
  const [live, setLiveState] = useState<CardBox | null>(null);
  const liveRef = useRef<CardBox | null>(null);
  const setLive = (b: CardBox | null) => void setLiveState((liveRef.current = b));
  const shown = live ?? box;
  const w = shown.w ?? SLOT_W;
  const h = shown.h ?? contentH ?? MIN_H;

  useEffect(() => {
    let cancelled = false;
    render(store.state, path).then(
      (html) => {
        const doc = frame.current?.contentDocument;
        if (cancelled || !doc) return;
        writeFrame(doc, html, canvasHost?.runtimeUrl);
        setContentH(Math.max(MIN_H, doc.documentElement?.scrollHeight || 0));
        setVersion((v) => v + 1);
      },
      () => {},
    );
    return () => void (cancelled = true);
  }, [text, path, render, store]);

  useEffect(() => void onMeasure?.(name, { w, h }), [name, w, h, onMeasure]);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !version) return;
    applyFrameStates(doc, { selected, parent: null, hover: null, gridlines: false, showHidden: false });
  }, [selected, version]);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !version) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const src = srcOf(e.target as Element);
      if (src) store.run("board.select", { src });
      else store.run("selection.clear");
    };
    const onClick = (e: MouseEvent) => (e.target as Element).closest?.("a") && e.preventDefault();
    doc.addEventListener("mousedown", onDown);
    doc.addEventListener("click", onClick);
    return () => {
      doc.removeEventListener("mousedown", onDown);
      doc.removeEventListener("click", onClick);
    };
  }, [version, store]);

  const commit = (moved: boolean) => {
    const next = moved ? liveRef.current : null;
    setLive(null);
    if (next) store.run("board.moveCard", { name, x: next.x, y: next.y, w: next.w, h: next.h });
  };

  const move = useDragGesture({
    onMove: (_e, m) => setLive({ ...box, x: box.x + m.dx / zoom, y: box.y + m.dy / zoom }),
    onEnd: (_e, moved) => commit(moved),
  });
  const resizers = { right: useResize("right"), bottom: useResize("bottom"), corner: useResize("corner") };
  function useResize(edge: Edge) {
    return useDragGesture({
      onMove: (_e, m) =>
        setLive({
          ...box,
          w: edge === "bottom" ? box.w : Math.max(MIN_W, w0() + m.dx / zoom),
          h: edge === "right" ? box.h : Math.max(MIN_H, h0() + m.dy / zoom),
        }),
      onEnd: (_e, moved) => commit(moved),
    });
  }
  const w0 = () => box.w ?? SLOT_W;
  const h0 = () => box.h ?? contentH ?? MIN_H;
  const isolate = () => void store.run("component.edit", { path });

  return (
    <div data-board-card={name} className="pointer-events-none absolute top-0 left-0" style={{ transform: `translate3d(${pan.x + shown.x * zoom}px, ${pan.y + shown.y * zoom}px, 0)` }}>
      <div className="text-base-content/60 pointer-events-auto absolute inline-flex w-fit items-center gap-1 px-1 text-xs font-medium select-none" style={{ height: HANDLE_HEIGHT, top: -(HANDLE_HEIGHT + HANDLE_GAP), left: 0 }}>
        <div data-board-grip="" className="hover:text-base-content flex cursor-move items-center gap-1" onPointerDown={move.onPointerDown} onDoubleClick={isolate} {...tooltip("Drag to move · Double-click to isolate", "bottom")}>
          <BoardIcon name="grip" className="size-3.5 shrink-0 opacity-60" />
          <span className="truncate">{name}</span>
        </div>
        <button type="button" data-board-isolate="" onClick={isolate} aria-label={`Isolate ${name}`} className="hover:text-base-content ml-1 flex size-5 cursor-pointer items-center justify-center rounded opacity-70 hover:opacity-100" {...tooltip("Isolate this component", "bottom")}>
          <BoardIcon name="focus" className="size-3.5" />
        </button>
      </div>
      <div style={{ width: w + CARD_PAD * 2, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
        <div data-board-slot="" className="border-base-300 bg-base-100 relative rounded-lg border bg-[radial-gradient(color-mix(in_oklab,var(--color-primary)_25%,transparent)_1px,transparent_1px)] bg-size-[20px_20px]" style={{ padding: CARD_PAD, height: h + CARD_PAD * 2 }}>
          <iframe ref={frame} aria-label={name} data-board-frame={name} className="block border-0 bg-transparent" style={{ width: w, height: h, pointerEvents: inert ? "none" : "auto" }} />
          {(Object.keys(resizers) as Edge[]).map((edge) => (
            <div
              key={edge}
              data-board-resize={edge}
              onPointerDown={resizers[edge].onPointerDown}
              className="pointer-events-auto absolute"
              style={
                edge === "right"
                  ? { top: 0, bottom: 0, right: -BAND / 2, width: BAND, cursor: "ew-resize", zIndex: 1 }
                  : edge === "bottom"
                    ? { left: 0, right: 0, bottom: -BAND / 2, height: BAND, cursor: "ns-resize", zIndex: 1 }
                    : { right: -BAND, bottom: -BAND, width: BAND * 2, height: BAND * 2, cursor: "nwse-resize", zIndex: 2 }
              }
              {...tooltip(edge === "right" ? "Drag to resize width" : edge === "bottom" ? "Drag to resize height" : "Drag to resize", edge === "right" ? "left" : "top")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
