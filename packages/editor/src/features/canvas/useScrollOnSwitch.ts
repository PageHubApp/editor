/**
 * After the canvas switches view, device, responsive or side-by-side mode the layout has moved:
 * 200ms later (once the new width has settled) the selected element is scrolled back into view.
 */
import { useEffect, useRef } from "react";
import { editSrcOf } from "@pagehub/engine/canvas";
import { useEditorStore } from "../../react/bindings";
import { elementsFor } from "./frameDom";

export const SCROLL_AFTER_SWITCH_MS = 200;

export function useScrollOnSwitch(doc: Document | null, ...switches: readonly unknown[]): void {
  const store = useEditorStore();
  const latest = useRef(doc);
  latest.current = doc;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => {
      const h = store.state.selection.primary;
      const d = latest.current;
      if (!d || !h?.alive || h.kind !== "element") return;
      elementsFor(d, editSrcOf(h))[0]?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, SCROLL_AFTER_SWITCH_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, switches);
}
