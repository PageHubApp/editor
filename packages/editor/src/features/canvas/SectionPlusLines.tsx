/**
 * The "+" lines between a page's top-level sections (`pageSections`): when the pointer comes
 * within a few pixels of the boundary between two sections (or the top of the first / the bottom
 * of the last), a thin line spans it with a round "+" in the middle. The "+" opens the Add section
 * dialog (`insert.sectionDialog`) targeted at that spot — below the section above it, or above the
 * first — so the pick lands there through the dialog's own insert. A page with no sections shows
 * one "Add section" button (always, no hover) that inserts at the end of the page.
 *
 * Drawn in the overlay layer, never in the page: nothing moves. Hidden whenever the canvas edit
 * chrome is (`useCanvasEditChromeShown`: preview, content mode, a drag, inline text editing), on a
 * component being edited on its own, and without a block source.
 */
import { useEffect, useState } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { editSrcOf } from "@pagehub/engine/canvas";
import { blockSourceFacet } from "@pagehub/engine/host";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { useCanvasFrame } from "./canvasContext";
import { canvasPage, canvasPageBase } from "./canvasState";
import { elementsFor, hostRect, toRect, visibleInFrame } from "./frameDom";
import type { Rect } from "./geometry";
import { pageRoot, pageSections, sameSections } from "./pageSections";
import { useCanvasEditChromeShown } from "./SelectionActions";
import { useCanvasScrollSync } from "./useSelectionGeometry";

/** How close (overlay px) the pointer must come to a boundary for its line to show. */
export const SECTION_PLUS_NEAR = 12;
const LABEL = "Add section";

interface Spot {
  anchor: NodeHandle;
  position: "above" | "below";
  /** The line, in overlay coordinates. */
  y: number;
  left: number;
  right: number;
}

/** Boundaries above the first section, between each pair, and below the last. */
function spotsOf(items: { h: NodeHandle; r: Rect }[]): Spot[] {
  if (!items.length) return [];
  const first = items[0]!;
  const last = items.at(-1)!;
  const spots: Spot[] = [{ anchor: first.h, position: "above", y: first.r.top, left: first.r.left, right: first.r.right }];
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i]!.r;
    const b = items[i + 1]!.r;
    spots.push({ anchor: items[i]!.h, position: "below", y: (a.bottom + b.top) / 2, left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) });
  }
  spots.push({ anchor: last.h, position: "below", y: last.r.bottom, left: last.r.left, right: last.r.right });
  return spots;
}

export function SectionPlusLines() {
  const store = useEditorStore();
  const run = useRunCommand();
  const { doc, frame, host, version } = useCanvasFrame();
  useCanvasScrollSync();
  const shown = useCanvasEditChromeShown();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const blocks = useEditorState((s) => {
    const src = s.facet(blockSourceFacet);
    return !!src && src.enabled !== false;
  });
  // a component edited on its own isn't a page
  const page = useEditorState((s) => (canvasPage(s) === canvasPageBase(s) ? canvasPage(s) : null));
  const layout = useEditorState((s) => {
    if (!page || !s.files.has(page)) return null;
    const root = pageRoot(store, page);
    return root ? pageSections(root) : null;
  }, sameSections);
  /** The pointer in canvas-document coordinates (it stays put while the page scrolls under it). */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  /** The spot whose "+" the pointer is on (the frame gets no moves then). */
  const [held, setHeld] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    const move = (e: MouseEvent) => setPointer({ x: e.clientX, y: e.clientY });
    const leave = () => setPointer(null);
    doc.addEventListener("mousemove", move);
    doc.documentElement?.addEventListener("mouseleave", leave);
    return () => {
      doc.removeEventListener("mousemove", move);
      doc.documentElement?.removeEventListener("mouseleave", leave);
    };
  }, [doc, version]);

  if (!shown || !blocks || !layout || !doc || !frame || !host) return null;
  const rectOf = (h: NodeHandle): Rect | null => {
    const el = elementsFor(doc, editSrcOf(h))[0];
    return el ? hostRect(toRect(el.getBoundingClientRect()), frame, host, zoom) : null;
  };

  if (!layout.sections.length) {
    const r = rectOf(layout.parent);
    if (!r) return null;
    const y = r.top + Math.min(r.height / 2, 120);
    return (
      <div data-slot="SectionPlusLines" className="pointer-events-none absolute inset-0">
        <button type="button" data-section-plus="empty" className="border-base-content/30 bg-base-100 text-base-content/70 hover:border-primary hover:text-primary pointer-events-auto absolute z-40 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs shadow-sm" style={{ left: (r.left + r.right) / 2, top: y }} onClick={() => run("insert.sectionDialog")}>
          <Icon name="plus" className="size-3.5" />
          {LABEL}
        </button>
      </div>
    );
  }

  const items = layout.sections.flatMap((h) => {
    const r = rectOf(h);
    return r && r.height > 0 ? [{ h, r }] : [];
  });
  const spots = spotsOf(items);
  const key = (s: Spot) => `${editSrcOf(s.anchor)}:${s.position}`;
  const at = pointer ? hostRect(toRect({ left: pointer.x, top: pointer.y, width: 0, height: 0 }), frame, host, zoom) : null;
  let active: Spot | null = held ? (spots.find((s) => key(s) === held) ?? null) : null;
  if (!active && at) {
    let best = SECTION_PLUS_NEAR + 1;
    for (const s of spots) {
      const d = Math.abs(at.top - s.y);
      if (d < best && at.left >= s.left && at.left <= s.right) [best, active] = [d, s];
    }
  }
  if (!active || !visibleInFrame(toRect({ left: active.left, top: active.y, width: active.right - active.left, height: 0 }), frame, host)) return null;
  const spot = active;
  const id = key(spot);
  return (
    <div data-slot="SectionPlusLines" className="pointer-events-none absolute inset-0">
      <div data-section-line={spot.position} className="bg-primary absolute z-40 h-0.5 -translate-y-1/2" style={{ left: spot.left, top: spot.y, width: spot.right - spot.left }}>
        <button
          type="button"
          data-section-plus={spot.position}
          aria-label={LABEL}
          className="bg-primary text-primary-content ring-base-100 pointer-events-auto absolute top-1/2 left-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-md ring-2"
          {...tooltip(LABEL, "top")}
          onMouseEnter={() => setHeld(id)}
          onMouseLeave={() => setHeld(null)}
          onClick={() => {
            setHeld(null);
            if (spot.anchor.alive) run("insert.sectionDialog", { pending: { anchor: spot.anchor, position: spot.position } });
          }}
        >
          <Icon name="plus" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
