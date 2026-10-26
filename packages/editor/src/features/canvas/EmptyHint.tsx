// The empty-canvas hint: a dashed chip on every empty container.
/**
 * The empty canvas hint: a dashed chip on every empty container — "Empty page", "Global header",
 * "Global footer" or the element's name. When the element is selected it also shows how to add
 * (drag from the sidebar, double-click, right-click, each with a tooltip). A click opens the
 * Blocks panel. It stays away from elements that already look intentional: a `bg-*` class (a
 * colour, gradient or background image) or an inline `style`.
 *
 * `<EmptyHintLayer />` draws one chip per empty container over the canvas page; mount it inside
 * `CanvasOverlays`. HTML imports carry no marker, so imported markup is told apart only by that
 * class / style rule.
 */
import { useMemo } from "react";
import { type NodeHandle } from "@pagehub/engine";
import { editSrcOf } from "@pagehub/engine/canvas";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { crumbName } from "./Breadcrumb";
import { useCanvasFrame } from "./canvasContext";
import { canvasPage } from "./canvasState";
import { elementsFor, hostRect, toRect } from "./frameDom";
import { CONTAINER_TAGS } from "./NodeTools";

const blank = (c: NodeHandle) => c.kind === "text" && !c.text().trim();
const FIXED_LABELS: Readonly<Record<string, string>> = { main: "Empty page", header: "Global header", footer: "Global footer" };
export const EMPTY_HINT_TIPS = ["Drag from the sidebar", "Double-click to add", "Right-click to add"] as const;
const TIP_ICONS = ["arrows-move", "click", "click"] as const;

export const emptyHintLabel = (h: NodeHandle): string => FIXED_LABELS[h.tag] ?? crumbName(h);

/** An empty container with no background class or inline style. */
export function showsEmptyHint(h: NodeHandle): boolean {
  if (!h.alive || h.kind !== "element" || !CONTAINER_TAGS.has(h.tag)) return false;
  if (h.children().some((c) => !blank(c))) return false;
  if (h.attr("style") !== undefined) return false;
  return !h.classes().some((t) => /(?:^|:)bg-/.test(t));
}

export function EmptyHint({ handle, selected, className = "" }: { handle: NodeHandle; selected: boolean; className?: string }) {
  const run = useRunCommand();
  if (!showsEmptyHint(handle)) return null;
  return (
    <button
      type="button"
      data-empty-hint=""
      onClick={() => run("insert.open", { tab: "blocks" })}
      className={`border-base-content/30 text-base-content/60 hover:border-base-content/60 pointer-events-auto flex items-center justify-center gap-2 rounded border border-dashed px-3 py-1 text-xs ${className}`}
    >
      <span>{emptyHintLabel(handle)}</span>
      {selected &&
        EMPTY_HINT_TIPS.map((tip, i) => (
          <span key={tip} data-empty-tip={tip} aria-label={tip} {...tooltip(tip)}>
            <Icon name={TIP_ICONS[i]!} className="size-3.5" />
          </span>
        ))}
    </button>
  );
}

/** One chip centred in every empty container of the canvas page. */
export function EmptyHintLayer() {
  const store = useEditorStore();
  const { doc, frame, host, version } = useCanvasFrame();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const page = useEditorState((s) => canvasPage(s));
  const primary = useEditorState((s) => (s.selection.primary?.alive ? s.selection.primary : null));
  const empties = useEditorState(
    (s) => (page && s.files.has(page) ? store.find(page, "*").filter(showsEmptyHint) : []),
    (a, b) => a.length === b.length && a.every((h, i) => h === b[i]),
  );
  const boxes = useMemo(() => {
    if (!doc || !frame || !host) return [];
    return empties.flatMap((h) => {
      const el = elementsFor(doc, editSrcOf(h))[0];
      return el ? [{ h, r: hostRect(toRect(el.getBoundingClientRect()), frame, host, zoom) }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, frame, host, zoom, empties, version]);
  return (
    <div data-slot="EmptyHintLayer" className="pointer-events-none absolute inset-0">
      {boxes.map(({ h, r }) => (
        <div key={editSrcOf(h)} className="absolute flex items-center justify-center" style={{ left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }}>
          <EmptyHint handle={h} selected={h === primary} />
        </div>
      ))}
    </div>
  );
}
