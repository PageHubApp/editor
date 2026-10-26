import { closeHistoryGroup } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../../../react/bindings";
import { Chip } from "../../../../primitives/Chip";
import { ToolbarSegmentedControl } from "../../../toolbar/primitives/ToolbarSegmentedControl";
import { useLiveTag, type ElementControlProps } from "./elementControlShared";

type ButtonType = "link" | "button" | "submit";

const TYPE_OPTIONS: { value: ButtonType; label: string }[] = [
  { value: "link", label: "Link" },
  { value: "button", label: "Button" },
  { value: "submit", label: "Submit" },
];

/**
 * Button **Type** picker. The HTML-first model
 * carries the type in the tag: `<a>` is a link, `<button type>` a button / submit. Switching is
 * one tag splice (`tr.setTagName`) plus the `type` attribute, as one undo step.
 */
export function ButtonTypeControl({ handle }: ElementControlProps) {
  const store = useEditorStore();
  const tag = useLiveTag(handle);
  const type = useEditorState((s) => {
    void s.files.get(handle.path);
    return handle.alive && handle.kind === "element" ? (handle.attr("type") ?? "") : "";
  });
  const value: ButtonType = tag === "a" ? "link" : type === "submit" ? "submit" : "button";

  const set = (next: ButtonType) => {
    if (next === value || !handle.alive || handle.kind !== "element") return;
    store.dispatch((tr) => {
      if (next === "link") {
        if (tag !== "a") tr.setTagName(handle, "a");
        tr.setAttr(handle, "type", null);
      } else {
        if (tag !== "button") tr.setTagName(handle, "button");
        tr.setAttr(handle, "type", next);
      }
      return tr;
    });
    store.dispatch((tr) => tr.effect(closeHistoryGroup, null));
  };

  return (
    <Chip label="Type" frame="bare">
      <div className="min-w-0 flex-1">
        <ToolbarSegmentedControl<ButtonType> dense aria-label="Button type" value={value} onChange={set} options={TYPE_OPTIONS} />
      </div>
    </Chip>
  );
}
