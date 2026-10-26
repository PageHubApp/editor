// Presentational view of the universal input.
/**
 * The universal value field: a type chip (calc, var, tailwind, em, px, rem, %, vh, vw, vmin,
 * vmax), the text, an optional swatch (shadows), a clear X, the Tailwind autocomplete and the
 * calc / variable panels.
 *
 * - Focus opens the autocomplete when there are options or variables. ↑/↓ move the highlight
 *   (they never step the value); Enter picks it, else commits the text; Esc closes it and
 *   restores the stored value; blur commits after 200ms unless focus moved into a popup.
 * - Typing "10px" switches the type to px and keeps 10; refused keystrokes (see `typeInto`) are
 *   dropped; "w-" switches to Tailwind and opens the autocomplete.
 * - Picking an option writes it and blurs; `var(` options switch to the var type.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useOverlay } from "../../../primitives/overlayStack";
import { Icon } from "../../../primitives/icons";
import { ListboxPopover } from "../../../primitives/ListboxPopover";
import { tooltip } from "../../../primitives/tooltip";
import { CalcPanel, VarPanel, type DesignVariable, type TokenDraft } from "./UniversalPanels";
import { CSS_UNITS, TYPE_ORDER, composeValue, parseValue, switchType, typeInto, type ValueType } from "./universalValue";
import { humanizeTailwindValue } from "./displayLabel";

export interface UniversalInputProps {
  /** The stored value (`10px`, `w-4`, `var(--x)`, `calc(…)`). */
  value: string;
  onChange(value: string): void;
  /** Tailwind autocomplete options. */
  options?: readonly string[];
  variables?: readonly DesignVariable[];
  /** The host saves design tokens: their presence adds "New token" / "Edit" to the variable picker. */
  onCreateVariable?(token: TokenDraft): void;
  onUpdateVariable?(token: TokenDraft): void;
  allowedTypes?: readonly ValueType[];
  placeholder?: string;
  /** The field's class stem (`w`, `max-w`, `gap`) — used to humanize the displayed Tailwind token. */
  prefix?: string;
  /** A colour shown before the text (shadow fields). */
  swatch?: string;
  ariaLabel?: string;
}

const BLUR_COMMIT_MS = 200;

/** Descriptive tooltip per value type — shown on each cell of the 3-col type grid. */
const TYPE_TOOLTIP: Record<ValueType, string> = {
  calc: "Formula (calc)",
  var: "Design token / variable",
  tailwind: "Tailwind class",
  px: "Pixels (px)",
  em: "Relative to font size (em)",
  rem: "Relative to root font size (rem)",
  "%": "Percentage (%)",
  vh: "Viewport height (vh)",
  vw: "Viewport width (vw)",
  vmin: "Viewport minimum (vmin)",
  vmax: "Viewport maximum (vmax)",
};

/** Keep the tooltip from colliding with a panel edge: outer columns point out, the middle down. */
const typePlace = (i: number): "left" | "bottom" | "right" => (i % 3 === 0 ? "left" : i % 3 === 2 ? "right" : "bottom");

