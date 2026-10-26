/**
 * ActionPicker — the Action section's "+": a searchable, categorized action picker (Link;
 * Open Modal / Show-Hide under "Open"; the Commerce / System / Storage / State families).
 * Picking one writes the action to
 * the source — its defining `href` / `command` / `data-*` attributes (`actionSpecs.ts`) — then
 * opens a detail popover with every field that action needs (a link's href / target / rel, a
 * show-hide's target / direction / trigger, a download's url / filename …). Flag-only actions
 * (Toggle light/dark) write and close.
 *
 *   <ActionPicker ref={menu} handle={handle} sectionTitle="Action" />  // ref.open() === a header click
 *
 * The raw `action.*` map keys are bundle parts, so a categorized type list is the author-facing
 * surface here instead of the generic AddPropertyMenu.
 */
import { forwardRef, useImperativeHandle, useRef, useState, type RefObject } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useRunCommand } from "../../react/bindings";
import { ACTION_SPECS, ACTION_TYPE_ORDER } from "./actionSpecs";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { Icon } from "../../primitives/icons";
import { SearchableMenuPopover, type SearchableMenuItem, type SearchableMenuPopoverHandle } from "../../primitives/SearchableMenuPopover";
import { useAccordion } from "../toolbar/AccordionContext";
import { ActionDetail } from "./actionFields";

interface ActionPickerHandle {
  open(): void;
}

const ITEMS: SearchableMenuItem<string>[] = ACTION_TYPE_ORDER.map((id) => {
  const s = ACTION_SPECS[id]!;
  return { id, label: s.label, ...(s.group ? { hint: s.group } : {}), keywords: [id, ...id.split("-")], data: id };
});

export const ActionPicker = forwardRef<ActionPickerHandle, { handle: NodeHandle; sectionTitle?: string }>(function ActionPicker({ handle, sectionTitle = "Action" }, ref) {
  const run = useRunCommand();
  const accordion = useAccordion();
  const menu = useRef<SearchableMenuPopoverHandle>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const [detail, setDetail] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ open: () => menu.current?.open() }), []);

  const pick = (item: SearchableMenuItem<string>) => {
    const spec = item.data ? ACTION_SPECS[item.data] : undefined;
    if (!spec) return;
    for (const [name, value] of spec.attrs) run("attr.set", { name, value, at: handle });
    accordion?.setOpen(sectionTitle, true);
    // the write may re-render the element; open the detail next frame so its own click doesn't dismiss it
    if (spec.fields.length) requestAnimationFrame(() => setDetail(item.data!));
  };

  const fields = detail ? ACTION_SPECS[detail]?.fields : undefined;
  return (
    <span ref={anchor} className="inline-flex items-center">
      <SearchableMenuPopover<string>
        ref={menu}
        items={ITEMS}
        onSelect={pick}
        trigger={<Icon name="plus" className="size-3.5" />}
        triggerAriaLabel="Add action"
        searchPlaceholder="Search actions…"
        placement="bottom-end"
        panelWidthClass="w-56"
      />
      <AnchoredPopover open={!!fields?.length} onOpenChange={(o) => !o && setDetail(null)} anchor={anchor as RefObject<HTMLElement | null>} placement="bottom-end" immediate>
        {fields?.length ? (
          <div className="bg-base-100 border-base-300 w-64 rounded-xl border p-3 shadow-xl">
            <ActionDetail handle={handle} fields={fields} />
          </div>
        ) : (
          <span />
        )}
      </AnchoredPopover>
    </span>
  );
});
