/**
 * The Classes editor's add-class input: type a class, pick from engine-known Tailwind suggestions,
 * Enter adds it.
 *
 *   <ClassSearchInput present={classes} onAdd={add} scopeLabel="MD" />
 *
 * - Suggestions (≥2 chars) come from `suggestClasses` over the engine-validated vocabulary; a
 *   breakpoint-prefixed query (`md:`) matches bases and re-prefixes.
 * - Tab completes to the first / matching suggestion; ↑ ↓ move the highlight; Enter adds the
 *   highlighted suggestion, else commits the typed text. A ghost shows the first completion inline.
 * - A bare class is added at the current scope (`scopeLabel`); a class the user prefixes keeps its
 *   prefix. Clicking a suggestion card adds it immediately.
 */
import { useMemo, useRef, useState } from "react";
import { classGroupsFacet } from "@pagehub/engine/kits";
import { useEditorState } from "../../react/bindings";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { Icon } from "../../primitives/icons";
import { Z_LISTBOX } from "../../primitives/zIndex";
import { NO_AUTOCOMPLETE } from "../toolbar/ToolbarItemView";
import { BREAKPOINT_PREFIXES } from "./classScope";
import { suggestClasses, validatedVocab } from "./classVocab";

export function ClassSearchInput({ present, onAdd, scopeLabel }: { present: readonly string[]; onAdd: (token: string) => void; scopeLabel: string }) {
  const groups = useEditorState((s) => s.facet(classGroupsFacet));
  const vocab = useMemo(() => validatedVocab(groups), [groups]);
  const [input, setInput] = useState("");
  const [sel, setSel] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => suggestClasses(input, vocab, present), [input, vocab, present]);
  const ghost = input.length >= 2 && matches[0]?.startsWith(input) ? matches[0].slice(input.length) : "";

  const commit = (token: string) => {
    const t = token.trim();
    if (!t) return;
    onAdd(t);
    setInput("");
    setSel(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" && matches.length) {
      e.preventDefault();
      const bp = BREAKPOINT_PREFIXES.find((p) => input.startsWith(p));
      const next = bp ? (matches.find((m) => m.startsWith(input.split(":")[0] + ":")) ?? matches[0]!) : matches[0]!;
      setInput(next);
      setSel(0);
    } else if (e.key === "ArrowDown" && matches.length) {
      e.preventDefault();
      setSel((p) => Math.min(p + 1, matches.length - 1));
    } else if (e.key === "ArrowUp" && matches.length) {
      e.preventDefault();
      setSel((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(matches.length && sel > 0 ? (matches[sel] ?? input) : input);
    } else if (e.key === "Escape" && input) {
      e.preventDefault();
      setInput("");
    }
  };

  return (
    <div ref={wrap} className="relative" data-class-search="">
      <div className="border-base-300 bg-base-100 focus-within:border-primary flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors">
        <Icon name="search" className="text-base-content/40 size-3.5 shrink-0" />
        <div className="relative min-w-0 flex-1">
          <input
            value={input}
            onChange={(e) => (setInput(e.target.value), setSel(0))}
            onKeyDown={onKeyDown}
            placeholder="Add a class…"
            aria-label="Add a class"
            role="searchbox"
            data-class-input=""
            className="text-base-content placeholder:text-base-content/40 w-full bg-transparent font-mono text-[11px] outline-none"
            {...NO_AUTOCOMPLETE}
          />
          {ghost && (
            <div className="pointer-events-none absolute inset-0 flex items-center font-mono text-[11px]" aria-hidden>
              <span className="invisible">{input}</span>
              <span className="text-base-content/35">{ghost}</span>
            </div>
          )}
        </div>
        <span className="text-base-content/45 shrink-0 text-[9px] font-medium tracking-wide uppercase" {...{ "data-add-scope-label": "" }}>
          → {scopeLabel}
        </span>
      </div>

      <AnchoredPopover open={input.length >= 2 && matches.length > 0} onOpenChange={() => setInput("")} anchor={wrap} fitContent={280} zIndex={Z_LISTBOX} immediate disableDismiss className="flex flex-col">
        <div className="border-base-300 bg-base-100 flex min-h-0 flex-col overflow-hidden rounded-lg border shadow-xl" style={{ width: wrap.current?.offsetWidth }} data-class-suggestions="">
          <div className="scrollbar flex min-h-0 flex-wrap gap-1 overflow-auto p-1.5">
            {matches.map((m, k) => (
              <button
                key={m}
                type="button"
                data-class-suggestion={m}
                onMouseEnter={() => setSel(k)}
                onClick={() => commit(m)}
                className={`cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] ${k === sel ? "bg-primary text-primary-content" : "bg-base-200 text-base-content/80 hover:bg-base-300"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="border-base-300 text-base-content/55 flex flex-wrap gap-x-2 gap-y-0.5 border-t px-2 py-1.5 text-[10px]">
            <span>
              <kbd className="bg-base-200 border-base-300 rounded border px-1">Tab</kbd> complete
            </span>
            <span>
              <kbd className="bg-base-200 border-base-300 rounded border px-1">↑↓</kbd> move
            </span>
            <span>
              <kbd className="bg-base-200 border-base-300 rounded border px-1">↵</kbd> add
            </span>
            <span className="w-full">Prefix with sm: md: lg: xl: 2xl: for a breakpoint.</span>
          </div>
        </div>
      </AnchoredPopover>
    </div>
  );
}
