/**
 * The default `IconPicker` slot: a "Select Icon" floating panel over the host's icon catalogue.
 * Search + set dropdown; without a query: Common, Recents, Favorites, the set's categories and
 * "All"; with one: a 7-column grid with arrow-key focus. The value is a ref (`tb/TbPhone`).
 *
 * - Click picks (the panel stays open); double-click or Enter picks and closes; right-click
 *   toggles a favourite (`icon-favorites`, max 100); picks feed Recents (`icon-recents`, max 30).
 * - The caption under the grid names the hovered (else selected) icon.
 */
import { useEffect, useMemo, useState } from "react";
import { iconCatalogueFacet, type IconCategory, type IconSet } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { FloatingPanel } from "../../primitives/FloatingPanel";
import { readJSON, writeJSON } from "../../primitives/storage";
import { HtmlSpan } from "../../primitives/useStableHtml";
import { ToolbarDropdown } from "../toolbar/ToolbarDropdown";
import { ToolbarSection } from "../toolbar/ToolbarSection";
import type { ValuePickerProps } from "../../components";
import { panelPosition } from "./ColorPicker";
import { VirtualList } from "./VirtualList";

const ICON_GRID = { columns: 7, cell: 44, rows: 8 } as const;
const RECENTS = { key: "icon-recents", cap: 30 } as const;
const FAVORITES = { key: "icon-favorites", cap: 100 } as const;
const PANEL = { width: 360, height: 520 } as const;

/** Index after an arrow key in a `columns`-wide grid; unchanged at an edge. */
export function moveFocus(index: number, key: string, count: number, columns: number = ICON_GRID.columns): number {
  const next = { ArrowRight: index + 1, ArrowLeft: index - 1, ArrowDown: index + columns, ArrowUp: index - columns }[key];
  return next !== undefined && next >= 0 && next < count ? next : index;
}

const nameOf = (ref: string) => ref.slice(ref.indexOf("/") + 1);

interface CellProps {
  ref_: string;
  svg: string | null;
  selected: boolean;
  focused?: boolean;
  favorite: boolean;
  on: { pick(r: string): void; open(r: string): void; favorite(r: string): void; hover(r: string | null): void };
}

function IconCell({ ref_, svg, selected, focused, favorite, on }: CellProps) {
  return (
    <button
      type="button"
      role="gridcell"
      aria-selected={selected}
      aria-label={`Icon: ${nameOf(ref_)}${favorite ? " (favorite)" : ""}`}
      tabIndex={focused ? 0 : -1}
      onClick={() => on.pick(ref_)}
      onDoubleClick={() => on.open(ref_)}
      onContextMenu={(e) => (e.preventDefault(), on.favorite(ref_))}
      onMouseEnter={() => on.hover(ref_)}
      onMouseLeave={() => on.hover(null)}
      onFocus={() => on.hover(ref_)}
      className={`relative flex size-full cursor-pointer items-center justify-center rounded-md transition-colors ${selected ? "bg-primary/10 text-primary" : focused ? "ring-primary/40 bg-primary/5 ring-1" : "text-base-content/80 hover:bg-neutral hover:text-base-content"}`}
    >
      <HtmlSpan className="size-[18px] [&>svg]:size-full" aria-hidden html={svg} />
      {favorite && <span aria-hidden className="bg-primary absolute top-1 right-1 size-1 rounded-full" />}
    </button>
  );
}

