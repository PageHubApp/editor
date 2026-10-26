/**
 * HandlerPicker — the Handlers section's "+": a searchable event picker (On Click, On Double
 * Click, On Mouse Enter / Leave / Down / Up, On Focus, On Blur, …). Picking one adds a handler for
 * that event to the node: it appends the event to the element's `data-on` attribute (a handler is a
 * function the site registered with `PageHub.on(name, fn)`, named in `data-on`, never inline JS).
 * The new
 * entry then shows in the Handlers section body (`HandlersEditor`), where each row carries the
 * event, the function name and the listener options.
 *
 *   <HandlerPicker ref={menu} handle={handle} sectionTitle="Handlers" />  // ref.open() === a header click
 *
 * Events already on the node are filtered out of the list.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { HANDLER_EVENTS, parseDataOn, serializeDataOn } from "./actionSpecs";
import { Icon } from "../../primitives/icons";
import { SearchableMenuPopover, type SearchableMenuItem, type SearchableMenuPopoverHandle } from "../../primitives/SearchableMenuPopover";
import { useAccordion } from "../toolbar/AccordionContext";

interface HandlerPickerHandle {
  open(): void;
}

export const HandlerPicker = forwardRef<HandlerPickerHandle, { handle: NodeHandle; sectionTitle?: string }>(function HandlerPicker({ handle, sectionTitle = "Handlers" }, ref) {
  const run = useRunCommand();
  const accordion = useAccordion();
  const menu = useRef<SearchableMenuPopoverHandle>(null);
  useImperativeHandle(ref, () => ({ open: () => menu.current?.open() }), []);

  const current = useEditorState(() => (handle.alive && handle.kind === "element" ? (handle.attr("data-on") ?? "") : ""));
  const taken = new Set(parseDataOn(current).map((e) => e.event));
  const items: SearchableMenuItem<string>[] = HANDLER_EVENTS.filter((e) => !taken.has(e.event)).map((e) => ({ id: e.event, label: e.label, keywords: [e.event], data: e.event }));

  const pick = (item: SearchableMenuItem<string>) => {
    if (!item.data) return;
    const entries = parseDataOn(handle.alive && handle.kind === "element" ? (handle.attr("data-on") ?? "") : "");
    if (entries.some((e) => e.event === item.data)) return;
    entries.push({ event: item.data, fn: "", opts: [] });
    run("attr.set", { name: "data-on", value: serializeDataOn(entries), at: handle });
    accordion?.setOpen(sectionTitle, true);
    // the new entry shows in the Handlers section body (HandlersEditor), each row its own editor
  };

  return (
    <SearchableMenuPopover<string>
      ref={menu}
      items={items}
      onSelect={pick}
      trigger={<Icon name="plus" className="size-3.5" />}
      triggerAriaLabel="Add handler"
      searchPlaceholder="Search events…"
      emptyMessage="All events in use"
      placement="bottom-end"
      panelWidthClass="w-56"
    />
  );
});
