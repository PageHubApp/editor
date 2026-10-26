/**
 * The client's inspector (content mode): no tabs, no class / layout / effects sections — only
 * what the engine's content gate allows. A `{% section %}` shows its settings panel; an
 * element marked `data-editable` shows its value fields (image `src` / `alt`, link `href`);
 * editable text is edited on the canvas, so its panel says so.
 */
import type { NodeHandle } from "@pagehub/engine";
import { EDITABLE_ATTRIBUTE } from "@pagehub/engine";
import { Slot } from "../../components";
import { EmptyInspector } from "../inspector/InspectorStates";
import { LiquidBlockPanel, hasLiquidPanel } from "../liquid/LiquidBlockPanel";
import { useInspectedHandle, useRunCommand } from "../../react/bindings";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";

const FIELDS: Readonly<Record<string, ReadonlyArray<{ attr: string; label: string }>>> = {
  image: [{ attr: "src", label: "Image address" }, { attr: "alt", label: "Description" }],
  link: [{ attr: "href", label: "Link address" }],
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
        {fields.length === 0 && <p className="text-base-content/60 text-xs">Click the text on the page to change it.</p>}
        {fields.map((f) => {
          const value = handle.attr(f.attr) ?? "";
          return <ToolbarItemView key={`${f.attr}:${value}`} label={f.label} inputId={`content-${f.attr}`} type="text" value={value} onChange={(v) => run("attr.set", { name: f.attr, value: v, at: handle })} />;
        })}
      </div>
    </Slot>
  );
}

export function ContentInspector() {
  const h = useInspectedHandle();
  if (!h?.alive) return <EmptyInspector />;
  if (hasLiquidPanel(h)) return <LiquidBlockPanel handle={h} />;
  const e = editableKind(h);
  return e ? <EditableFields handle={e.handle} kind={e.kind} /> : <EmptyInspector />;
}
