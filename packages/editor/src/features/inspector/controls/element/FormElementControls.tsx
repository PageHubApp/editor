import { useEditorState, useRunCommand } from "../../../../react/bindings";
import { escapeAttr, escapeMarkupText } from "@pagehub/engine/render";
import { Icon } from "../../../../primitives/icons";
import { ToolbarItemView } from "../../../toolbar/ToolbarItemView";
import { handleKey, type ElementControlProps } from "./elementControlShared";
import { FORM_TAGS, buildOptionsInner, dropAttrs, findLabel, innerTextOf, parseOptions, useOuter, type FormTag, type OptionItem } from "./formMarkup";

// ─── FormElement controls ───────────────────────────────────────────────────
// The HTML-first model carries a form field's kind in its tag: a single-line field is `<input>`,
// a multi-line one `<textarea>`, a dropdown `<select>` with `<option>` children. These controls
// read/write the real markup through `source.replace` (a diff splice that keeps the handle stable).

const TAG_OPTIONS: readonly string[] = FORM_TAGS;
const TAG_LABEL: Record<FormTag, string> = {
  input: "Single line (input)",
  textarea: "Multi-line (textarea)",
  select: "Dropdown (select)",
};

/**
 * FormElement **Tag** — the field type picker's structural half. Swaps the field
 * between `<input>`, `<textarea>` and `<select>`. `input` is void, the other two carry children,
 * so a plain `tr.setTagName` can't cross that boundary — the swap rebuilds the element's outer
 * source through `source.replace` (one diff splice, one history group), carrying the attributes
 * that still apply (dropping `type` / `value` on a textarea or select, adding `type="text"` back
 * on an input) and keeping `textarea` text / `select` options when they survive the new tag.
 */
export function FormElementTagControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const { tag, inner } = useOuter(handle);
  const value: FormTag = (FORM_TAGS as readonly string[]).includes(tag) ? (tag as FormTag) : "input";

  const set = (next: string) => {
    if (next === value || !handle.alive || handle.kind !== "element") return;
    const nextTag = next as FormTag;
    let attrs: string;
    if (nextTag === "input") {
      attrs = dropAttrs(handle, []);
      if (!/\btype\s*=/.test(attrs)) attrs = `${attrs} type="text"`.trim();
    } else {
      attrs = dropAttrs(handle, nextTag === "select" ? ["type", "value", "placeholder"] : ["type", "value"]);
    }
    const open = attrs ? `<${nextTag} ${attrs}>` : `<${nextTag}>`;
    // A void input drops any inner; textarea ↔ select carry their inner across.
    const keepInner = nextTag !== "input" && value !== "input" ? inner : "";
    const text = nextTag === "input" ? open : `${open}${keepInner}</${nextTag}>`;
    run("source.replace", { at: handle, text });
  };

  return (
    <ToolbarItemView
      label="Tag"
      inputId="formelement-tag"
      type="select"
      value={value}
      valueLabels={TAG_OPTIONS}
      formatLabel={(v) => TAG_LABEL[v as FormTag] ?? v}
      onChange={set}
    />
  );
}

/**
 * FormElement **Options** — a select's choices editor. A select's
 * choices are its `<option value>` children; this edits that list (add / remove / reorder, label +
 * value per row) and writes the whole child list back with `source.replace`. Options only exist on a
 * container field, so on a void `<input>` the list is empty and Add is disabled with a one-line hint
 * ("Switch this field to a dropdown…") rather than silently writing invalid markup.
 */
export function FormElementOptionsControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const { openSrc, closeSrc, inner, hasClose, tag } = useOuter(handle);
  const opts = parseOptions(inner);
  const canHold = hasClose && tag === "select";

  const commit = (next: OptionItem[]) => {
    run("source.replace", { at: handle, text: `${openSrc}${buildOptionsInner(next)}${closeSrc}` });
  };
  const add = () => commit([...opts, { value: `option${opts.length + 1}`, label: `Option ${opts.length + 1}` }]);
  const remove = (i: number) => commit(opts.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= opts.length) return;
    const next = [...opts];
    [next[i], next[j]] = [next[j]!, next[i]!];
    commit(next);
  };
  const edit = (i: number, patch: Partial<OptionItem>) => commit(opts.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-options-editor="">
      <div className="flex min-w-0 flex-col gap-2">
        {opts.map((o, i) => (
          <div key={i} className="border-base-300/70 flex min-w-0 flex-col gap-1 rounded-lg border p-2" data-option-row="">
            <div className="flex items-center gap-1">
              <ToolbarItemView label="Label" labelWidth="w-14" inputId={`option-label-${i}`} type="text" value={o.label} onChange={(v) => edit(i, { label: v })} placeholder="Option label" />
            </div>
            <div className="flex items-center gap-1">
              <ToolbarItemView label="Value" labelWidth="w-14" inputId={`option-value-${i}`} type="text" value={o.value} onChange={(v) => edit(i, { value: v })} placeholder="Option value" />
            </div>
            <div className="flex items-center justify-end gap-0.5">
              <button type="button" className="hover:bg-base-200 text-base-content/70 rounded p-1 disabled:opacity-30" aria-label="Move option up" disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="chevron-up" className="size-3.5" />
              </button>
              <button type="button" className="hover:bg-base-200 text-base-content/70 rounded p-1 disabled:opacity-30" aria-label="Move option down" disabled={i === opts.length - 1} onClick={() => move(i, 1)}>
                <Icon name="chevron-down" className="size-3.5" />
              </button>
              <button type="button" className="hover:bg-base-200 text-error rounded px-1.5 py-1 text-xs" aria-label="Remove option" onClick={() => remove(i)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="border-base-300 hover:bg-base-200 text-base-content rounded-lg border border-dashed px-2 py-1.5 text-xs font-medium disabled:opacity-40"
        disabled={!canHold}
        onClick={add}
      >
        Add option
      </button>
      {!canHold && <span className="text-base-content/50 text-[11px]">Switch this field to a dropdown (select) to add options.</span>}
    </div>
  );
}

/**
 * FormElement **Label** — the field's label text. A field's label is its associated
 * `<label>` (a wrapping one, or a sibling `<label for="id">`). This edits that label's text through
 * `text.setInner`; when none exists it creates a sibling `<label for="id">` (giving the field an
 * `id` first when it has none), so a field always ends up with a programmatic label.
 */
export function FormElementLabelControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const label = useEditorState((s) => {
    void s.files.get(handle.path);
    const l = findLabel(handle);
    return l ? innerTextOf(l) : "";
  });

  const write = (text: string) => {
    const existing = findLabel(handle);
    if (existing) {
      run("text.setInner", { target: existing, source: text });
      return;
    }
    if (!handle.alive || handle.kind !== "element") return;
    let el = handle.text();
    let id = handle.attr("id") ?? null;
    if (!id) {
      id = (handle.attr("name") || "field").replace(/[^\w-]/g, "") || "field";
      el = el.replace(/^<(\w+)/, `<$1 id="${escapeAttr(id)}"`);
    }
    run("source.replace", { at: handle, text: `<label for="${escapeAttr(id)}">${escapeMarkupText(text)}</label>\n    ${el}` });
  };

  return (
    <ToolbarItemView
      key={handleKey(handle)}
      label="Label"
      inputId="formelement-label"
      type="text"
      value={label}
      onChange={write}
      placeholder="Field label"
    />
  );
}
