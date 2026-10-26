/**
 * "Insert component ▸": a 280×360 flyout of the Add panel's component tiles with search,
 * category headers and "Open components tab". Picking inserts as the last child when the
 * target is a container, otherwise after it, then closes the menu.
 */
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../react/bindings";
import { searchTiles, useToolCategories, type ToolTile } from "../add/ComponentsTab";
import { MENU_ITEM } from "./MenuSurface";

export const FLYOUT_SIZE = { width: 280, height: 360 } as const;

export function ComponentFlyout({ onPicked }: { onPicked(): void }) {
  const store = useEditorStore();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const cats = searchTiles(useToolCategories(), query);
  useEffect(() => input.current?.focus(), []);
  const pick = (tile: ToolTile) => {
    const at = store.state.selection.primary;
    if (at?.alive) store.run("element.insert", { ...tile.insert, to: { append: at } });
    onPicked();
  };
  return (
    <div data-flyout="components" style={FLYOUT_SIZE} className="border-base-300/50 bg-base-100 absolute top-0 left-full z-10 flex flex-col overflow-hidden rounded-xl border shadow-xl">
      <input
        ref={input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search components"
        aria-label="Search components"
        className="border-base-300 bg-base-100 m-2 shrink-0 rounded-md border px-2 py-1 text-xs outline-none"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        {cats.length === 0 && <p className="text-base-content/60 px-3 py-2 text-xs">No components found</p>}
        {cats.map((c) => (
          <div key={c.title}>
            <div className="text-base-content/50 px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide uppercase">{c.title}</div>
            {c.tiles.map((t) => (
              <button key={t.key} type="button" role="menuitem" data-tile={t.key} className={MENU_ITEM} onClick={() => pick(t)}>
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button type="button" data-flyout-open-tab="" className={`${MENU_ITEM} border-base-300 shrink-0 border-t`} onClick={() => (store.run("insert.open", { tab: "components" }), onPicked())}>
        Open components tab
      </button>
    </div>
  );
}
