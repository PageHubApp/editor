/**
 * Picture controls, each one media picker (thumbnail + file name, Replace / Clear through the
 * `MediaManager` slot) with the raw value only behind "Edit as expression":
 * - an image's Source: `src` in the converter's forms (`mediaRef`) — a library file is written as
 *   the `image_url` filter on its id, a bound value (`item.image`) shows as a variable chip;
 * - the Background image row: the arbitrary background-image url class (the converter writes the
 *   file's URL there, since a class can't hold Liquid) plus its size, position, repeat and
 *   attachment classes.
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
import { useAttrs } from "../useAttrs";
import { GroupValueRow } from "./groupFields";

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
  const { read, write } = useAttrs(handle);
  const src = read("src") ?? "";
  const ref = parseMediaSrc(src);
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
      <MediaInput label="Source" value={pickerValue(ref)} onChange={pick} siteLogo={{ light: "{{ company.logo }}", dark: "{{ company.logoDark }}" }} />
      <ExpressionToggle id="image-src-expression" value={src} onCommit={(v) => write("src", v || null)} />
    </div>
  );
}
