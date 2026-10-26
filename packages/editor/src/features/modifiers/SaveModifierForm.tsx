/**
 * "Save current styles as modifier": the selected element's own class tokens shown as removable
 * chips (click a chip to exclude it from what gets saved — this never touches the element's real
 * `class`, it only curates the subset). A name above, a Save / Cancel below. Saving records the
 * curated bundle in the saved-modifier library (`addSavedModifier`), where it joins the built-in
 * presets and can be stacked on any element. There is no component-type scope field: HTML pages
 * have no component types, so a saved modifier applies to any element.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useInspectedClass } from "../../react/bindings";
import { addSavedModifier } from "./savedModifiers";
import { Icon } from "../../primitives/icons";

function uniqueTokens(classes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of classes) {
    const tok = t.trim();
    if (!tok || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

export function SaveModifierForm({ onDone }: { onDone(): void }) {
  const { classes } = useInspectedClass();
  const allTokens = useMemo(() => uniqueTokens(classes), [classes]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => labelRef.current?.focus(), []);

  const included = allTokens.filter((t) => !excluded.has(t));
  const canSave = !!label.trim() && included.length > 0;

  const toggleToken = (token: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (!next.delete(token)) next.add(token);
      return next;
    });

  const submit = () => {
    if (!canSave) return;
    addSavedModifier(label, included.join(" "));
    onDone();
  };

  if (allTokens.length === 0) {
    return (
      <div className="flex flex-col gap-3" data-modifier-save="">
        <p className="text-base-content/60 border-base-300 rounded-box border border-dashed px-3 py-6 text-center text-xs" data-modifier-save-empty="">
          This element has no classes to save.
        </p>
        <button type="button" onClick={onDone} className="border-base-300 hover:bg-base-200 h-7 self-start rounded-md border px-3 text-xs">
          Back to library
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-modifier-save="">
      <label className="flex flex-col gap-1">
        <span className="text-base-content/70 text-[10px] font-medium">Modifier name</span>
        <input
          ref={labelRef}
          type="text"
          data-modifier-save-name=""
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") onDone();
          }}
          placeholder="e.g. my-card-style"
          className="border-base-300 bg-base-100 rounded-field h-8 w-full border px-2 text-xs outline-none focus:border-primary"
        />
      </label>

      <div className="flex min-h-0 flex-col gap-1">
        <div className="flex items-baseline justify-between px-0.5">
          <span className="text-base-content/70 text-[10px] font-medium">Classes to include</span>
          <span className="text-base-content/50 text-[10px]" data-modifier-save-count="">
            {included.length} / {allTokens.length}
          </span>
        </div>
        <div className="border-base-300 bg-base-100 rounded-box flex flex-wrap gap-1 border p-1.5">
          {allTokens.map((token) => {
            const isExcluded = excluded.has(token);
            return (
              <button
                key={token}
                type="button"
                data-modifier-save-token={isExcluded ? "excluded" : "included"}
                onClick={() => toggleToken(token)}
                aria-pressed={!isExcluded}
                aria-label={isExcluded ? `Include ${token}` : `Exclude ${token}`}
                className={
                  isExcluded
                    ? "border-base-300 text-base-content/50 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] line-through"
                    : "border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]"
                }
              >
                <span>{token}</span>
                {!isExcluded && <Icon name="x" className="size-2.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          data-modifier-save-commit=""
          onClick={submit}
          disabled={!canSave}
          className="bg-primary text-primary-content disabled:bg-base-300 disabled:text-base-content/50 h-7 flex-1 rounded-md px-3 text-xs font-medium"
        >
          Save modifier
        </button>
        <button type="button" onClick={onDone} className="border-base-300 hover:bg-base-200 h-7 rounded-md border px-3 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
