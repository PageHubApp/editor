/**
 * HandlersEditor — the Handlers section body: a chip list with one row per `data-on` entry, each
 * opening its own editor with the real controls — the event (retargetable without losing the rest),
 * the registered function name (`PageHub.on(name, fn)`, never inline JS), and the listener options
 * the site runtime understands (`prevent` / `once` / `passive` / `capture`, written as the dotted
 * suffix in `data-on`).
 *
 *   <HandlersEditor handle={handle} />   // reads / writes the element's `data-on` attribute
 */
import { useRef, useState, type RefObject } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useRunCommand } from "../../react/bindings";
import {
  HANDLER_EVENTS,
  HANDLER_OPTIONS,
  HANDLER_OPTION_LABELS,
  parseDataOn,
  serializeDataOn,
  type DataOnEntry,
  type HandlerOption,
} from "./actionSpecs";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { Icon } from "../../primitives/icons";
import { PopoverChip } from "../../primitives/Chip";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";

const EVENT_LABEL = new Map(HANDLER_EVENTS.map((e) => [e.event, e.label] as const));

/** One handler row: a chip summarising the entry, opening a popover with the real fields. */
function HandlerRow({
  entry,
  taken,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  entry: DataOnEntry;
  /** Events already used by sibling rows — kept out of this row's retarget list. */
  taken: ReadonlySet<string>;
  open: boolean;
  onToggle(): void;
  onChange(next: DataOnEntry): void;
  onRemove(): void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const label = EVENT_LABEL.get(entry.event) ?? entry.event;
  const summary = entry.fn ? entry.fn : "no function";
  const options = HANDLER_EVENTS.filter((e) => e.event === entry.event || !taken.has(e.event));
  const toggleOpt = (opt: HandlerOption, on: boolean) =>
    onChange({ ...entry, opts: on ? [...new Set([...entry.opts, opt])] : entry.opts.filter((o) => o !== opt) });
  return (
    <>
      <PopoverChip
        ref={anchor}
        label={label}
        open={open}
        onTriggerClick={onToggle}
        onClear={onRemove}
        triggerAriaLabel={`Edit ${label} handler`}
        clearAriaLabel={`Remove ${label} handler`}
        summary={entry.fn ? summary : <span className="text-base-content/50">{summary}</span>}
      />
      <AnchoredPopover open={open} onOpenChange={(o) => !o && onToggle()} anchor={anchor as RefObject<HTMLElement | null>} immediate>
        <div className="bg-base-100 border-base-300 grid w-64 gap-2 rounded-xl border p-3 shadow-xl" data-handler-editor={entry.event}>
          <ToolbarItemView
            label="Event"
            inputId="handler-event"
            type="select"
            value={entry.event}
            onChange={(v) => v && onChange({ ...entry, event: v })}
          >
            {options.map((e) => (
              <option key={e.event} value={e.event}>
                {e.label}
              </option>
            ))}
          </ToolbarItemView>
          <ToolbarItemView
            label="Function"
            inputId="handler-fn"
            type="text"
            value={entry.fn}
            placeholder="openChat (PageHub.on name)"
            onChange={(v) => onChange({ ...entry, fn: v })}
          />
          <p className="text-base-content/50 px-1 text-[10px] leading-snug">
            Calls a function the site registered with <code className="text-[9px]">PageHub.on(name, fn)</code>. No inline code.
          </p>
          <div className="grid grid-cols-2 gap-1" data-handler-options="">
            {HANDLER_OPTIONS.map((opt) => (
              <label key={opt} className="text-base-content/80 flex items-center gap-1.5 text-[10px]">
                <input type="checkbox" checked={entry.opts.includes(opt)} onChange={(e) => toggleOpt(opt, e.target.checked)} className="size-3" />
                <span>{HANDLER_OPTION_LABELS[opt]}</span>
              </label>
            ))}
          </div>
        </div>
      </AnchoredPopover>
    </>
  );
}

export function HandlersEditor({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  const value = useEditorState(() => (handle.alive && handle.kind === "element" ? (handle.attr("data-on") ?? "") : ""));
  const entries = parseDataOn(value);
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  const write = (next: DataOnEntry[]) => run("attr.set", { name: "data-on", value: next.length ? serializeDataOn(next) : null, at: handle });
  const updateAt = (i: number, next: DataOnEntry) => {
    if (next.event !== entries[i]!.event && openEvent === entries[i]!.event) setOpenEvent(next.event);
    write(entries.map((e, idx) => (idx === i ? next : e)));
  };
  const removeAt = (i: number) => write(entries.filter((_, idx) => idx !== i));

  if (entries.length === 0)
    return (
      <div className="text-base-content/60 flex items-center gap-2 px-1 py-2 text-[11px]">
        <Icon name="braces" className="size-3.5" />
        Add an event with + above, then name the function it runs.
      </div>
    );

  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry, i) => (
        <HandlerRow
          key={`${entry.event}:${i}`}
          entry={entry}
          taken={new Set(entries.filter((_, idx) => idx !== i).map((e) => e.event))}
          open={openEvent === entry.event}
          onToggle={() => setOpenEvent((cur) => (cur === entry.event ? null : entry.event))}
          onChange={(next) => updateAt(i, next)}
          onRemove={() => removeAt(i)}
        />
      ))}
    </div>
  );
}
