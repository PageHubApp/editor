/**
 * The empty-list placeholder: a list of a collection (`{% for p in collections.products %}`) with no entries renders
 * nothing, and with no `{% else %}` branch the author would see no list at all. The canvas copy marks that spot
 * (`<ph-empty-list>`, engine `instrumentFile`), and this layer draws a dashed "No Produits entries yet" box there, with
 * "Add an entry" when the host can open a new entry (`collectionRowsFacet.createEntry`). Canvas only: the marker is
 * never in the stored file or the published page, and it shows only in edit mode (`canvasCss`).
 */
import { useLayoutEffect, useState } from "react";
import { EMPTY_LIST_ATTR, EMPTY_LIST_TAG } from "@pagehub/engine/canvas";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { tooltip } from "../../primitives/tooltip";
import { useCanvasFrame } from "./canvasContext";
import { fieldLabel } from "./EntryButton";
import { hostCollection, loopAt, loopCollectionSlug } from "./collectionLoops";
import { hostRect, toRect } from "./frameDom";
import { useHostCollections } from "./hostCollections";

/** Set on the markers this layer draws a placeholder over: only those take up room on the canvas. */
export const EMPTY_LIST_SHOWN = "data-ph-shown";

export function EmptyListLayer() {
  const store = useEditorStore();
  const { doc, frame, host, version } = useCanvasFrame();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const cols = useHostCollections();
  const [, remeasure] = useState(0);
  const lists =
    doc && frame && host
      ? [...doc.querySelectorAll<HTMLElement>(`${EMPTY_LIST_TAG}[${EMPTY_LIST_ATTR}]`)].flatMap((el) => {
          const value = el.getAttribute(EMPTY_LIST_ATTR)!;
          const slug = loopCollectionSlug(loopAt(store, value));
          return slug ? [{ el, value, slug }] : [];
        })
      : [];
  const key = lists.map((l) => l.value).join("\n");

  // Give the markers this layer covers their room (the rest stay hidden), then measure them again.
  useLayoutEffect(() => {
    if (!doc) return;
    const shown = new Set(key.split("\n"));
    for (const el of doc.querySelectorAll(EMPTY_LIST_TAG)) el.toggleAttribute(EMPTY_LIST_SHOWN, shown.has(el.getAttribute(EMPTY_LIST_ATTR) ?? ""));
    remeasure((n) => n + 1);
  }, [doc, version, key]);

  if (!lists.length || !frame || !host) return null;
  return (
    <div data-slot="EmptyListLayer" className="pointer-events-none absolute inset-0">
      {lists.map(({ el, value, slug }, i) => {
        const r = hostRect(toRect(el.getBoundingClientRect()), frame, host, zoom);
        const info = cols ? hostCollection(cols.list, slug) : null;
        const name = info?.name ?? fieldLabel(slug);
        const add = info && !info.count && cols?.rows.createEntry ? cols.rows.createEntry.bind(cols.rows) : null;
        return (
          <div
            key={`${value}:${i}`}
            data-empty-list={slug}
            className="border-base-content/30 bg-base-100/80 text-base-content/70 absolute flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded border border-dashed px-3 py-1 text-xs"
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
          >
            <span>{info && info.count > 0 ? `None of your ${name} entries are in this list` : `No ${name} entries yet`}</span>
            {add && (
              <button
                type="button"
                data-empty-list-add={slug}
                className="btn btn-xs btn-primary pointer-events-auto"
                {...tooltip(`Opens a new ${name} entry. Save it and it shows in this list.`, "bottom")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => add(slug)}
              >
                Add an entry
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
