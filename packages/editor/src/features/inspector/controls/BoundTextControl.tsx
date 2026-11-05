/**
 * An attribute that holds text with bindings — alt text, a title — shown as text boxes and
 * variable chips (`Photo of [item.title]`), never raw Liquid. "Insert variable" appends a binding
 * from the element's completions — inside a list of a collection's entries, that collection's fields
 * come first by name ("Price · number") — and a field's chip reads as its name, with the
 * expression in its tooltip. A chip's X removes it. Each change is one undo step.
 *
 *   <BoundTextControl handle={h} attr="alt" label="Alt text" />
 */
import type { NodeHandle } from "@pagehub/engine";
import { Chip } from "../../../primitives/Chip";
import { Icon } from "../../../primitives/icons";
import { tooltip } from "../../../primitives/tooltip";
import { useCompletions } from "../../liquid/BlockPanels";
import { useEditorState } from "../../../react/bindings";
import { useHostCollections } from "../../canvas/hostCollections";
import { fieldItems, fieldLabel, loopCollection } from "../../liquid/collectionFields";
import { NO_AUTOCOMPLETE, ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { useBoundAttrs } from "./useBoundAttrs";
import { appendVariable, joinBound, removeVariable, setText, splitBound, variablePath } from "./boundText";

export function BoundTextControl({ handle, attr, label }: { handle: NodeHandle; attr: string; label: string }) {
  const { read, write } = useBoundAttrs(handle);
  const names = useCompletions(handle);
  const host = useHostCollections();
  const source = useEditorState((s) => s.files.get(handle.path) ?? "");
  const loop = host ? loopCollection(handle, host.list, source) : null;
  const fields = loop ? fieldItems(loop) : [];
  const others = names.filter((n) => !fields.some((f) => f.expression === n));
  const value = read(attr) ?? "";
  const parts = splitBound(value);
  const commit = (next: string[]) => write(attr, joinBound(next) || null);
  return (
    <div data-bound-text={attr} className="flex flex-col gap-1">
      <Chip label={label} grow>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-0.5">
          {parts.map((p, i) =>
            i % 2 === 0 ? (
              <input
                key={`${value}:${i}`}
                aria-label={`${label} text`}
                defaultValue={p}
                onBlur={(e) => e.target.value !== p && commit(setText(parts, i, e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.value !== p && commit(setText(parts, i, e.currentTarget.value))}
                style={i === parts.length - 1 ? undefined : { width: `${Math.max(2, Math.min(p.length + 1, 40))}ch` }}
                className={`input-plain min-w-0 ${i === parts.length - 1 ? "min-w-[6ch] flex-1" : "flex-none"}`}
                {...NO_AUTOCOMPLETE}
              />
            ) : (
              <BoundChip key={`${value}:${i}`} part={p} named={fieldLabel(loop, p)} onRemove={() => commit(removeVariable(parts, i))} />
            ),
          )}
        </div>
      </Chip>
      {(fields.length > 0 || others.length > 0) && (
        <ToolbarItemView key={value} type="select" inputId={`${attr}-insert-variable`} label="Insert" value="" placeholder={fields.length ? "Field…" : "Variable…"} onChange={(v) => v && commit(appendVariable(parts, v))}>
          {fields.length > 0 && (
            <optgroup label={loop!.collection.name}>
              {fields.map((f) => (
                <option key={f.expression} value={f.expression}>
                  {`${f.label} · ${f.hint}`}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && fields.length > 0 ? (
            <optgroup label="Other">
              {others.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </optgroup>
          ) : (
            others.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))
          )}
        </ToolbarItemView>
      )}
    </div>
  );
}

/** A binding as a chip: the field's name when it is one ("Price", with the expression in the tooltip), else its path. */
function BoundChip({ part, named, onRemove }: { part: string; named: string | null; onRemove(): void }) {
  const path = variablePath(part);
  return (
    <span data-bound-chip="" {...(named ? { "data-bound-field": named, ...tooltip(part.trim(), "top") } : {})} className={`bg-primary/10 text-primary flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${named ? "" : "font-mono"}`}>
      {named ?? path}
      <button type="button" aria-label={`Remove ${named ?? path}`} {...tooltip("Remove variable", "top")} onClick={onRemove} className="hover:text-error">
        <Icon name="x" className="size-3" />
      </button>
    </span>
  );
}
