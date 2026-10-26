/**
 * Fields of the Liquid panels. Text fields keep a local draft and commit once — on Enter or
 * blur, only when the text changed — so one edit is one command (one undo step); Escape
 * restores the stored text. `completions` feed a styled chrome dropdown (the same `.ph-panel`
 * listbox the universal value field uses) — never a native `<datalist>`, whose popup is
 * OS-rendered and can't match the editor chrome.
 *
 *   <ExpressionField id="for-collection" label="List" value="products" completions={names} onCommit={set} />
 *   <AddBranchButton onClick={addElse}>Add else</AddBranchButton>
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Chip } from "../../primitives/Chip";
import { ListboxPopover } from "../../primitives/ListboxPopover";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { NO_AUTOCOMPLETE } from "../toolbar/ToolbarItemView";

interface ExpressionFieldProps {
  /** Field id suffix (`input-<id>`). */
  id: string;
  label: string;
  value: string;
  /** Called with the trimmed text when it differs from `value`; return false to keep the draft. */
  onCommit(value: string): boolean | void;
  placeholder?: string;
  completions?: readonly string[];
  multiline?: boolean;
  mono?: boolean;
  /** Focus the field when it mounts (a field opened by its add button). */
  autoFocus?: boolean;
}

export function ExpressionField({ id, label, value, onCommit, placeholder, completions, multiline, mono = true, autoFocus }: ExpressionFieldProps) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [moved, setMoved] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  if (shown !== value) {
    // the stored text changed underneath (undo, another panel): follow it
    setShown(value);
    setDraft(value);
    setInvalid(false);
  }
  // Styled suggestion list: substring match on the last identifier word, so completions help
  // mid-expression too (`product.ti` → `product.title`). Hidden for multiline / no completions.
  const word = draft.split(/[^\w.]+/).pop() ?? "";
  const matches = !multiline && completions?.length
    ? completions.filter((c) => c !== draft && (word === "" || c.toLowerCase().includes(word.toLowerCase()))).slice(0, 12)
    : [];
  const showList = open && matches.length > 0;
  const commit = () => {
    const next = multiline ? draft : draft.trim();
    if (next === value) return setInvalid(false);
    setInvalid(onCommit(next) === false);
  };
  const pick = (c: string) => {
    // replace the trailing word with the chosen completion
    const next = word && draft.endsWith(word) ? draft.slice(0, -word.length) + c : c;
    setDraft(next);
    setOpen(false);
    setInvalid(onCommit(next.trim()) === false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setMoved(true);
      setIndex((i) => Math.max(0, Math.min(matches.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      // Enter takes the highlighted suggestion only while a word is being typed or the arrows chose one;
      // a finished expression (`x == 'a'`, `"Bye"`) has no trailing word and must commit as typed.
      if (showList && matches[index] && (word !== "" || moved)) pick(matches[index]!);
      else commit();
    } else if (e.key === "Escape") {
      if (open) return setOpen(false);
      setDraft(value);
      setInvalid(false);
    }
  };
  const common = {
    id: `input-${id}`,
    value: draft,
    placeholder,
    "aria-label": label,
    "aria-invalid": invalid || undefined,
    onBlur: () => { setTimeout(() => setOpen(false), 120); commit(); },
    onKeyDown,
    autoFocus,
    className: `input-plain flex-1 ${mono ? "font-mono" : ""} ${invalid ? "text-error" : ""}`,
    ...NO_AUTOCOMPLETE,
  };
  return (
    <div ref={field} className="relative min-w-0">
      <Chip label={label} grow={multiline}>
        {multiline ? (
          <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} />
        ) : (
          <input
            {...common}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={`list-${id}`}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setDraft(e.target.value); setOpen(true); setIndex(0); setMoved(false); }}
          />
        )}
      </Chip>
      <ListboxPopover open={showList} onOpenChange={setOpen} anchor={field} id={`list-${id}`} marker="data-expression-dropdown">
        {matches.map((c, i) => (
          <li key={c} role="option" aria-selected={i === index}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} className={`w-full rounded px-2 py-1 text-left font-mono ${i === index ? "bg-primary/10 text-primary" : "hover:bg-neutral"}`}>
              {c}
            </button>
          </li>
        ))}
      </ListboxPopover>
    </div>
  );
}

/** The dashed full-width trigger that adds a branch / condition / loop. */
export function AddBranchButton({ onClick, children, disabled }: { onClick(): void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-neutral-content hover:bg-base-200 hover:text-base-content border-base-300 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-[11px] whitespace-nowrap transition-colors disabled:opacity-50"
    >
      <Icon name="plus" className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}

/** A branch (`elsif`, `when`, `else`) or wrapper row: its fields plus a remove button. */
export function BranchRow({ title, onRemove, removeLabel, children }: { title: string; onRemove?: () => void; removeLabel?: string; children?: ReactNode }) {
  return (
    <div data-liquid-branch={title} className="border-base-300/60 flex flex-col gap-1 rounded-md border p-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base-content/70 font-mono text-[11px]">{title}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel ?? `Remove ${title}`}
            {...tooltip(removeLabel ?? `Remove ${title}`, "top")}
            className="text-base-content/50 hover:text-error flex size-6 items-center justify-center rounded transition-colors"
          >
            <Icon name="trash" className="size-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** A short note under a panel (what the tag does, or why a control is missing). */
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className="text-base-content/60 text-[11px] leading-snug">{children}</p>;
}
