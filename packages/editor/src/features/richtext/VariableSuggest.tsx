/**
 * The `{{` suggestion popup. Typing `{{` lists the variables that match what follows (label or
 * expression); ↑ ↓ move,
 * Enter or Tab insert the chip in place of the typed text, Esc dismisses until the next `{{`.
 * Mouse presses pick without moving the caret.
 *
 * The panel does not position itself — `RichTextLayer` drops it under the caret (its own
 * absolutely-positioned wrapper in the canvas overlay), not under the toolbar.
 */
import type { RichTextSession } from "./session";
import { keepFocus } from "./toolbarParts";

export function VariableSuggest({ session }: { session: RichTextSession }) {
  const s = session.suggestion();
  if (!s) return null;
  return (
    <div role="listbox" aria-label="Variables" data-rt-suggest="" className="border-base-300/50 bg-base-100 text-base-content max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-xl">
      {s.items.map((item, i) => (
        <button key={item.expression} type="button" role="option" aria-selected={i === s.index} data-rt-suggest-item={item.expression} className={`flex w-full flex-col rounded-md px-2 py-1 text-left text-xs ${i === s.index ? "bg-base-200" : "hover:bg-base-200"}`} onMouseDown={keepFocus} onClick={() => session.acceptSuggestion(i)}>
          <span className="truncate">{item.label}</span>
          <span className="text-base-content/50 truncate font-mono text-[10px]">{item.expression}</span>
        </button>
      ))}
    </div>
  );
}
