/**
 * Picture controls, each one media picker (through the `MediaManager` slot) with the raw value only behind
 * "Use a web address":
 * - an image's Source: a preview card (the picture, its name and size, Replace / Remove); `src` in the
 *   converter's forms (`mediaRef`) — a library file is written as the `image_url` filter on its id, a bound
 *   value (`item.image`) shows as a variable chip. Picking a library file onto an image with no `alt` copies
 *   the file's alt from the library in the same write (one undo step); an alt already there is never touched;
 * - the Background image row: the arbitrary background-image url class (the converter writes the
 *   file's URL there, since a class can't hold Liquid) plus its size, position, repeat and
 *   attachment classes (the compact chip).
 * - inside a list of a collection's entries, an image's Source switches between "Each entry" (one of
 *   the collection's photo fields, written `{{ item.photo | image_url: width: 800 }}`, the bound form)
 *   and "Same for all" (the picker).
 *
 *   <BgImageControl handle={h} />
 *   <ImageSrcControl handle={h} />
 */
import { useState, type ReactNode } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { boundSrc, mediaSrc, parseMediaSrc, type MediaRef } from "../../media/mediaRef";
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { mediaFacet, type MediaItem } from "@pagehub/engine/host";
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

const isLiteral = (v: string) => v.includes("{{") || /^(https?:|\/|data:)/.test(v);

/** The library item of a picked media id; undefined for an expression / URL, or with no store. */
export function useMediaItem() {
  const store = useEditorState((s) => s.facet(mediaFacet));
  return async (v: string): Promise<MediaItem | undefined> => {
    if (!v || isLiteral(v) || !store) return undefined;
    return (await Promise.resolve(store.list())).find((i) => i.id === v);
  };
}

/** A picked media value (an id, or an expression / URL) → the URL to write. */
function useResolveMedia() {
  const find = useMediaItem();
  return async (v: string): Promise<string> => (await find(v))?.url ?? v;
}

/** A library alt as an attribute value: no Liquid delimiters, no double quote (the value is written inside `"…"`). */
export const altValue = (alt: string | undefined) => alt?.replace(/[{}]/g, "").replace(/"/g, "'").trim() ?? "";

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
    <ExpressionField id={id} label="Web address or data value" value={value} autoFocus onCommit={(v) => (onCommit(v), setOpen(false))} />
  ) : (
    <button type="button" data-expression-toggle="" onClick={() => setOpen(true)} className="text-base-content/55 hover:text-base-content self-start text-[11px]">
      Use a web address
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
  const { read, write, writeAll } = useBoundAttrs(handle);
  const find = useMediaItem();
  const src = read("src") ?? "";
  const ref = parseMediaSrc(src);
  const host = useHostCollections();
  const file = useEditorState((s) => s.files.get(handle.path) ?? "");
  const loop = host ? loopCollection(handle, host.list, file) : null;
  const args = ref.kind === "media" || ref.kind === "bound" ? ref.args : "";
  // A pick is a library id (written in the converter's `image_url` form, with the library's alt when the
  // element has none), a dynamic `{{ path }}`, or a URL.
  const pick = async (v: string) => {
    if (!v) return write("src", null);
    const bare = /^\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}$/.exec(v);
    if (bare) return write("src", boundSrc(bare[1]!, args));
    if (isLiteral(v)) return write("src", v);
    const alt = (read("alt") ?? "").trim() ? "" : altValue((await find(v))?.alt);
    return writeAll(alt ? { src: mediaSrc(v, args), alt } : { src: mediaSrc(v, args) });
  };
  const picker = (value: string, label = "Source") => (
    <MediaInput variant="card" label={label} value={value} boundLabel={ref.kind === "bound" && value ? (fieldLabel(loop, `{{ ${ref.path} }}`) ?? undefined) : undefined} onChange={(v) => void pick(v)} siteLogo={{ light: "{{ company.logo }}", dark: "{{ company.logoDark }}" }} />
  );
  return (
    <div data-image-src-control="" className="flex flex-col gap-1.5">
      {imageFields(loop).length ? <LoopImageSource loop={loop!} ref_={ref} src={src} picker={picker} onField={(path) => write("src", boundSrc(path, args || FIELD_ARGS))} /> : picker(pickerValue(ref))}
      <ExpressionToggle id="image-src-expression" value={src} onCommit={(v) => write("src", v || null)} />
    </div>
  );
}

/** The size a field image is first written at (the converter's card size). */
const FIELD_ARGS = ": width: 800";

type LoopMode = "field" | "fixed";

/**
 * An image inside a list of a collection's entries: "Each entry" shows every entry's own photo (a photo field of the
 * collection, the bound `image_url` form), "Same for all" one picture on every entry. Switching to "Same for all"
 * writes nothing until a picture is picked, so the entries' photos stay on the canvas meanwhile.
 */
function LoopImageSource({ loop, ref_, src, picker, onField }: { loop: LoopCollection; ref_: MediaRef; src: string; picker(value: string, label?: string): ReactNode; onField(path: string): void }) {
  const photos = imageFields(loop);
  const prefix = `${loop.item}.`;
  const key = ref_.kind === "bound" && ref_.path.startsWith(prefix) ? ref_.path.slice(prefix.length) : "";
  const bound = photos.some((f) => f.key === key);
  // "Same for all" picked while still bound: held until the src changes (a pick, an undo, another element).
  const [fixedFor, setFixedFor] = useState<string | null>(null);
  const mode: LoopMode = bound && fixedFor !== src ? "field" : "fixed";
  const choose = (v: string) => {
    if (v === mode) return;
    if (v === "fixed") return setFixedFor(src);
    setFixedFor(null);
    onField(`${prefix}${photos[0]!.key}`);
  };
  return (
    <>
      <ToolbarItemView
        type="radio"
        inputId="image-src-mode"
        label="Source"
        value={mode}
        onChange={choose}
        options={[
          { value: "field", label: "Each entry", hint: `Each ${loop.collection.name} entry shows its own photo` },
          { value: "fixed", label: "Same for all", hint: "One picture on every entry" },
        ]}
      />
      {mode === "field" ? (
        <>
          <ToolbarItemView type="select" inputId="image-src-field" label="Field" value={key} onChange={(v) => v && v !== key && onField(`${prefix}${v}`)}>
            {photos.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </ToolbarItemView>
          <PanelNote>To change one entry's photo, use the button on its card in the canvas.</PanelNote>
        </>
      ) : (
        <>
          {picker(bound ? "" : pickerValue(ref_), "Image")}
          {bound && <PanelNote>Pick a picture to show on every entry.</PanelNote>}
        </>
      )}
    </>
  );
}
