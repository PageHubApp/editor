/**
 * Picture controls, each one media picker (thumbnail + file name, Replace / Clear through the
 * `MediaManager` slot) with the raw value only behind "Edit as expression":
 * - an image's Source: `src` in the converter's forms (`mediaRef`) — a library file is written as
 *   the `image_url` filter on its id, a bound value (`item.image`) shows as a variable chip;
 * - the Background image row: the arbitrary background-image url class (the converter writes the
 *   file's URL there, since a class can't hold Liquid) plus its size, position, repeat and
 *   attachment classes.
 * - inside a list of a collection's entries, an image's "From" row picks one of the collection's
 *   photo fields (written `{{ item.photo | image_url: width: 800 }}`, the bound form) or goes
 *   back to a fixed image.
 *
 *   <BgImageControl handle={h} />
 *   <ImageSrcControl handle={h} />
 */
import { useState } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { boundSrc, mediaSrc, parseMediaSrc, type MediaRef } from "../../media/mediaRef";
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { mediaFacet } from "@pagehub/engine/host";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { useUi, uiScopeEq } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import { MediaInput } from "../../media/MediaInput";
import { ExpressionField, PanelNote } from "../../liquid/LiquidFields";
import { useBoundAttrs } from "./useBoundAttrs";
import { GroupValueRow } from "./groupFields";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { useHostCollections } from "../../canvas/hostCollections";
import { fieldLabel, imageFields, loopCollection, type LoopCollection } from "../../liquid/collectionFields";

const TW = ["tailwind"] as const;

/** A picked media value (an id, or an expression / URL) → the URL to write. */
function useResolveMedia() {
  const store = useEditorState((s) => s.facet(mediaFacet));
  return async (v: string): Promise<string> => {
    if (!v || v.includes("{{") || /^(https?:|\/|data:)/.test(v) || !store) return v;
    const items = await Promise.resolve(store.list());
    return items.find((i) => i.id === v)?.url ?? v;
  };
}

/** The background-image url class ↔ its url (Tailwind arbitrary values carry no spaces). No literal example class in
 * comments here: the editor sheet scans this source, and a sample url would compile into a broken `url()` import. */
const urlOf = (token: string) => /^bg-\[url\((.*)\)\]$/.exec(token)?.[1]?.replace(/^['"]|['"]$/g, "") ?? "";
const URL_OPEN = "bg-[" + "url("; // split so the sheet's source scan never sees a class candidate here
const tokenOf = (url: string) => (url ? `${URL_OPEN}${url.trim().replace(/ /g, "%20")})]` : null);

export function BgImageControl() {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get("bg-image"));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  const resolve = useResolveMedia();
  if (!handle || !def) return null;
  const url = urlOf(readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "");
  const write = (u: string) => void run("classes.set", { group: "bg-image", token: tokenOf(u), scopes: writeScopes(ui), at: handle });
  return (
    <div data-bg-image-control="" className="flex flex-col gap-2">
      <MediaInput label="Image" value={url} onChange={(v) => void resolve(v).then(write)} />
      <ExpressionToggle id="bg-image-expression" value={url} onCommit={write} />
      {url && (
        <>
          <GroupValueRow group="bg-size" label="Size" options={["bg-cover", "bg-contain", "bg-auto"]} allowedTypes={TW} />
          <GroupValueRow group="bg-position" label="Position" options={["bg-center", "bg-top", "bg-bottom", "bg-left", "bg-right", "bg-top-left", "bg-top-right", "bg-bottom-left", "bg-bottom-right"]} allowedTypes={TW} />
          <GroupValueRow group="bg-repeat" label="Repeat" options={["bg-no-repeat", "bg-repeat", "bg-repeat-x", "bg-repeat-y"]} allowedTypes={TW} />
          <GroupValueRow group="bg-attachment" label="Scroll" options={["bg-scroll", "bg-fixed", "bg-local"]} allowedTypes={TW} />
          <PanelNote>Fixed keeps the picture still while the page scrolls (parallax).</PanelNote>
        </>
      )}
    </div>
  );
}

/** "Edit as expression": the raw value, for what the picker can't express. */
function ExpressionToggle({ id, value, onCommit }: { id: string; value: string; onCommit(v: string): void }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <ExpressionField id={id} label="Expression" value={value} autoFocus onCommit={(v) => (onCommit(v), setOpen(false))} />
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="text-base-content/55 hover:text-base-content self-end text-[11px]">
      Edit as expression
    </button>
  );
}

/** The MediaInput value for a parsed src: a library id, `{{ path }}` for a bound value, else the text. */
function pickerValue(ref: MediaRef): string {
  if (ref.kind === "media") return ref.id;
  if (ref.kind === "bound") return `{{ ${ref.path} }}`;
  if (ref.kind === "url") return ref.url;
  return ref.kind === "expression" ? ref.raw : "";
}

export function ImageSrcControl({ handle }: { handle: NodeHandle }) {
  const { read, write } = useBoundAttrs(handle);
  const src = read("src") ?? "";
  const ref = parseMediaSrc(src);
  const host = useHostCollections();
  const file = useEditorState((s) => s.files.get(handle.path) ?? "");
  const loop = host ? loopCollection(handle, host.list, file) : null;
  const args = ref.kind === "media" || ref.kind === "bound" ? ref.args : "";
  // A pick is a library id (written in the converter's `image_url` form), a dynamic `{{ path }}`, or a URL.
  const pick = (v: string) => {
    if (!v) return write("src", null);
    const bare = /^\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}$/.exec(v);
    if (bare) return write("src", boundSrc(bare[1]!, args));
    if (v.includes("{{") || /^(https?:|\/|data:)/.test(v)) return write("src", v);
    return write("src", mediaSrc(v, args));
  };
  return (
    <div data-image-src-control="" className="flex flex-col gap-1">
      <MediaInput label="Source" value={pickerValue(ref)} boundLabel={ref.kind === "bound" ? (fieldLabel(loop, `{{ ${ref.path} }}`) ?? undefined) : undefined} onChange={pick} siteLogo={{ light: "{{ company.logo }}", dark: "{{ company.logoDark }}" }} />
      <FieldSource loop={loop} ref_={ref} onPick={(path) => write("src", path ? boundSrc(path, args || FIELD_ARGS) : null)} />
      <ExpressionToggle id="image-src-expression" value={src} onCommit={(v) => write("src", v || null)} />
    </div>
  );
}

/** The size a field image is first written at (the converter's card size). */
const FIELD_ARGS = ": width: 800";
const FIXED = "__fixed__";

/** "From": a fixed image, or one of the photo fields of the collection the image repeats over. Shown only inside such a list. */
function FieldSource({ loop, ref_, onPick }: { loop: LoopCollection | null; ref_: MediaRef; onPick(path: string | null): void }) {
  const photos = imageFields(loop);
  if (!loop || !photos.length) return null;
  const prefix = `${loop.item}.`;
  const key = ref_.kind === "bound" && ref_.path.startsWith(prefix) ? ref_.path.slice(prefix.length) : "";
  const current = photos.some((f) => f.key === key) ? key : FIXED;
  const choose = (v: string) => {
    if (v === current) return;
    if (v !== FIXED) return onPick(`${prefix}${v}`);
    if (ref_.kind === "bound") onPick(null);
  };
  return (
    <div data-image-field-source="">
      <ToolbarItemView type="select" inputId="image-src-field" label="From" value={current} onChange={choose}>
        <option value={FIXED}>A fixed image</option>
        <optgroup label={`${loop.collection.name} fields`}>
          {photos.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </optgroup>
      </ToolbarItemView>
    </div>
  );
}
