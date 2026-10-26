/**
 * An attribute that holds text with bindings — alt text, a title — shown as text boxes and
 * variable chips (`Photo of [item.title]`), never raw Liquid. "Insert variable" appends a binding
 * from the element's completions; a chip's X removes it. Each change is one undo step.
 *
 *   <BoundTextControl handle={h} attr="alt" label="Alt text" />
 */
import type { NodeHandle } from "@pagehub/engine";
import { Chip } from "../../../primitives/Chip";
import { Icon } from "../../../primitives/icons";
import { tooltip } from "../../../primitives/tooltip";
import { useCompletions } from "../../liquid/BlockPanels";
import { NO_AUTOCOMPLETE, ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { useAttrs } from "../useAttrs";
import { appendVariable, joinBound, removeVariable, setText, splitBound, variablePath } from "./boundText";

export function BoundTextControl({ handle, attr, label }: { handle: NodeHandle; attr: string; label: string }) {
  const { read, write } = useAttrs(handle);
  const names = useCompletions(handle);
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
              <span key={`${value}:${i}`} data-bound-chip="" className="bg-primary/10 text-primary flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px]">
                {variablePath(p)}
                <button type="button" aria-label={`Remove ${variablePath(p)}`} {...tooltip("Remove variable", "top")} onClick={() => commit(removeVariable(parts, i))} className="hover:text-error">
                  <Icon name="x" className="size-3" />
                </button>
              </span>
            ),
          )}
        </div>
      </Chip>
      {names.length > 0 && (
        <ToolbarItemView key={value} type="select" inputId={`${attr}-insert-variable`} label="Insert" value="" placeholder="Variable…" onChange={(v) => v && commit(appendVariable(parts, v))}>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </ToolbarItemView>
      )}
    </div>
  );
}
