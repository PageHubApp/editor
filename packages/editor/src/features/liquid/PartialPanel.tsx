/**
 * The panel for `{% render 'name', title: "Hi" %}`: open the partial, pick which one this tag
 * shows, and set the values it reads. Every control writes through one command — the name through
 * `liquid.setMarkup`, each value through `liquid.setArg` (an empty value removes it) — so each
 * change is one undo step.
 *
 *   <RenderPanel handle={h} />
 */
import { useState, type KeyboardEvent } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState } from "../../react/bindings";
import { Chip } from "../../primitives/Chip";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { useInspectorActions } from "../inspector/useInspectorSession";
import { useCompletions, useMarkup } from "./BlockPanels";
import { ExpressionField, PanelNote } from "./LiquidFields";
import { buildNamed, parseNamed } from "./markup";
import { isValueName, partialVariables, valueRows } from "./partialVars";
import { dataSourceGlobals } from "./completions";
import { useCommitAt } from "./useCommit";

const partialPath = (name: string) => `partials/${name}.liquid`;
const ADD = "text-base-content/70 hover:text-base-content hover:bg-base-200 flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-[11px] transition-colors";

/** The partials of this site, by name. */
function usePartialNames(): string[] {
  return useEditorState((s) => [...s.files.keys()].filter((p) => /^partials\/.+\.liquid$/.test(p)).map((p) => p.slice(9, -7)).sort().join("\n")).split("\n").filter(Boolean);
}

/** Which partial this tag renders. A name the site has no file for stays listed, marked missing. */
function PartialSelect({ handle, name, tail, names }: { handle: NodeHandle; name: string; tail: string; names: string[] }) {
  const commit = useCommitAt(handle);
  const options = names.includes(name) ? names : [name, ...names];
  return (
    <ToolbarItemView
      key={name}
      label="Show"
      inputId="render-partial"
      type="select"
      value={name}
      onChange={(v) => {
        const markup = buildNamed({ name: v, tail });
        if (markup) commit("liquid.setMarkup", { markup });
      }}
    >
      {options.map((n) => (
        <option key={n} value={n}>
          {names.includes(n) ? n : `${n} (not found)`}
        </option>
      ))}
    </ToolbarItemView>
  );
}

/** One value: its name beside the field; a value that is set can be removed. */
function ValueRow({ handle, name, source, custom, completions }: { handle: NodeHandle; name: string; source: string; custom: boolean; completions: readonly string[] }) {
  const commit = useCommitAt(handle);
  const set = (value: string) => commit("liquid.setArg", { name, value });
  return (
    <div className="flex items-center gap-1" data-render-value={name}>
      <div className="min-w-0 flex-1">
        <ExpressionField id={`arg-${name}`} label={name} value={source} completions={completions} placeholder={custom ? "Value" : "Not set"} onCommit={set} />
      </div>
      <button
        type="button"
        onClick={() => set("")}
        disabled={!source}
        tabIndex={source ? 0 : -1}
        aria-label={`Remove ${name}`}
        {...tooltip(custom ? `Remove ${name}` : `Clear ${name}`, "top")}
        className={`text-base-content/50 hover:text-error flex size-6 shrink-0 items-center justify-center rounded transition-colors ${source ? "" : "invisible"}`}
      >
        <Icon name={custom ? "trash" : "x"} className="size-3.5" />
      </button>
    </div>
  );
}

/** "Add value": a name and a value, added together. */
function AddValue({ handle, taken, completions }: { handle: NodeHandle; taken: readonly string[]; completions: readonly string[] }) {
  const commit = useCommitAt(handle);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const close = () => (setOpen(false), setName(""), setValue(""));
  const key = name.trim();
  const ready = isValueName(key) && !taken.includes(key) && value.trim() !== "";
  const add = () => {
    if (ready && commit("liquid.setArg", { name: key, value: value.trim() })) close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") (e.preventDefault(), add());
    else if (e.key === "Escape") close();
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ADD} data-render-add-value="" {...tooltip('Pass the partial a value, like title: "Welcome"', "top")}>
        <Icon name="plus" className="size-3.5" />
        Add value
      </button>
    );
  }
  return (
    <div className="border-base-300/60 flex flex-col gap-1 rounded-md border p-1.5" data-render-new-value="">
      <Chip label="Name">
        <input id="input-render-new-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKeyDown} placeholder="title" aria-label="Name" aria-invalid={(key !== "" && (!isValueName(key) || taken.includes(key))) || undefined} className="input-plain flex-1 font-mono" autoComplete="off" spellCheck={false} />
      </Chip>
      <ExpressionField id="render-new-value" label="Value" value={value} completions={completions} placeholder={'"Welcome"'} onCommit={(v) => void setValue(v)} />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={close} className="btn btn-xs btn-ghost text-xs">
          Cancel
        </button>
        <button type="button" onClick={add} disabled={!ready} className="btn btn-xs btn-primary text-xs" data-render-add-confirm="">
          Add
        </button>
      </div>
    </div>
  );
}

/** The values passed in: a row per variable the partial reads, plus any added by hand. */
function Values({ handle, name }: { handle: NodeHandle; name: string }) {
  const source = useEditorState((s) => s.files.get(partialPath(name)) ?? "");
  const globals = useEditorState((s) => dataSourceGlobals(s.config).join(" "));
  const args = useEditorState(() => (handle.alive ? handle.args().map((a) => `${a.name}\u0000${a.source}`) : []), (a, b) => a.join("\u0001") === b.join("\u0001"));
  const completions = useCompletions(handle);
  const rows = valueRows(
    partialVariables(source, globals.split(" ").filter(Boolean)),
    args.map((p) => {
      const [n, s] = p.split("\u0000") as [string, string];
      return { name: n, source: s };
    }),
  );
  return (
    <div className="flex flex-col gap-1.5" data-render-values="">
      {rows.length > 0 && (
        <>
          <h4 className="text-base-content mt-1 text-xs font-semibold">Values</h4>
          <PanelNote>What this partial shows here. Text goes in quotes, like "Welcome".</PanelNote>
          {rows.map((r) => (
            <ValueRow key={r.name} handle={handle} name={r.name} source={r.source} custom={r.custom} completions={completions} />
          ))}
        </>
      )}
      <AddValue handle={handle} taken={rows.map((r) => r.name)} completions={completions} />
    </div>
  );
}

export function RenderPanel({ handle }: { handle: NodeHandle }) {
  const { set } = useInspectorActions();
  const parts = parseNamed(useMarkup(handle));
  const names = usePartialNames();
  const name = parts?.name ?? "";
  const exists = names.includes(name);
  if (!parts) return <PanelNote>This partial is picked by a variable, so the panel can't change it. Use Edit code.</PanelNote>;
  return (
    <div className="flex flex-col gap-1.5" data-liquid-panel="render">
      <button
        type="button"
        disabled={!exists}
        onClick={() => set({ componentEditor: partialPath(name) })}
        className="btn btn-sm btn-primary w-full gap-1.5 text-xs"
        data-liquid-edit-partial=""
        {...tooltip(exists ? undefined : `This site has no ${partialPath(name)}`, "top")}
      >
        <Icon name="box" className="size-3.5" />
        Edit partial
      </button>
      <PanelNote>Changes show up everywhere this partial is used.</PanelNote>
      <PartialSelect handle={handle} name={name} tail={parts.tail} names={names} />
      <Values handle={handle} name={name} />
    </div>
  );
}
