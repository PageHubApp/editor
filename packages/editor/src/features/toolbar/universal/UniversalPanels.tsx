/** The two panels of the universal input: the calc expression editor and the design-variable list. */
import { useMemo, useState, type RefObject } from "react";
import { FloatingPanel } from "../../../primitives/FloatingPanel";
import { Chip } from "../../../primitives/Chip";

export interface DesignVariable {
  /** The CSS custom property, `--primary`. */
  name: string;
  label?: string;
  value?: string;
}

const GAP = 8;
const WIDTH = 280;

/** Opens right of the anchor if it fits, else left. */
export function sidePosition(anchor: HTMLElement | null, width: number): { x: number; y: number } | undefined {
  if (!anchor) return undefined;
  const r = anchor.getBoundingClientRect();
  const fits = r.right + GAP + width <= window.innerWidth;
  return { x: fits ? r.right + GAP : Math.max(GAP, r.left - width - GAP), y: Math.max(8, r.top) };
}

/**
 * The CSS-function composer (the `fx` panel). A segmented function picker (calc / clamp / min /
 * max / var) over a per-function body, with a live preview of the value that will be written:
 *   - calc / var    — a free-form textarea
 *   - clamp         — Min / Preferred / Max rows
 *   - min / max     — Value A / Value B rows
 * The panel is positioned by `anchor` and reports through `onApply` / `onClose`.
 */
const CALC_FUNCTIONS = [
  { id: "calc", label: "calc()", example: "calc(100% - 20px)" },
  { id: "clamp", label: "clamp()", example: "clamp(1rem, 5vw, 3rem)" },
  { id: "min", label: "min()", example: "min(50vw, 500px)" },
  { id: "max", label: "max()", example: "max(50vw, 300px)" },
  { id: "var", label: "var()", example: "var(--primary)" },
] as const;
type CalcFn = (typeof CALC_FUNCTIONS)[number]["id"];

function detectCalcFunction(val: string): CalcFn {
  if (val.startsWith("clamp(")) return "clamp";
  if (val.startsWith("min(")) return "min";
  if (val.startsWith("max(")) return "max";
  if (val.startsWith("var(")) return "var";
  return "calc";
}

/** Parse `clamp(a, b, c)` / `min(a, b)` / `max(a, b)` into trimmed args. */
function parseCalcArgs(val: string): string[] {
  const m = /^(?:clamp|min|max)\((.+)\)$/.exec(val);
  return m ? m[1]!.split(",").map((s) => s.trim()) : [];
}

function ClampRow({ label, value, placeholder, autoFocus, onChange }: { label: string; value: string; placeholder: string; autoFocus?: boolean; onChange(v: string): void }) {
  return (
    <Chip label={label} labelWidth="w-20">
      <input type="text" value={value} placeholder={placeholder} autoFocus={autoFocus} aria-label={label} spellCheck={false} autoComplete="off" onChange={(e) => onChange(e.target.value)} className="input-plain min-w-0 flex-1 font-mono" />
    </Chip>
  );
}

