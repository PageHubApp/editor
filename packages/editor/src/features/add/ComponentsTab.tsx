/**
 * The Components tab: one tile per element definition with an `insert` entry (plus the
 * Automatic tile), grouped by category in today's order (Layout, Text, Buttons, Images, Icons,
 * Interactive, Navigation, Forms, Media, Embeds, Dividers, Stripe, Lists, Tables, Grid,
 * Components, then host categories); empty categories are hidden. Search (focused after 50ms,
 * from 1 character) matches a tile's label or element name; a category whose title matches
 * shows whole. The category filter narrows to one. A tile drags onto the canvas
 * (`useInsertDrag`, accent while pressed) or inserts on double-click or Enter (a tile is a focusable button named by its label); its tooltip (500ms,
 * right) is the description plus "Drag · Double-click".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { elementsFacet } from "@pagehub/engine";
import { escapeHtml } from "@pagehub/engine/render";
import { componentNames, partialPath, type InsertArgs } from "@pagehub/engine/kits";
import { profileFacet } from "@pagehub/engine/host";
import { activePartial } from "../board/boardState";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { useInsertDrag } from "../dnd/useInsertDrag";
import { TOOLTIP_ID } from "../../primitives/tooltip";
import { Icon, type IconName } from "../../primitives/icons";
import { glyphFor } from "../layers/glyphs";
import { addPanelOf } from "./addPanelState";
import { insertComponent } from "./insertTarget";
import { capital } from "./useBlocks";
import { toolboxTiles } from "./toolboxCatalog";
import { FilterDropdown, PanelHeaderRow, PanelScrollSpacer, SearchInput } from "./panelParts";

export const TOOLBOX_HINT_DELAY_MS = 500;

const CATEGORY_TITLES: Record<string, string> = {
  layout: "Layout", text: "Text", buttons: "Buttons", images: "Images", icons: "Icons", interactive: "Interactive", navigation: "Navigation",
  form: "Forms", forms: "Forms", media: "Media", embeds: "Embeds", dividers: "Dividers", stripe: "Stripe", lists: "Lists", tables: "Tables", grid: "Grid", components: "Components",
};
const ORDER = ["Layout", "Text", "Buttons", "Images", "Icons", "Interactive", "Navigation", "Forms", "Media", "Embeds", "Dividers", "Stripe", "Lists", "Tables", "Grid", "Components"];

export interface ToolTile {
  key: string;
  label: string;
  icon: IconName;
  category: string;
  description?: string;
  insert: InsertArgs;
}

const AUTOMATIC_TILE: ToolTile = { key: "automatic", label: "Automatic", icon: "sparkles", category: "Layout", description: "Becomes what its spot needs: a row inside a column, a column inside a row.", insert: { automatic: true } };

const DRAG_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11v-3.5a1.5 1.5 0 0 1 3 0v2.5"/><path d="M11 9.5v-3a1.5 1.5 0 0 1 3 0v3.5"/><path d="M14 7.5a1.5 1.5 0 0 1 3 0v2.5"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/></svg>`;
const DBL_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5"/><path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5"/><path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/><path d="M5 3l-1 -1"/><path d="M4 7h-1"/><path d="M14 3l1 -1"/><path d="M15 6h1"/></svg>`;

/** The insert hint tooltip (description, then "Drag · Double-click"), shared by tiles and block cards. */
export function insertHint(description?: string): Record<string, string | number> {
  const desc = description ? `<div style="margin-bottom:4px;line-height:1.4">${escapeHtml(description)}</div>` : "";
  const actions = `<div style="display:flex;gap:10px;opacity:0.6;font-size:10px;line-height:1"><span style="display:inline-flex;align-items:center;gap:3px">${DRAG_ICON} Drag</span><span style="display:inline-flex;align-items:center;gap:3px">${DBL_ICON} Double-click</span></div>`;
  return { "data-tooltip-id": TOOLTIP_ID, "data-tooltip-html": desc + actions, "data-tooltip-delay-show": TOOLBOX_HINT_DELAY_MS, "data-tooltip-place": "right" };
}

