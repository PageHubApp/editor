/**
 * The client's inspector (content mode): no tabs, no class / layout / effects sections — only
 * what the engine's content gate allows. A `{% section %}` shows its settings panel; an
 * element marked `data-editable` shows its value fields (an image through the media card plus its description; a link's
 * `href` through `LinkPicker`);
 * editable text is edited on the canvas, so its panel says so.
 */
import type { NodeHandle } from "@pagehub/engine";
import { EDITABLE_ATTRIBUTE } from "@pagehub/engine";
import { Slot } from "../../components";
import { EmptyInspector } from "../inspector/InspectorStates";
import { LiquidBlockPanel, hasLiquidPanel } from "../liquid/LiquidBlockPanel";
import { useInspectedHandle, useRunCommand } from "../../react/bindings";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { LinkPicker } from "../links/LinkPicker";
import { MediaInput } from "../media/MediaInput";
import { altValue, useMediaItem } from "../inspector/controls/MediaControls";

const FIELDS: Readonly<Record<string, ReadonlyArray<{ attr: string; label: string }>>> = {
  image: [{ attr: "alt", label: "Description" }],
  text: [],
};

/** The `data-editable` kind on this node or its nearest editable ancestor. */
function editableKind(h: NodeHandle): { handle: NodeHandle; kind: string } | null {
  for (let n: NodeHandle | null = h; n; n = n.parent()) {
    const kind = n.kind === "element" ? n.attr(EDITABLE_ATTRIBUTE) : undefined;
    if (kind !== undefined) return { handle: n, kind };
  }
  return null;
}

function EditableFields({ handle, kind }: { handle: NodeHandle; kind: string }) {
  const run = useRunCommand();
  const fields = FIELDS[kind] ?? [];
  return (
    <Slot name="InspectorSection" id={`content-${kind}`} title={kind === "text" ? "Text" : kind === "image" ? "Image" : "Link"}>
      <div className="flex flex-col gap-1.5 px-3 pb-2" data-content-fields="">
        {kind === "link" && <ContentLinkField handle={handle} />}
        {kind === "image" && <ContentImageField handle={handle} />}
        {kind === "text" && <p className="text-base-content/60 text-xs">Click the text on the page to change it.</p>}
        {fields.map((f) => {
          const value = handle.attr(f.attr) ?? "";
          return <ToolbarItemView key={`${f.attr}:${value}`} label={f.label} inputId={`content-${f.attr}`} type="text" value={value} onChange={(v) => run("attr.set", { name: f.attr, value: v, at: handle })} />;
        })}
      </div>
    </Slot>
  );
}

/** A link's address through the shared link picker. Only `href` passes the content gate, so no new-tab choice here. */
function ContentLinkField({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  return <LinkPicker idPrefix="content-link" href={handle.attr("href") ?? ""} onChange={(v) => run("attr.set", { name: "href", value: v, at: handle })} />;
}

/**
 * An image's picture through the media card. The content gate refuses Liquid in a client's values, so a library pick
 * is written as the file's plain address (not the `image_url` form), with the library's description when there is none.
 */
function ContentImageField({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  const find = useMediaItem();
  const set = (name: string, value: string) => run("attr.set", { name, value, at: handle });
  const pick = async (v: string) => {
    const item = await find(v);
    set("src", item?.url ?? v);
    const alt = altValue(item?.alt);
    if (alt && !(handle.attr("alt") ?? "").trim()) set("alt", alt);
  };
  return <MediaInput variant="card" label="Image" value={handle.attr("src") ?? ""} onChange={(v) => void pick(v)} />;
}

export function ContentInspector() {
  const h = useInspectedHandle();
  if (!h?.alive) return <EmptyInspector />;
  if (hasLiquidPanel(h)) return <LiquidBlockPanel handle={h} />;
  const e = editableKind(h);
  return e ? <EditableFields handle={e.handle} kind={e.kind} /> : <EmptyInspector />;
}
