/**
 * The State section's editors, each over the `data-state-*` attributes the source converter emits
 * (the site runtime's `state` / `state-view` / `state-compute` chunks read them):
 *
 *   stateModifiers         `data-state-class="test=>classes;…"`        StateClassEditor
 *   computedStateBindings  `data-state-compute` + its data-* inputs      ComputedEditor
 *   inViewState            `data-state-in-view="key=value"`              InViewEditor
 *   stateBinding           `data-state-bind` + mode + debounce           BindEditor
 *   state.text             `data-state-text="key"`                       TextKeyEditor
 *   stateBindings          all of the above plus visibility, as one panel StateOverview
 *
 * Fields commit on Enter / blur; each change is one undo step.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState } from "../../../react/bindings";
import { AddBranchButton, BranchRow, ExpressionField, PanelNote } from "../../liquid/LiquidFields";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { useAttrs } from "../useAttrs";
import { ConditionsEditor } from "../conditions/ConditionsEditor";
import { parseShow, serializeShow, type Group } from "../conditions/conditionModel";
import { StateGroupsEditor } from "../conditions/StateGroupsEditor";
import { useStateKeys } from "../conditions/stateKeys";
import { parseClassEntries, serializeClassEntries, type ClassEntry } from "./stateAttrs";

type Editor = ComponentType<{ handle: NodeHandle }>;

// ── data-state-class ───────────────────────────────────────────────────────

function ClassEntryCard({ entry, index, keys, onChange, onRemove }: { entry: ClassEntry; index: number; keys: readonly string[]; onChange(e: ClassEntry): void; onRemove(): void }) {
  if (entry.kind === "server")
    return (
      <BranchRow title={`Modifier ${index + 1} · server`} onRemove={onRemove} removeLabel="Remove modifier">
        <code className="text-base-content/70 text-[11px]">{entry.raw}</code>
        <PanelNote>Decided when the page renders, in a {"{% capture %}"} before the element (a row or site value). Edit it in the code.</PanelNote>
      </BranchRow>
    );
  const groups = parseShow(entry.test);
  return (
    <BranchRow title={`Modifier ${index + 1}`} onRemove={onRemove} removeLabel="Remove modifier">
      <ExpressionField id={`state-class-${index}-classes`} label="Add classes" value={entry.classes} onCommit={(v) => (v.trim() ? onChange({ ...entry, classes: v.trim() }) : false)} />
      <span className="text-base-content/60 text-[10px] font-semibold uppercase">While</span>
      {groups ? (
        <StateGroupsEditor id={`state-class-${index}`} groups={groups} keys={keys} onChange={(gs) => (serializeShow(gs) ? onChange({ ...entry, test: serializeShow(gs) }) : onRemove())} />
      ) : (
        <ExpressionField id={`state-class-${index}-test`} label="Test" value={entry.test} completions={keys} onCommit={(v) => (v ? onChange({ ...entry, test: v }) : false)} />
      )}
    </BranchRow>
  );
}

export function StateClassEditor({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  const keys = useStateKeys();
  const entries = parseClassEntries(read("data-state-class") ?? "");
  const [draft, setDraft] = useState<{ classes: string; groups: Group[] } | null>(null);
  const save = (next: ClassEntry[]) => write("data-state-class", serializeClassEntries(next) || null);
  return (
    <div data-state-editor="class" className="flex flex-col gap-1.5">
      {!entries.length && !draft && <PanelNote>Add classes while a state value holds: an active chip, the current step, an open menu.</PanelNote>}
      {entries.map((e, i) => (
        <ClassEntryCard key={i} entry={e} index={i} keys={keys} onChange={(n) => save(entries.map((x, j) => (j === i ? n : x)))} onRemove={() => save(entries.filter((_, j) => j !== i))} />
      ))}
      {draft ? (
        <BranchRow title="New modifier" onRemove={() => setDraft(null)} removeLabel="Cancel">
          <ExpressionField id="state-class-new-classes" label="Add classes" placeholder="bg-primary text-primary-content" value={draft.classes} onCommit={(v) => setDraft({ ...draft, classes: v.trim() })} />
          <span className="text-base-content/60 text-[10px] font-semibold uppercase">While</span>
          <StateGroupsEditor id="state-class-new" groups={draft.groups} keys={keys} onChange={(gs) => setDraft({ ...draft, groups: gs })} />
          <button
            type="button"
            disabled={!draft.classes || !serializeShow(draft.groups)}
            onClick={() => (save([...entries, { kind: "test", test: serializeShow(draft.groups), classes: draft.classes }]), setDraft(null))}
            className="bg-primary text-primary-content self-end rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-40"
          >
            Add modifier
          </button>
        </BranchRow>
      ) : (
        <AddBranchButton onClick={() => setDraft({ classes: "", groups: [] })}>Add class modifier</AddBranchButton>
      )}
    </div>
  );
}

// ── data-state-compute ─────────────────────────────────────────────────────

const COMPUTE_ATTRS = ["data-state-compute", "data-variants", "data-axes", "data-axis-key", "data-compute-key", "data-from", "data-count-value"];

export function ComputedEditor({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  const keys = useStateKeys();
  const kind = read("data-state-compute");
  const field = (attr: string, label: string, placeholder?: string, completions?: readonly string[], mono = true) => (
    <ExpressionField id={`compute-${attr}`} label={label} placeholder={placeholder} mono={mono} value={read(attr) ?? ""} completions={completions} onCommit={(v) => write(attr, v || null)} />
  );
  return (
    <div data-state-editor="compute" className="flex flex-col gap-1.5">
      <ToolbarItemView
        type="radio"
        inputId="compute-kind"
        label="Compute"
        value={kind ?? ""}
        onChange={(v) => write("data-state-compute", v || null)}
        options={[
          { value: "variant-match", label: "Variant", hint: "The product variant matching the picked options" },
          { value: "count", label: "Count", hint: "How many keys hold a value (a quiz score)" },
        ]}
      />
      {kind === "variant-match" && (
        <>
          {field("data-variants", "Variants", "{{item.variantMapJson}}")}
          {field("data-axes", "Axes", "{{item.optionNamesCsv}}")}
          {field("data-axis-key", "Option keys", "pdp:current:axis:%axis%", keys)}
          {field("data-compute-key", "Writes to", "pdp:current:matching-variant", keys)}
          <PanelNote>Once every option has a pick, the matching in-stock variant is written as JSON. Read it with a state text of key.formatted, or show something while the key is set.</PanelNote>
        </>
      )}
      {kind === "count" && (
        <>
          {field("data-from", "Keys", "gp:q1,gp:q2,gp:q3", keys)}
          {field("data-count-value", "Counts when", "Y (empty: any value)", undefined, false)}
          {field("data-compute-key", "Writes to", "gp:score", keys)}
        </>
      )}
      {!kind && <PanelNote>Derive a state value from others: the variant that matches the picked options, or a count of answers.</PanelNote>}
      {kind && (
        <button type="button" onClick={() => COMPUTE_ATTRS.forEach((a) => read(a) !== null && write(a, null))} className="text-error self-start text-[11px] hover:underline">
          Remove computed state
        </button>
      )}
    </div>
  );
}

// ── data-state-in-view ─────────────────────────────────────────────────────

export function InViewEditor({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  const keys = useStateKeys();
  const raw = read("data-state-in-view") ?? "";
  const [key = "", value = ""] = raw.split("=");
  const set = (k: string, v: string) => write("data-state-in-view", k ? `${k}=${v}` : null);
  return (
    <div data-state-editor="in-view" className="flex flex-col gap-1.5">
      <ExpressionField id="in-view-key" label="Group key" placeholder="deck:step" value={key} completions={keys} onCommit={(k) => set(k, value)} />
      <ExpressionField id="in-view-value" label="This one's value" placeholder="intro" value={value} mono={false} onCommit={(v) => (key ? set(key, v) : false)} />
      <PanelNote>{key ? `The most visible member of "${key}" writes ${key}, ${key}:index, ${key}:number and ${key}:count, for scroll rails and step counters.` : "Join an on-screen group: while this is the most visible member, its value is written to the group key."}</PanelNote>
    </div>
  );
}

// ── data-state-bind ────────────────────────────────────────────────────────

export function BindEditor({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  const keys = useStateKeys();
  const key = read("data-state-bind") ?? "";
  const mode = read("data-bind-mode") === "checked" ? "checked" : "value";
  const debounce = (read("data-debounce") ?? "").replace(/ms$/, "");
  return (
    <div data-state-editor="bind" className="flex flex-col gap-1.5">
      <ExpressionField id="bind-key" label="Key" placeholder="url:q" value={key} completions={keys} onCommit={(k) => (write("data-state-bind", k || null), k ? undefined : (write("data-bind-mode", null), write("data-debounce", null)))} />
      {key && (
        <>
          <ToolbarItemView type="radio" inputId="bind-mode" label="Writes" value={mode} onChange={(v) => write("data-bind-mode", v === "checked" ? "checked" : null)} options={[{ value: "value", label: "Value", hint: "The text or selected option" }, { value: "checked", label: "Checked", hint: "Its value while ticked (checkbox / radio facets)" }]} />
          <ExpressionField id="bind-debounce" label="Wait (ms)" placeholder="0" mono={false} value={debounce} onCommit={(v) => (/^\d*$/.test(v.trim()) ? write("data-debounce", v.trim() ? `${v.trim()}ms` : null) : false)} />
          <PanelNote>{key.startsWith("url:") ? `Two-way: the field and ?${key.slice(4)}= in the address stay in step.` : "Two-way: typing writes the key; a change to the key fills the field."}</PanelNote>
        </>
      )}
    </div>
  );
}

// ── data-state-text ────────────────────────────────────────────────────────

export function TextKeyEditor({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  const keys = useStateKeys();
  const key = read("data-state-text") ?? "";
  return (
    <div data-state-editor="text" className="flex flex-col gap-1.5">
      <ExpressionField id="state-text-key" label="Key" placeholder="cart:count" value={key} completions={keys} onCommit={(k) => write("data-state-text", k || null)} />
      <PanelNote>The element's text becomes the key's value while the page runs. A key.field path reads into a JSON value (a matched variant's .formatted).</PanelNote>
    </div>
  );
}

// ── the whole State panel ──────────────────────────────────────────────────

const FORM_TAGS = new Set(["input", "select", "textarea"]);

interface Part {
  id: string;
  title: string;
  attr: string;
  Editor: Editor;
  when?(tag: string): boolean;
}

const VisibilityEditor: Editor = ({ handle }) => <ConditionsEditor handle={handle} browserOnly />;

const PARTS: Part[] = [
  { id: "visibility", title: "Visibility", attr: "data-state-show", Editor: VisibilityEditor },
  { id: "class", title: "Class modifiers", attr: "data-state-class", Editor: StateClassEditor },
  { id: "bind", title: "Field binding", attr: "data-state-bind", Editor: BindEditor, when: (t) => FORM_TAGS.has(t) },
  { id: "text", title: "Text from state", attr: "data-state-text", Editor: TextKeyEditor, when: (t) => !FORM_TAGS.has(t) },
  { id: "compute", title: "Computed state", attr: "data-state-compute", Editor: ComputedEditor },
  { id: "in-view", title: "In-view group", attr: "data-state-in-view", Editor: InViewEditor },
];

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <BranchRow title={title}>{children}</BranchRow>;
}

export function StateOverview({ handle }: { handle: NodeHandle }) {
  const { read } = useAttrs(handle);
  const tag = useEditorState(() => (handle.alive && handle.kind === "element" ? handle.tag : ""));
  const [opened, setOpened] = useState<string[]>([]);
  const parts = PARTS.filter((p) => !p.when || p.when(tag));
  const shown = parts.filter((p) => read(p.attr) !== null || opened.includes(p.id));
  const rest = parts.filter((p) => !shown.includes(p));
  return (
    <div data-state-overview="" className="flex flex-col gap-2">
      {!shown.length && <PanelNote>Wire this element to the page's live state: show it while a key holds, add classes, bind a field, or show a value.</PanelNote>}
      {shown.map(({ id, title, Editor }) => (
        <Card key={id} title={title}>
          <Editor handle={handle} />
        </Card>
      ))}
      {rest.map((p) => (
        <AddBranchButton key={p.id} onClick={() => setOpened((o) => [...o, p.id])}>
          {p.title}
        </AddBranchButton>
      ))}
    </div>
  );
}

/** Row id → its editor (PropertyRow's `RowControl`). `visibilityStateKey` is the browser-only Conditions editor. */
export const STATE_ROW_EDITORS: Readonly<Record<string, Editor>> = {
  stateBindings: StateOverview,
  stateModifiers: StateClassEditor,
  computedStateBindings: ComputedEditor,
  inViewState: InViewEditor,
  stateBinding: BindEditor,
  "state.text": TextKeyEditor,
};