function Tile({ tile }: { tile: ToolTile }) {
  const store = useEditorStore();
  const { onPointerDown, pressed } = useInsertDrag(tile.insert, tile.label);
  return (
    <div {...insertHint(tile.description)} role="button" tabIndex={0} aria-label={tile.label} data-tile={tile.key} data-pressed={pressed ? "" : undefined} onPointerDown={onPointerDown} onDoubleClick={() => insertComponent(store, tile.insert)} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && insertComponent(store, tile.insert)} className="flex h-full w-full min-w-0 cursor-grab active:cursor-grabbing">
      <div className={`border-base-300 bg-base-200 text-base-content hover:bg-accent pointer-events-auto mx-auto h-full w-full max-w-24 rounded-lg border ${pressed ? "border-accent bg-accent text-accent-content" : ""}`}>
        <div className="pointer-events-none flex h-full min-h-[60px] w-full flex-col items-center gap-1.5 px-1 pt-3 pb-2 transition-colors">
          <span className="shrink-0 text-2xl"><Icon name={tile.icon} className="size-6" /></span>
          <div className="flex flex-1 items-center justify-center">
            <span className="text-center text-[10px]">{tile.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The category the site's own partials appear under, last. */
export const REUSABLE_TITLE = "Reusable components";

/** "promo-bar" → "Promo bar". */
export const componentLabel = (name: string) => capital(name.replace(/-/g, " "));

/**
 * One tile per reusable component (`componentNames`: the site's partials, minus code-only ones), inserting
 * `{% render '<name>' %}`. The partial open on the canvas is left out: a component can't contain itself.
 */
export function reusableTiles(names: readonly string[], editing: string | null): ToolTile[] {
  return names
    .filter((n) => partialPath(n) !== editing)
    .map((n) => ({ key: `partial:${n}`, label: componentLabel(n), icon: "copy" as IconName, category: REUSABLE_TITLE, description: "Edit it once and every copy changes.", insert: { snippet: `{% render '${n}' %}` } }));
}

/**
 * Tiles grouped by category title, in today's order; empty categories never appear. An editing profile
 * (`profileFacet`, e.g. the email profile) narrows the element tiles, can drop the toolbox presets / Automatic /
 * reusable components, and adds its own tiles.
 */
export function useToolCategories(): { title: string; tiles: ToolTile[] }[] {
  const elements = useEditorState((s) => s.facet(elementsFacet));
  const names = useEditorState((s) => componentNames(s.files).join("\n"));
  const editing = useEditorState(activePartial);
  const profile = useEditorState((s) => s.facet(profileFacet));
  return useMemo(() => {
    const groups = new Map<string, ToolTile[]>();
    const add = (t: ToolTile) => groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
    const allowed = profile?.elements ? new Set(profile.elements) : null;
    for (const el of elements) {
      if (!el.insert || (allowed && !allowed.has(el.name))) continue;
      const cat = el.insert.category ?? "components";
      add({ key: el.name, label: el.insert.label, icon: glyphFor(el.insert.icon), category: CATEGORY_TITLES[cat] ?? capital(cat), description: el.describe, insert: { element: el.name } });
    }
    if (profile?.toolbox !== false) {
      add(AUTOMATIC_TILE);
      for (const t of toolboxTiles()) add(t);
      for (const t of reusableTiles(names ? names.split("\n") : [], editing)) add(t);
    }
    for (const t of profile?.tiles ?? []) add({ key: t.key, label: t.label, icon: glyphFor(t.icon), category: t.category, description: t.description, insert: { snippet: t.snippet } });
    const rank = (t: string) => (t === REUSABLE_TITLE ? ORDER.length + 1 : ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);
    return [...groups].map(([title, tiles]) => ({ title, tiles })).sort((a, b) => rank(a.title) - rank(b.title));
  }, [elements, names, editing, profile]);
}

export function searchTiles(cats: { title: string; tiles: ToolTile[] }[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return cats;
  return cats.flatMap((c) => {
    const tiles = c.tiles.filter((t) => `${t.label} ${t.key}`.toLowerCase().includes(q));
    return tiles.length ? [{ ...c, tiles }] : c.title.toLowerCase().includes(q) ? [c] : [];
  });
}

export function ComponentsTab() {
  const run = useRunCommand();
  const query = useEditorState((s) => addPanelOf(s).query);
  const cats = useToolCategories();
  const [filter, setFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);
  const list = searchTiles(filter ? cats.filter((c) => c.title === filter) : cats, query);
  return (
    <div data-add-components="" className="flex flex-1 flex-col overflow-hidden">
      <PanelHeaderRow>
        <SearchInput ref={input} value={query} onChange={(q) => run("insert.set", { query: q })} placeholder="Search components..." />
        <FilterDropdown label="Category" icon="category" value={filter} open={filterOpen} onOpenChange={setFilterOpen} items={cats.map((c) => ({ name: c.title, count: c.tiles.length }))} onSelect={(n) => (setFilter(n), setFilterOpen(false))} onClear={() => setFilter(null)} />
      </PanelHeaderRow>
      <div className="scrollbar flex-1 overflow-y-auto">
        {list.map((c) => (
          <div key={c.title} data-tile-category={c.title} className="border-base-300">
            <div className="text-base-content/70 mt-3 mb-1 ml-4 text-xs font-bold">{c.title}</div>
            <div className="border-base-300 grid w-full grid-cols-3 gap-3 border-t p-3">
              {c.tiles.map((t) => (
                <div key={t.key} className="flex min-w-0 justify-center">
                  <Tile tile={t} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <PanelScrollSpacer />
      </div>
    </div>
  );
}
