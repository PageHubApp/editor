/**
 * "Previewing: Monstera ▾" in the address pill, on a detail page (`/plants/:slug`, a page that picks its entry with
 * `collections.plants | where: 'slug', request.params.slug`). The canvas previews the list's first entry by default
 * (sampleParams.ts); this lists the collection's entries, from the data the canvas rendered with, and switches which
 * one the page shows. The pick is canvas-only and kept per page for the session (`canvas.previewParams`).
 */
import { useMemo, useRef, useState } from "react";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { tooltip } from "../../primitives/tooltip";
import { Icon } from "../../primitives/icons";
import { canvasDataOf } from "../canvas/canvasContext";
import { canvasOf, canvasPage } from "../canvas/canvasState";
import { collectionFor, useHostCollections } from "../canvas/hostCollections";
import { useRenderStatus } from "../canvas/renderStatus";
import { detailParams, paramValueOf, sampleRequest, valueAt } from "../canvas/sampleParams";
import type { CollectionInfo } from "@pagehub/engine/host";

/** What the switcher calls an entry: its first filled text field other than the one in the URL (`slug`), else a title / name, else its URL value. */
function entryTitle(row: unknown, info: CollectionInfo, field: string, value: string): string {
  for (const key of [...info.fields.filter((f) => f.kind === "text" && f.key !== field).map((f) => f.key), "title", "name"]) {
    const v = valueAt(row, key);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return value;
}

export function DetailPreviewPicker() {
  const store = useEditorStore();
  const run = useRunCommand();
  const page = useEditorState(canvasPage);
  const source = useEditorState((s) => (page ? (s.files.get(page) ?? "") : ""));
  const chosen = useEditorState((s) => (page ? canvasOf(s).previewParams[page] : undefined));
  const status = useRenderStatus(store); // the entries come from the data of the last canvas render
  const cols = useHostCollections();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const target = useMemo(() => {
    for (const p of detailParams(source)) {
      const info = cols ? collectionFor(cols.list, p.list) : null;
      if (info) return { ...p, info };
    }
    return null;
  }, [source, cols]);
  if (!page || !target) return null;

  void status.painted;
  const data = canvasDataOf(store);
  const rows = data ? valueAt(data, target.list) : null;
  const entries = (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const value = paramValueOf(row, target.field);
    return value ? [{ value, title: entryTitle(row, target.info, target.field, value) }] : [];
  });
  const current = data ? sampleRequest(source, data, chosen).params[target.name] : undefined;
  const title = entries.find((e) => e.value === current)?.title ?? "";
  const pick = (value: string) => {
    setOpen(false);
    run("canvas.previewParams", { path: page, params: { [target.name]: value } });
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        data-preview-entry={current ?? ""}
        aria-expanded={open}
        disabled={!entries.length}
        onClick={() => setOpen((o) => !o)}
        className="bg-base-content/[0.06] hover:bg-base-content/10 text-base-content/70 hover:text-base-content flex h-6 w-44 shrink-0 items-center gap-1 rounded-full px-2 text-xs transition-colors disabled:opacity-60"
        {...tooltip(`Which ${target.info.name} entry this page shows while you edit. Visitors see the one in the address they open.`, "bottom")}
      >
        <span className="shrink-0 opacity-70">Previewing:</span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{title}</span>
        <Icon name="chevron-down" className={`size-3 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnchoredPopover open={open} onOpenChange={setOpen} anchor={anchor} immediate placement="bottom-start" mainAxisOffset={6} maxHeightCeiling={400} className="ph-panel bg-base-100 text-base-content border-base-300 flex min-w-[220px] flex-col overflow-hidden rounded-lg border shadow-lg">
        <div className="border-base-300 text-base-content/60 border-b px-3 py-2 text-[10px] font-medium tracking-wide uppercase">{target.info.name}</div>
        <div className="scrollbar flex-1 overflow-y-auto" role="listbox" aria-label={`${target.info.name} entries`}>
          {entries.map((e) => (
            <button key={e.value} type="button" role="option" aria-selected={e.value === current} data-preview-option={e.value} onClick={() => pick(e.value)} className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors ${e.value === current ? "border-primary bg-base-200 font-medium" : "hover:bg-base-200/60 border-transparent"}`}>
              <span className="truncate">{e.title}</span>
            </button>
          ))}
        </div>
      </AnchoredPopover>
    </>
  );
}
