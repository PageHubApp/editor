/**
 * The Components tab's "Collection list" tile (shown only when the host lists the site's collections). Clicking it
 * (or double-click / Enter) asks which collection; picking one inserts a card grid bound to that collection's fields
 * (`collectionListMarkup`) as one `element.insert`, then selects the repeated card so the inspector shows its Data
 * source. "New collection…" hands over to the host's form. It doesn't drag: the drop needs a collection first.
 */
import { useRef, useState } from "react";
import type { NodeHandle, Store } from "@pagehub/engine";
import type { CollectionInfo } from "@pagehub/engine/host";
import { useEditorStore } from "../../react/bindings";
import { ListboxPopover } from "../../primitives/ListboxPopover";
import { tooltip } from "../../primitives/tooltip";
import { useHostCollections } from "../canvas/hostCollections";
import { insertComponent } from "./insertTarget";
import { collectionListMarkup } from "./collectionListMarkup";
import type { ToolTile } from "./ComponentsTab";
import { TileFace } from "./panelParts";

export const COLLECTION_LIST_KEY = "collection-list";

export const COLLECTION_LIST_TILE: ToolTile = {
  key: COLLECTION_LIST_KEY,
  label: "Collection list",
  icon: "layout-grid",
  category: "Lists",
  description: "Shows a collection's entries as cards. Click to pick the collection.",
  insert: {},
  picker: "collection",
};

/** The first element repeated by a `{% for %}` under `root` (the card), else null. */
function repeatedCard(root: NodeHandle): NodeHandle | null {
  for (const c of root.children()) {
    if (c.kind === "liquid-block" && c.tag === "for") return c.children().find((x) => x.kind === "element") ?? null;
    const found = c.kind === "element" || c.kind === "liquid-block" ? repeatedCard(c) : null;
    if (found) return found;
  }
  return null;
}

/** Insert the bound grid for `c` and select its card. */
export function insertCollectionList(store: Store, c: CollectionInfo): boolean {
  if (!insertComponent(store, { snippet: collectionListMarkup(c) })) return false;
  const root = store.state.selection.primary;
  const card = root?.alive ? repeatedCard(root) : null;
  if (card) store.select(card);
  return true;
}

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

export function CollectionListTile({ tile }: { tile: ToolTile }) {
  const store = useEditorStore();
  const host = useHostCollections();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const create = host?.rows.createCollection;
  const pick = (c: CollectionInfo) => {
    setOpen(false);
    insertCollectionList(store, c);
  };
  const item = "hover:bg-neutral w-full rounded px-2 py-1 text-left";
  return (
    <>
      <div
        ref={anchor}
        {...tooltip(tile.description, "right")}
        role="button"
        tabIndex={0}
        aria-label={tile.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tile={tile.key}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setOpen(true)}
        className="flex h-full w-full min-w-0 cursor-pointer"
      >
        <TileFace icon={tile.icon} label={tile.label} pressed={open} />
      </div>
      <ListboxPopover open={open} onOpenChange={setOpen} anchor={anchor} placement="right-start" dismiss ariaLabel="Pick a collection" marker="data-collection-picker" maxHeight={280}>
        <li role="presentation" className="text-base-content/60 px-2 pt-1 pb-1.5 text-[11px]">Which collection should it list?</li>
        {!host?.loaded && <li role="presentation" className="text-base-content/60 px-2 py-1">Loading collections…</li>}
        {host?.loaded && !host.list.length && <li role="presentation" className="text-base-content/60 px-2 py-1">This site has no collections yet.</li>}
        {host?.list.map((c) => (
          <li key={c.slug} role="option" aria-selected={false}>
            <button type="button" data-collection-pick={c.slug} onClick={() => pick(c)} className={`${item} flex items-center justify-between gap-3`}>
              <span>{c.name}</span>
              <span className="text-base-content/50">{entries(c.count)}</span>
            </button>
          </li>
        ))}
        {create && (
          <li role="option" aria-selected={false}>
            <button type="button" data-collection-pick="" onClick={() => (setOpen(false), create())} className={`${item} text-primary`}>
              New collection…
            </button>
          </li>
        )}
      </ListboxPopover>
    </>
  );
}
