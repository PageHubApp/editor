/**
 * The default `FontPicker` slot: a popover under its anchor with search, a category dropdown
 * (All Fonts / Popular / Serif / Sans Serif / Display / Handwriting / Monospace, with counts)
 * and a windowed list of 32px rows, each set in its own face. The value is a family name.
 *
 * - Hover or arrow-key focus previews through `onPreview(family)`; leaving the list (or closing
 *   without picking) restores with `onPreview(null)`.
 * - Click or Enter picks and closes; the first 30 families of the tab are loaded for the
 *   preview through the catalogue's `load`.
 * - Esc closes through the overlay stack.
 */
import { useEffect, useMemo, useState } from "react";
import { FONT_TABS, fontCatalogueFacet, fontsInTab, type FontFamily, type FontTab } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { ToolbarDropdown } from "../toolbar/ToolbarDropdown";
import type { FontPickerProps } from "../../components";
import { VirtualList } from "./VirtualList";

const ROW = 32;
const LIST_HEIGHT = 300;
const PRELOAD = 30;


export function FontPicker({ value, onChange, onClose, onPreview, anchor, zIndex }: FontPickerProps) {
  const catalogue = useEditorState((s) => s.facet(fontCatalogueFacet));
  const [all, setAll] = useState<readonly FontFamily[]>([]);
  const [tab, setTab] = useState<FontTab>("All Fonts");
  const [search, setSearch] = useState("");
  const [index, setIndex] = useState(-1);
  useEffect(() => void Promise.resolve(catalogue.families()).then(setAll), [catalogue]);

  const tabs = useMemo(() => FONT_TABS.map((t) => ({ tab: t, count: fontsInTab(all, t).length })), [all]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fontsInTab(all, tab).filter((f) => !q || f.family.toLowerCase().includes(q));
  }, [all, tab, search]);
  useEffect(() => list.slice(0, PRELOAD).forEach((f) => catalogue.load?.(f.family, ["400"])), [list, catalogue]);

  const close = () => (onPreview?.(null), onClose?.());
  const pick = (family: string) => {
    catalogue.load?.(family, ["400", "700"]);
    onChange(family);
    onClose?.();
  };
  const focus = (next: number) => {
    setIndex(next);
    if (list[next]) onPreview?.(list[next]!.family);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focus(Math.max(0, Math.min(list.length - 1, index + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && list[index]) {
      e.preventDefault();
      pick(list[index]!.family);
    }
  };
  const width = anchor?.getBoundingClientRect().width || 308;

  return (
    <AnchoredPopover open onOpenChange={(o) => !o && close()} anchor={anchor} maxHeightCeiling={400} style={{ width }} className="ph-panel overflow-hidden p-0" {...(zIndex !== undefined ? { zIndex } : {})}>
      <div data-slot="FontPicker" className="contents">
        <div onKeyDown={onKeyDown}>
          <div className="border-base-300 bg-neutral shrink-0 border-b px-2 pt-2 pb-1">
            <div className="flex gap-2">
              <input type="text" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fonts..." aria-label="Search fonts" className="input-dialog-sm flex-1" />
              <div className="w-36 shrink-0">
                <ToolbarDropdown value={tab} onChange={(t) => setTab(t as FontTab)}>
                  {tabs.map((t) => (
                    <option key={t.tab} value={t.tab}>{`${t.tab} (${t.count})`}</option>
                  ))}
                </ToolbarDropdown>
              </div>
            </div>
          </div>
          <div className="px-2 py-1" onMouseLeave={() => (setIndex(-1), onPreview?.(null))}>
            <VirtualList
              role="listbox"
              ariaLabel="Fonts"
              count={list.length}
              itemSize={ROW}
              height={LIST_HEIGHT}
              scrollToIndex={index}
              renderItem={(i) => {
                const f = list[i]!;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={f.family === value}
                    onClick={() => pick(f.family)}
                    onMouseEnter={() => focus(i)}
                    style={{ fontFamily: `"${f.family}", ${f.category}`, fontSize: 14, height: ROW }}
                    className={`text-neutral-content hover:bg-neutral flex w-full cursor-pointer flex-row truncate rounded-md p-1 text-xs whitespace-nowrap transition-colors ${f.family === value ? "bg-primary text-primary-content" : ""} ${index === i ? "border-primary/20 bg-primary/10 border" : ""}`}
                  >
                    <span className="flex-1 text-left">{f.family}</span>
                    {index === i && <span className="text-primary/60 ml-2 text-xs">Preview</span>}
                  </button>
                );
              }}
            />
          </div>
        </div>
      </div>
    </AnchoredPopover>
  );
}