export function CalcPanel({ initial, anchor, onApply, onClose }: { initial: string; anchor: HTMLElement | null; onApply(v: string): void; onClose(): void }) {
  const [fn, setFn] = useState<CalcFn>(() => detectCalcFunction(initial));
  const [expr, setExpr] = useState(initial);
  const initArgs = useMemo(() => parseCalcArgs(initial), [initial]);
  const [a, setA] = useState(initArgs[0] ?? "");
  const [pref, setPref] = useState(initial.startsWith("clamp(") ? (initArgs[1] ?? "") : "");
  const [b, setB] = useState(initial.startsWith("clamp(") ? (initArgs[2] ?? "") : (initArgs[1] ?? ""));

  const pickFn = (next: CalcFn) => {
    setFn(next);
    if (next === "clamp" && !a && !pref && !b) (setA("1rem"), setPref("5vw"), setB("3rem"));
    else if ((next === "min" || next === "max") && !a && !b) (setA("50vw"), setB(next === "min" ? "500px" : "300px"));
    else if ((next === "calc" || next === "var") && !expr.trim()) setExpr(CALC_FUNCTIONS.find((f) => f.id === next)!.example);
  };

  // The value that will be written — shown live in the preview and sent on Apply.
  const composed =
    fn === "clamp" ? `clamp(${a}, ${pref}, ${b})`
    : fn === "min" || fn === "max" ? `${fn}(${a}, ${b})`
    : fn === "calc" ? (expr.trim().startsWith("calc(") || !expr.trim() ? expr.trim() : `calc(${expr.trim()})`)
    : expr.trim();
  const ready = fn === "clamp" ? !!(a && pref && b) : fn === "min" || fn === "max" ? !!(a && b) : !!expr.trim();

  return (
    <FloatingPanel isOpen onClose={onClose} title="CSS Function" storageKey="universal-calc" autoSize={false} defaultWidth={WIDTH} defaultHeight={280} minWidth={240} minHeight={220} initialPosition={sidePosition(anchor, WIDTH)} persistSize={false} scrollable>
      <div className="flex flex-col gap-3">
        <div className="bg-neutral flex gap-0.5 rounded-md p-0.5" role="group" aria-label="CSS function">
          {CALC_FUNCTIONS.map((f) => (
            <button key={f.id} type="button" aria-pressed={fn === f.id} onClick={() => pickFn(f.id)} className={`flex-1 cursor-pointer rounded px-1.5 py-1 font-mono text-[11px] transition-colors ${fn === f.id ? "bg-base-100 text-base-content shadow-sm" : "text-neutral-content hover:text-base-content"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {fn === "clamp" ? (
          <div className="flex flex-col gap-1.5">
            <ClampRow label="Min" value={a} placeholder="1rem" autoFocus onChange={setA} />
            <ClampRow label="Preferred" value={pref} placeholder="5vw" onChange={setPref} />
            <ClampRow label="Max" value={b} placeholder="3rem" onChange={setB} />
          </div>
        ) : fn === "min" || fn === "max" ? (
          <div className="flex flex-col gap-1.5">
            <ClampRow label="Value A" value={a} placeholder="50vw" autoFocus onChange={setA} />
            <ClampRow label="Value B" value={b} placeholder={fn === "min" ? "500px" : "300px"} onChange={setB} />
          </div>
        ) : (
          <textarea value={expr} onChange={(e) => setExpr(e.target.value)} rows={3} autoFocus placeholder={fn === "var" ? "var(--primary)" : "100% - 2rem"} aria-label={`${fn} expression`} spellCheck={false} className="border-base-300 bg-base-200 text-base-content rounded-md border p-2 font-mono text-xs" />
        )}

        <div data-calc-preview="" className="bg-neutral text-neutral-content overflow-x-auto rounded-md px-2 py-1.5 font-mono text-[11px]">{composed || "—"}</div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={() => onApply(composed)}>Apply</button>
        </div>
      </div>
    </FloatingPanel>
  );
}

/** A host-owned design token being saved from the picker's New Token / Edit Token stage. */
export interface TokenDraft {
  name: string;
  value: string;
}

type Stage = { kind: "list" } | { kind: "new" } | { kind: "edit"; token: DesignVariable };
const TOKEN_NAME = /^--[\w-]+$/;
const FIELD = "border-base-300 bg-base-200 text-base-content h-8 rounded-md border px-2 text-xs";

/**
 * The design-variable list. When the host passes `onCreate` / `onUpdate` the panel also has the
 * "New Token" button and a pencil per row; each opens a small form in the same window (titled
 * "New Token" / "Edit Token") and returns to the list on Save or Cancel.
 */
export function VarPanel({ variables, anchor, onPick, onClose, onCreate, onUpdate, ignore }: { variables: readonly DesignVariable[]; anchor: HTMLElement | null; onPick(value: string): void; onClose(): void; onCreate?(token: TokenDraft): void; onUpdate?(token: TokenDraft): void; /** Elements whose clicks don't dismiss the picker (the input and the type chip). */ ignore?: ReadonlyArray<RefObject<HTMLElement | null>> }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "list" });
  const list = variables.filter((v) => `${v.name} ${v.label ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const title = stage.kind === "new" ? "New Token" : stage.kind === "edit" ? "Edit Token" : "Design Variables";
  return (
    <FloatingPanel isOpen onClose={onClose} title={title} storageKey="universal-var" ignoreOutsideClicks={ignore} autoSize={false} defaultWidth={WIDTH} defaultHeight={320} minWidth={240} minHeight={200} initialPosition={sidePosition(anchor, WIDTH)} persistSize={false} scrollable>
      {stage.kind === "list" ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search variables..." aria-label="Search variables" autoFocus className={`${FIELD} min-w-0 flex-1`} />
            {onCreate && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage({ kind: "new" })}>
                New token
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="text-neutral-content px-2 py-3 text-center text-xs italic">{variables.length ? "No matches" : "No design variables"}</p>
          ) : (
            list.map((v) => (
              <div key={v.name} className="flex items-center gap-1">
                <button type="button" onClick={() => onPick(`var(${v.name})`)} className="hover:bg-neutral flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-xs">
                  <span className="text-base-content">{v.label ?? v.name}</span>
                  <span className="text-neutral-content font-mono text-[10px]">{v.value ?? v.name}</span>
                </button>
                {onUpdate && (
                  <button type="button" aria-label={`Edit ${v.label ?? v.name}`} className="btn btn-ghost btn-xs" onClick={() => setStage({ kind: "edit", token: v })}>
                    Edit
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <TokenForm key={stage.kind === "edit" ? stage.token.name : "new"} token={stage.kind === "edit" ? stage.token : null} onCancel={() => setStage({ kind: "list" })} onSave={(t) => (stage.kind === "edit" ? onUpdate?.(t) : onCreate?.(t), setStage({ kind: "list" }))} />
      )}
    </FloatingPanel>
  );
}

function TokenForm({ token, onCancel, onSave }: { token: DesignVariable | null; onCancel(): void; onSave(t: TokenDraft): void }) {
  const [name, setName] = useState(token?.name ?? "--");
  const [value, setValue] = useState(token?.value ?? "");
  const valid = TOKEN_NAME.test(name) && value.trim() !== "";
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ name, value: value.trim() });
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} readOnly={!!token} aria-label="Token name" placeholder="--brand" autoFocus={!token} className={`${FIELD} font-mono`} />
      <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Token value" placeholder="1rem" autoFocus={!!token} className={FIELD} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!valid}>Save</button>
      </div>
    </form>
  );
}
