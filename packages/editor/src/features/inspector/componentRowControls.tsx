/**
 * Component-row controls that `RowControl` dispatches before the structure-note fallback — the
 * real controls for two rows the generic class / attribute / argument seams can't express:
 *
 *   - **Icon `standalone-icon.value`** — the standalone Icon is an inline `<svg>` (engine `html.svg`,
 *     inspector kind "icon", "edited as a whole"). The picker opens the host `IconPicker` slot
 *     (via `IconInput`) and, on a pick, swaps the element's markup for the catalogue SVG of the
 *     chosen ref — the same inline SVG the `{{ 'tb/TbPhone' | icon }}` filter renders — so the
 *     canvas shows the picked icon immediately. The ref round-trips through a `data-icon="<ref>"`
 *     attribute (the same attribute the `icon` filter output carries), and the element's own
 *     `class` / `id` / `data-edit-name` are carried across so size and selection survive the swap.
 *     A converted icon (engine `html.icon`: a `<span>` holding `{{ 'set/Name' | icon }}`) only has its
 *     filter string rewritten, so the span's classes and aria stay as the converter wrote them.
 *
 *   - **Embed `code`** — an Embed's "custom HTML snippet" is the element's own markup. This is the
 *     fallback code editor (the same `CodeEditor` / CodeMirror `CodeView` slot the bespoke
 *     `EmbedCodeControl` uses for an `<iframe>`): it commits one `source.replace` on Apply, so any
 *     embed markup is parser-validated before it lands. `<iframe>` embeds route through the bespoke
 *     `elementControlFor` control first; this keeps the row a real editor for any other Embed the
 *     bespoke gate doesn't catch, never a structure note.
 */
import { type NodeHandle } from "@pagehub/engine";
import { iconCatalogueFacet } from "@pagehub/engine/host";
import { withIconRef } from "@pagehub/engine/kits";
import { escapeAttr } from "@pagehub/engine/render";
import { useEditorState, useRunCommand } from "../../react/bindings";
import type { RowDef } from "./rows/inspectorRows";
import { IconInput } from "../pickers/IconInput";
import { filterIconOf, iconFilterSource, isImageIcon, rawAttrs } from "./iconFilterHandle";
import { CodeEditor } from "../liquid/CodeEditor";
import { MediaInput } from "../media/MediaInput";
import { mediaSrc } from "../media/mediaRef";

/** The element's live icon ref (the filter's string, else the `data-icon` attribute), re-read on every file change. */
function useIconRef(handle: NodeHandle): string {
  return useEditorState((s) => {
    void s.files.get(handle.path);
    return filterIconOf(handle)?.ref ?? (handle.alive && handle.kind === "element" ? (handle.attr("data-icon") ?? "") : "");
  });
}

/** Build the new `<svg>` source for a ref: the catalogue SVG with the element's own attributes carried over. */
function buildIconSvg(svg: string, ref: string, carry: Record<string, string | null | undefined>): string {
  return svg.replace(/^<svg\b/, `<svg data-icon="${escapeAttr(ref)}" ${rawAttrs(carry)}`);
}

/** The converter's form of an image icon (`ref-image`): a span holding a full-size `<img>`, carrying the icon's own class / id / name. */
export function iconImageSource(carry: Record<string, string | null | undefined>, src: string): string {
  const cls = [carry.class, "inline-flex items-center justify-center"].filter(Boolean).join(" ");
  return `<span ${rawAttrs({ ...carry, class: cls })}><img class="size-full object-contain" src="${escapeAttr(src)}" alt=""></span>`;
}

/** Icon element (`<svg>`) — pick a catalogue icon; writes the inline SVG + a `data-icon` ref. */
export function IconValueControl({ handle, row }: { handle: NodeHandle; row: RowDef }) {
  const run = useRunCommand();
  const catalogue = useEditorState((s) => s.facet(iconCatalogueFacet));
  const ref = useIconRef(handle);

  const write = (nextRef: string) => {
    if (!handle.alive || handle.kind !== "element") return;
    // The converter's form: swap only the filter's string, so the span's classes, aria and any filter arguments stay.
    const filter = filterIconOf(handle);
    if (filter) {
      if (nextRef) run("source.replace", { at: handle, text: withIconRef(handle.text(), handle.range.from, filter, nextRef) });
      return;
    }
    const carry = { class: handle.attr("class"), id: handle.attr("id"), "data-edit-name": handle.attr("data-edit-name") };
    // Image form → back to the converter's filter form.
    if (isImageIcon(handle)) {
      if (nextRef) run("source.replace", { at: handle, text: iconFilterSource(carry, nextRef) });
      return;
    }
    if (!nextRef) {
      // Clear: keep the element (so it stays an Icon) but empty it and drop the ref.
      const attrs = rawAttrs(carry);
      run("source.replace", { at: handle, text: `<svg viewBox="0 0 24 24"${attrs ? ` ${attrs}` : ""}></svg>` });
      return;
    }
    const svg = catalogue?.svg(nextRef);
    if (!svg) return; // unknown ref: leave the element as-is
    run("source.replace", { at: handle, text: buildIconSvg(svg, nextRef, carry) });
  };

  // An icon can also be an uploaded picture (a logo mark): the converter's form for a `ref-image` icon,
  // a span holding a full-size `<img>` — the Source row of that image then takes over.
  const writeImage = (id: string) => {
    if (!id || !handle.alive || handle.kind !== "element") return;
    const src = id.includes("{{") || /^(https?:|\/|data:)/.test(id) ? id : mediaSrc(id);
    run("source.replace", { at: handle, text: iconImageSource({ class: handle.attr("class"), id: handle.attr("id"), "data-edit-name": handle.attr("data-edit-name") }, src) });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1" data-icon-control="">
      <IconInput label={row.label} value={ref} onChange={write} />
      <MediaInput label="Image" value="" onChange={writeImage} />
    </div>
  );
}

/** Embed `code` — the fallback markup editor (reuses `CodeEditor`), for any Embed the bespoke gate misses. */
export function EmbedCodeControl({ handle, row }: { handle: NodeHandle; row: RowDef }) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-embed-code="">
      <span className="text-base-content text-xs font-medium">{row.label}</span>
      <CodeEditor handle={handle} />
    </div>
  );
}