export function IconPicker({ value, onChange, onClose, anchor }: ValuePickerProps) {
  const catalogue = useEditorState((s) => s.facet(iconCatalogueFacet));
  const [sets, setSets] = useState<readonly IconSet[]>([]);
  const [set, setSet] = useState(() => (value.includes("/") ? value.slice(0, value.indexOf("/")) : "tb"));
  const [names, setNames] = useState<readonly string[]>([]);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState(value);
  const [recents, setRecents] = useState(() => readJSON<string[]>(RECENTS.key, []));
  const [favorites, setFavorites] = useState(() => readJSON<string[]>(FAVORITES.key, []));

  useEffect(() => void Promise.resolve(catalogue?.sets()).then((s) => s && setSets(s)), [catalogue]);
  useEffect(() => void Promise.resolve(catalogue?.names(set)).then((n) => n && setNames(n)), [catalogue, set]);
  useEffect(() => setFocused(0), [set, search]);

  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  }, [names, search]);
  const categories: readonly IconCategory[] = useMemo(() => catalogue?.categories?.(set) ?? [], [catalogue, set]);

  const open = (ref: string) => {
    const next = [ref, ...recents.filter((r) => r !== ref)].slice(0, RECENTS.cap);
    setRecents(next);
    writeJSON(RECENTS.key, next);
    onChange(ref);
    onClose?.();
  };
  const on: CellProps["on"] = {
    pick: (r) => (setSelected(r), onChange(r)),
    open,
    favorite: (r) => {
      const next = favorites.includes(r) ? favorites.filter((f) => f !== r) : [r, ...favorites].slice(0, FAVORITES.cap);
      setFavorites(next);
      writeJSON(FAVORITES.key, next);
    },
    hover: setHover,
  };
  const cell = (r: string, focus = false) => <IconCell ref_={r} svg={catalogue?.svg(r) ?? null} selected={selected === r} focused={focus} favorite={favorites.includes(r)} on={on} />;
  const grid = (refs: readonly string[]) =>
    refs.length === 0 ? (
      <div className="text-neutral-content px-3 py-4 text-center text-xs">No icons.</div>
    ) : (
      <div role="grid" aria-label="Icons" className="grid grid-cols-5 gap-1">
        {refs.map((r) => (
          <div key={r} className="aspect-square">
            {cell(r)}
          </div>
        ))}
      </div>
    );
  const virtual = (list: readonly string[], label: string, focus: boolean) => (
    <VirtualList
      role="grid"
      ariaLabel={label}
      count={list.length}
      columns={ICON_GRID.columns}
      itemSize={ICON_GRID.cell}
      height={ICON_GRID.rows * ICON_GRID.cell}
      scrollToIndex={focus ? focused : undefined}
      renderItem={(i) => <div className="size-full p-0.5">{cell(`${set}/${list[i]}`, focus && focused === i)}</div>}
    />
  );
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!search || found.length === 0) return;
    if (e.key === "Enter") return void (e.preventDefault(), found[focused] && open(`${set}/${found[focused]}`));
    if (e.key.startsWith("Arrow")) (e.preventDefault(), setFocused((f) => moveFocus(f, e.key, found.length)));
  };
  const shown = hover ?? (selected || null);
  const position = anchor ? panelPosition(anchor.getBoundingClientRect(), PANEL.width, window.innerWidth) : undefined;

  return (
    <FloatingPanel isOpen onClose={() => onClose?.()} title="Select Icon" storageKey="icon-picker" autoSize={false} defaultWidth={PANEL.width} defaultHeight={PANEL.height} minWidth={320} maxWidth={640} minHeight={360} initialPosition={position}>
      <div data-slot="IconPicker" className="contents">
        {!catalogue ? (
          <p className="text-neutral-content p-4 text-center text-xs">No icon catalogue is configured.</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col" onKeyDown={onKeyDown}>
            <div className="flex shrink-0 items-center gap-2 px-3 py-2">
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search icons..." aria-label="Search icons" autoFocus className="input-plain border-base-300 bg-base-200 h-8 flex-1 rounded-md border px-2 text-xs" />
              <div className="w-32 shrink-0">
                <ToolbarDropdown value={set} onChange={(s) => (setSet(s), setSearch(""))} placeholder="Icon set">
                  {(sets.length ? sets : [{ id: set, name: set }]).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </ToolbarDropdown>
              </div>
            </div>
            {search && <div className="text-neutral-content shrink-0 px-3 pb-1 text-[10px]">{`${found.length} result${found.length === 1 ? "" : "s"}`}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {search ? (
                virtual(found, "Icons grid", true)
              ) : (
                <>
                  <ToolbarSection title="Common" passive defaultOpen>
                    {grid(catalogue.common ?? [])}
                  </ToolbarSection>
                  {recents.length > 0 && (
                    <ToolbarSection title={`Recents · ${recents.length}`} passive defaultOpen={false}>
                      {grid(recents)}
                    </ToolbarSection>
                  )}
                  {favorites.length > 0 && (
                    <ToolbarSection title={`Favorites · ${favorites.length}`} passive defaultOpen={false}>
                      {grid(favorites)}
                    </ToolbarSection>
                  )}
                  {categories.map((c) => (
                    <ToolbarSection key={`${set}:${c.key}`} title={`${c.label} · ${c.refs.length}`} passive defaultOpen={false} scrollHeight={c.refs.length > 50 ? "280px" : undefined}>
                      {grid(c.refs)}
                    </ToolbarSection>
                  ))}
                  {names.length > 0 && (
                    <ToolbarSection title={`All · ${names.length.toLocaleString()}`} passive defaultOpen={categories.length === 0}>
                      {virtual(names, `All ${set} icons`, false)}
                    </ToolbarSection>
                  )}
                </>
              )}
            </div>
            <div className="border-base-300 bg-neutral text-neutral-content flex h-10 shrink-0 items-center gap-2 border-t px-3 text-xs">
              {shown ? (
                <>
                  <HtmlSpan className="text-base-content size-5 shrink-0 [&>svg]:size-full" aria-hidden html={catalogue.svg(shown)} />
                  <span className="text-base-content truncate font-mono text-[11px]">{nameOf(shown)}</span>
                  <span className="text-neutral-content/60 shrink-0 tracking-wide uppercase">{shown.slice(0, shown.indexOf("/"))}</span>
                </>
              ) : (
                <span className="text-neutral-content/60">Hover an icon to preview</span>
              )}
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
