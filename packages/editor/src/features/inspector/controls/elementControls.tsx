/**
 * Per-element bespoke Component-section controls — the controls one element type needs that are
 * not a class group, an attribute, a Liquid argument, or a colour (so the control-spec seam in
 * `SpecControl` / the generic `AttrField` can't express them). The controls live in `./element/`;
 * this file is the registry.
 *
 * `elementControlFor(id, handle)` is the registry `InspectorSectionHost` consults before falling
 * back to `PropertyRow`; a row with a bespoke control renders through `ElementControlRow`. Reads
 * come off the live node (`handle.node()` re-read on every file change) and writes go through the
 * engine (`text.setInner`, `source.replace`, `tr.setTagName` / `tr.setAttr`), so this never
 * restates a binding.
 */
import type { FC } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { ButtonTypeControl } from "./element/ButtonTypeControl";
import { EmbedCodeControl } from "./element/EmbedCodeControl";
import type { ElementControlProps } from "./element/elementControlShared";
import { liveTag } from "./element/elementControlShared";
import { FORM_TAGS } from "./element/formMarkup";
import { FormElementLabelControl, FormElementOptionsControl, FormElementTagControl } from "./element/FormElementControls";
import { IconValueControl } from "./element/IconValueControl";
import { MapPathLabelControl, MapPointDescriptionControl, MapPointTitleControl } from "./element/MapControls";
import { TextValueControl } from "./element/TextValueControl";
import { VideoProviderControl } from "./element/VideoProviderControl";
import { VideoSourceControl } from "./element/VideoSourceControl";

/**
 * The bespoke control for a Component-section row, or `undefined` to fall back to `PropertyRow`.
 * Keep gates narrow: the Text control is only for `<button>` / `<a>` labels (a Text leaf edits its
 * copy through the canvas + `TextTopControls`, not a flat field); the Icon control only for those
 * same label leaves; Provider and Video source only for the Video tags; Code only for the Embed `<iframe>`.
 */
export function elementControlFor(id: string, handle: NodeHandle): FC<ElementControlProps> | undefined {
  if (handle.kind !== "element") return undefined;
  if (id === "buttonType") return ButtonTypeControl;
  if (id === "text") {
    const t = liveTag(handle);
    if (t === "button" || t === "a") return TextValueControl;
  }
  if (id === "icon") {
    const t = liveTag(handle);
    if (t === "button" || t === "a") return IconValueControl;
  }
  if (id === "provider") {
    const t = liveTag(handle);
    if (t === "video" || t === "iframe") return VideoProviderControl;
  }
  if (id === "videoId") {
    const t = liveTag(handle);
    if (t === "video" || t === "iframe") return VideoSourceControl;
  }
  if (id === "code" && liveTag(handle) === "iframe") return EmbedCodeControl;
  // FormElement: the field's tag, its options list, and its label are markup the generic row
  // controls can't express. Gate to the form field tags (`tagName` is shared with Text headings).
  if ((id === "tagName" || id === "options" || id === "form-control.label") && (FORM_TAGS as readonly string[]).includes(liveTag(handle))) {
    return id === "tagName" ? FormElementTagControl : id === "options" ? FormElementOptionsControl : FormElementLabelControl;
  }
  // Map children: a pin's title / description and a route's label live in the element's inner text.
  // These rows only appear on a MapPoint / MapPath, so no tag gate is needed.
  if (id === "map-pin.title") return MapPointTitleControl;
  if (id === "map-pin.description") return MapPointDescriptionControl;
  if (id === "map-path.label") return MapPathLabelControl;
  return undefined;
}

/** One inspector row whose control is a bespoke element control (non-popover, inline). */
export function ElementControlRow({ row, handle, visible, Control }: ElementControlProps & { visible: boolean; Control: FC<ElementControlProps> }) {
  if (!visible) return null;
  return (
    <div data-row={row.id} className="min-w-0">
      <Control handle={handle} row={row} />
    </div>
  );
}
