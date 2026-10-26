/**
 * The Insert variable popover: the catalogue's groups (Company, System, Section, Custom, Other,
 * plus the host's) down the left; hovering or focusing a group opens its variables in a flyout
 * beside it. A pick inserts the `{{ output }}` chip and closes.
 */
import { useState } from "react";
import { insertVariable, sessionVariables } from "./variableItems";
import type { RichTextSession } from "./session";
import { Icon } from "../../primitives/icons";
import { keepFocus } from "./toolbarParts";

const ROW = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors";

export function VariablePanel({ session, onClose }: { session: RichTextSession; onClose(): void }) {
  const groups = sessionVariables(session);
  const [open, setOpen] = useState<string | null>(groups[0]?.name ?? null);
  const pick = (expression: string) => {
    insertVariable(session.editor, expression);
    onClose();
  };
  if (!groups.length)
    return (
      <div data-rt-panel="variable" className="text-base-content/60 w-56 p-3 text-xs">
        No variables yet.
      </div>
    );
  return (
    <div data-rt-panel="variable" className="relative w-56 p-1">
      <div role="menu" aria-label="Variable groups" className="flex flex-col">
        {groups.map((g) => (
          <div key={g.name} onMouseEnter={() => setOpen(g.name)}>
            <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === g.name} data-rt-var-group={g.name} className={`${ROW} ${open === g.name ? "bg-base-200" : "hover:bg-base-200"}`} onMouseDown={keepFocus} onFocus={() => setOpen(g.name)} onClick={() => setOpen(g.name)}>
              <span className="flex-1">{g.name}</span>
              <Icon name="chevron-right" className="text-base-content/60 size-3" />
            </button>
            {open === g.name && (
              <div role="menu" aria-label={g.name} data-rt-var-flyout={g.name} className="border-base-300/50 bg-base-100 absolute top-0 left-full ml-1 max-h-72 w-56 overflow-y-auto rounded-xl border p-1 shadow-xl">
                {g.items.map((i) => (
                  <button key={i.expression} type="button" role="menuitem" data-rt-var={i.expression} className={`${ROW} hover:bg-base-200`} onMouseDown={keepFocus} onClick={() => pick(i.expression)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{i.label}</span>
                      {i.sample && <span className="text-base-content/50 block truncate text-[10px]">{i.sample}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
