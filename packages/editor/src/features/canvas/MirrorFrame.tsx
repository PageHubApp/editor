// The side-by-side mirror: a read-only second render of the page at another view's width.
/**
 * The side-by-side mirror: a read-only second render of the page at another view's width
 * ("XL mirror · read-only"). It re-renders 60ms after an edit, and scrolling either canvas
 * scrolls the other to the same position.
 */
import { useEffect, useState } from "react";
import type { View } from "@pagehub/engine/kits";
import { useRunCommand } from "../../react/bindings";
import { Icon } from "../../primitives/icons";
import { CanvasFrame } from "./CanvasFrame";
import { VIEW_CHIPS } from "./viewportMath";

const MIRROR_DELAY_MS = 60;

/** Mirror scroll between two canvas documents both ways (a programmatic scroll doesn't echo back). */
export function syncScroll(a: Document, b: Document): () => void {
  let echo: Document | null = null;
  const follow = (from: Document, to: Document) => () => {
    if (echo === from) return void (echo = null);
    const w = from.defaultView!;
    echo = to;
    to.defaultView?.scrollTo(w.scrollX, w.scrollY);
  };
  const ab = follow(a, b);
  const ba = follow(b, a);
  a.defaultView?.addEventListener("scroll", ab);
  b.defaultView?.addEventListener("scroll", ba);
  return () => {
    a.defaultView?.removeEventListener("scroll", ab);
    b.defaultView?.removeEventListener("scroll", ba);
  };
}

export function MirrorFrame({ view, main }: { view: View; main: Document | null }) {
  const run = useRunCommand();
  const [doc, setDoc] = useState<Document | null>(null);
  const chip = VIEW_CHIPS.find((c) => c.view === view);
  useEffect(() => (main && doc ? syncScroll(main, doc) : undefined), [main, doc]);
  if (!chip) return null;
  return (
    <aside data-mirror={view} aria-label={`${chip.label} mirror`} className="border-base-300 flex min-h-0 shrink-0 flex-col border-l" style={{ width: chip.px / 2 }}>
      <div className="bg-base-200 flex h-6 items-center justify-between px-2 text-[10px] font-semibold uppercase">
        <span>{chip.label} mirror · read-only</span>
        <button type="button" aria-label="Close mirror" onClick={() => run("canvas.set", { mirror: null })}>
          <Icon name="x" className="size-3" />
        </button>
      </div>
      <div className="min-h-0 flex-1" style={{ zoom: 0.5 }}>
        <CanvasFrame readOnly delayMs={MIRROR_DELAY_MS} style={{ width: chip.px, minHeight: "100%" }} onRendered={(_f, d) => setDoc(d)} />
      </div>
    </aside>
  );
}