export function UniversalInput({ value, onChange, options = [], variables = [], onCreateVariable, onUpdateVariable, allowedTypes, placeholder, prefix, swatch, ariaLabel }: UniversalInputProps) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const [type, setType] = useState(parsed.type);
  const [text, setText] = useState(parsed.text);
  const [editing, setEditing] = useState(false);
  /** The text was typed (not just the stored value), so it narrows the options. */
  const [typed, setTyped] = useState(false);
  const [auto, setAuto] = useState(false);
  const [index, setIndex] = useState(0);
  const [typeMenu, setTypeMenu] = useState(false);
  const [panel, setPanel] = useState<"calc" | "var" | null>(null);
  const skipBlur = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing) (setType(parsed.type), setText(parsed.text));
  }, [parsed, editing]);

  const types = TYPE_ORDER.filter((t) => !allowedTypes || allowedTypes.includes(t));
  const shown = useMemo(() => {
    const q = typed ? text.trim().toLowerCase() : "";
    const all = [...options, ...variables.map((v) => `var(${v.name})`)];
    return q ? all.filter((o) => o.toLowerCase().includes(q)) : all;
  }, [options, variables, text, typed]);
  // Register the open autocomplete on the overlay stack so Escape dismisses IT first instead of
  // falling through to selection.clear (which would deselect the element and collapse the inspector).
  // The type menu's popover registers itself.
  const uid = useId();
  useOverlay({ id: `universal-autocomplete:${uid}`, isOpen: auto && shown.length > 0, onDismiss: () => setAuto(false) });

  // When idle, a bare Tailwind token shows its human label ("Full"); editing reveals the raw token.
  const displayValue = !editing && type === "tailwind" && text ? humanizeTailwindValue(prefix ?? "", text) : text;
  // Unit hint: `(px)` for a CSS unit, nothing for tailwind/calc, else the prop placeholder.
  const dynamicPlaceholder = CSS_UNITS.includes(type) ? `(${type})` : type === "tailwind" || type === "calc" ? "" : placeholder;
  const commit = (t = type, v = text) => onChange(composeValue(t, v));
  const pick = (option: string) => {
    skipBlur.current = true;
    const t: ValueType = option.startsWith("var(") ? "var" : "tailwind";
    setType(t);
    setText(option);
    onChange(option);
    setAuto(false);
    setEditing(false);
    input.current?.blur();
  };
  const chooseType = (next: ValueType) => {
    setTypeMenu(false);
    if (next === "calc") return setPanel("calc");
    if (next === "var") return setPanel("var");
    setText(switchType(type, next, text));
    setType(next);
  };

  // The value TYPE reads as an icon (Tailwind / calc / var) or a short unit, matching the real
  // editor's value field — never the uppercase word "TAILWIND".
  const typeGlyph = (t: ValueType) =>
    t === "tailwind" ? <Icon name="brand-tailwind" className="size-3.5" /> : t === "calc" ? <Icon name="math-function" className="size-3.5" /> : t === "var" ? <Icon name="braces" className="size-3.5" /> : <span className="text-[10px] font-medium uppercase">{t}</span>;
  return (
    <div ref={field} className="relative flex w-full items-center gap-1" data-universal-input="">
      <ListboxPopover open={typeMenu} onOpenChange={setTypeMenu} anchor={chip} placement="bottom-end" role="menu" dismiss marker="data-type-selector-dropdown" className="grid min-w-32 grid-cols-3 gap-1">
        {types.map((t, i) => (
          <li key={t} role="none">
            <button type="button" role="menuitem" data-type={t} aria-label={TYPE_TOOLTIP[t]} {...tooltip(TYPE_TOOLTIP[t], typePlace(i))} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseType(t)} className={`hover:bg-neutral flex w-full items-center justify-center rounded px-3 py-1.5 ${t === type ? "bg-neutral text-primary font-semibold" : ""}`}>
              <span className="flex size-4 shrink-0 items-center justify-center">{typeGlyph(t)}</span>
            </button>
          </li>
        ))}
      </ListboxPopover>
      {swatch && <span className="border-base-300 size-4 shrink-0 rounded border" style={{ backgroundColor: swatch }} data-universal-swatch="" aria-hidden />}
      <input
        ref={input}
        type="text"
        value={displayValue}
        placeholder={dynamicPlaceholder}
        aria-label={ariaLabel ?? "Value"}
        autoComplete="off"
        spellCheck={false}
        className="input-plain min-w-0 flex-1"
        onFocus={() => (setEditing(true), setTyped(false), (options.length > 0 || variables.length > 0) && setAuto(true))}
        onChange={(e) => {
          const r = typeInto(e.target.value, type);
          if (!r) return;
          setEditing(true);
          setTyped(true);
          setType(r.type);
          setText(r.text);
          setAuto(!!r.autocomplete);
          setIndex(0);
        }}
        onBlur={(e) => {
          const to = e.relatedTarget as HTMLElement | null;
          if (to?.closest("[data-unified-dropdown], [data-type-selector-dropdown], [role=dialog]")) return;
          setTimeout(() => {
            if (skipBlur.current) skipBlur.current = false;
            else if (composeValue(type, text) !== value) commit();
            setEditing(false);
            setAuto(false);
          }, BLUR_COMMIT_MS);
        }}
        onKeyDown={(e) => {
          if (!auto && e.key !== "Enter" && e.key !== "Escape") return; // ↑/↓ only navigate an open autocomplete
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (auto && shown[index]) pick(shown[index]!);
            else (commit(), setEditing(false), setAuto(false), input.current?.blur());
          } else if (e.key === "Escape") {
            e.preventDefault();
            setAuto(false);
            setEditing(false);
            setText(parsed.text);
            setType(parsed.type);
            input.current?.blur();
          }
        }}
      />
      <button
        ref={chip}
        type="button"
        aria-label={`Value type: ${type}`}
        {...tooltip(`Value type: ${type}`)}
        aria-haspopup="menu"
        aria-expanded={typeMenu}
        onClick={() => setTypeMenu((o) => !o)}
        className="text-neutral-content hover:text-base-content flex size-5 shrink-0 items-center justify-center rounded"
      >
        {typeGlyph(type)}
      </button>
      {value !== "" && (
        <button type="button" aria-label="Clear value" {...tooltip("Clear")} onClick={() => (setText(""), onChange(""))} className="text-base-content/50 hover:text-base-content flex size-5 shrink-0 items-center justify-center rounded">
          <Icon name="x" className="size-3" />
        </button>
      )}
      <ListboxPopover open={auto && shown.length > 0} onOpenChange={setAuto} anchor={field} marker="data-unified-dropdown">
        {shown.map((o, i) => (
          <li key={o} role="option" aria-selected={i === index}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} className={`w-full rounded px-2 py-1 text-left ${i === index ? "bg-primary/10 text-primary" : "hover:bg-neutral"}`}>
              {o}
            </button>
          </li>
        ))}
      </ListboxPopover>
      {panel === "calc" && <CalcPanel initial={type === "calc" ? text : ""} anchor={chip.current} onApply={(v) => (setType("calc"), setText(v), onChange(v), setPanel(null))} onClose={() => setPanel(null)} />}
      {panel === "var" && <VarPanel variables={variables} onCreate={onCreateVariable} onUpdate={onUpdateVariable} ignore={[input, chip]} anchor={chip.current} onPick={(v) => (setType("var"), setText(v), onChange(v), setPanel(null))} onClose={() => setPanel(null)} />}
    </div>
  );
}
