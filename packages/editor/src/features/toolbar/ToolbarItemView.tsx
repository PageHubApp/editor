// Presentational part only; state lives in connectors/toolbar/ToolbarItem.tsx.
/**
 * The generic property row every inspector section uses: a labelled Chip around one input.
 * Uncontrolled inputs that report every change through `onChange(value)` ("" = clear); the
 * connector decides what that writes.
 *
 *   <ToolbarItemView label="Gap" type="select" valueLabels={["gap-2", "gap-4"]} value="gap-4" onChange={set} />
 *
 * Types: `text` (default) / `url` / `email` / `number` / `custom` (`<propTag>-[Npx]`) /
 * `textarea` / `slider` / `toggle` / `checkbox` / `select` / `radio` / `codemirror` (the
 * `CodeView` slot).
 */
import type { ReactNode } from "react";
import { Slot } from "../../components";
import { Chip } from "../../primitives/Chip";
import { TOOLTIP_ID } from "../../primitives/tooltip";
import { ToolbarDropdown } from "./ToolbarDropdown";
import { ToolbarSegmentedControl } from "./primitives/ToolbarSegmentedControl";

/** Keeps browser autofill off toolbar fields. */
export const NO_AUTOCOMPLETE = { autoComplete: "off", autoCorrect: "off", autoCapitalize: "off", spellCheck: false } as const;

type ToolbarItemType = "text" | "url" | "email" | "number" | "custom" | "textarea" | "slider" | "toggle" | "checkbox" | "select" | "radio" | "codemirror";

export interface ToolbarOption {
  value: string | number;
  label?: ReactNode;
  hint?: string;
}

export interface ToolbarItemViewProps {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: ToolbarItemType;
  label?: string;
  labelHide?: boolean;
  labelWidth?: string;
  /** Beside the label (the breakpoint chip). */
  adornment?: ReactNode;
  /** Trailing control(s) inside the frame. */
  append?: ReactNode;
  /** Field id suffix (`input-<inputId>`). */
  inputId?: string;
  /** `custom`: token prefix written as `<propTag>-[Npx]`. */
  propTag?: string;
  /** Row already framed by a parent. */
  wrap?: string;
  placeholder?: string;
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  /** `slider`: position → value. */
  valueLabels?: readonly string[];
  /** `select` options as children of the dropdown. */
  children?: ReactNode;
  /** `select`: shown when the stored value is empty. */
  valueCoalesce?: string | number;
  /** `radio` options. */
  options?: readonly ToolbarOption[];
  /** `toggle` / `checkbox`: value written when switched on, and its text. */
  on?: string;
  option?: string;
  codeType?: "html" | "css" | "javascript" | "js";
  formatLabel?: (value: string) => string;
}

/** Bordered single-line / multi-line field; one shape for every text-like type. */
function TextField({ p, multiline }: { p: ToolbarItemViewProps; multiline?: boolean }) {
  const { type = "text", value, onChange, inputId, placeholder, append, wrap, label, propTag = "" } = p;
  const id = inputId ? `input-${inputId}` : undefined;
  const aria = label || placeholder || inputId || (multiline ? "Text area" : `${type} input`);
  const custom = type === "custom";
  const field = multiline ? (
    <textarea id={id} defaultValue={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={p.rows || 4} placeholder={placeholder} className="input-plain flex-1" aria-label={aria} {...NO_AUTOCOMPLETE} />
  ) : (
    <input
      id={id}
      type={custom ? "number" : type}
      min={custom ? "0" : undefined}
      defaultValue={custom ? /\[(-?\d+(?:\.\d+)?)px\]/.exec(String(value ?? ""))?.[1] : (value ?? "")}
      onChange={(e) => onChange(custom ? `${propTag}-[${e.target.value}px]` : e.target.value)}
      placeholder={placeholder}
      className="input-plain flex-1"
      aria-label={aria}
      {...NO_AUTOCOMPLETE}
    />
  );
  return (
    <Chip passthrough={!!wrap} grow={multiline}>
      <div className={`flex w-full ${multiline ? "items-start" : "items-center"} gap-2`}>
        {field}
        {append && <div className="flex shrink-0 items-center gap-0.5">{append}</div>}
      </div>
    </Chip>
  );
}

function Toggle({ value, onChange, inputId, on = "", option }: ToolbarItemViewProps) {
  return (
    <label className={`relative flex h-8 w-full cursor-pointer items-center transition-transform active:scale-[0.98] ${option ? "flex-row justify-between gap-3" : "justify-end"}`}>
      {option && <span className="text-base-content min-w-0 flex-1 text-left text-xs font-medium">{option}</span>}
      <div className="relative inline-flex w-fit shrink-0">
        <input type="checkbox" id={inputId ? `input-${inputId}` : undefined} defaultChecked={!!value} onChange={() => onChange(value ? "" : on)} className="peer sr-only" />
        <div className="bg-neutral text-neutral-content after:border-base-300 after:bg-base-100 peer-checked:bg-primary peer-checked:after:border-base-100 peer-focus:ring-ring h-4 w-8 rounded-full peer-focus:ring-2 after:absolute after:top-[2px] after:left-[2px] after:size-3 after:rounded-full after:border after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
      </div>
    </label>
  );
}

function Slider({ value, onChange, valueLabels, min = 0, max = 100, step = 1, label, inputId, append }: ToolbarItemViewProps) {
  const index = valueLabels ? valueLabels.indexOf(String(value)) : -1;
  const current = index >= 0 ? index : Number.isFinite(Number(value)) ? Number(value) || 0 : 0;
  return (
    <div className="flex h-8 w-full items-center gap-1.5">
      <input
        type="range"
        className="slider bg-neutral text-neutral-content h-2 flex-1 cursor-pointer appearance-none rounded-lg"
        min={min}
        max={max}
        step={step}
        defaultValue={current}
        onChange={(e) => onChange(valueLabels ? (valueLabels[Number(e.target.value)] ?? "") : e.target.value)}
        aria-label={label || inputId || "Slider"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={value != null && value !== "" ? String(value) : String(current)}
      />
      {append && <div className="flex shrink-0 items-center gap-0.5">{append}</div>}
    </div>
  );
}

function Input(p: ToolbarItemViewProps) {
  const { type = "text", value, onChange } = p;
  switch (type) {
    case "toggle":
    case "checkbox":
      return <Toggle {...p} />;
    case "textarea":
      return <TextField p={p} multiline />;
    case "slider":
      return <Slider {...p} />;
    case "select": {
      const shown = p.valueCoalesce !== undefined && (value == null || value === "") ? p.valueCoalesce : value;
      return (
        <ToolbarDropdown value={shown ?? ""} onChange={onChange} valueLabels={p.valueLabels} formatLabel={p.formatLabel} wrap={p.wrap} append={p.append} inputId={p.inputId} placeholder={p.placeholder} chevron>
          {p.children}
        </ToolbarDropdown>
      );
    }
    case "radio":
      // No Chip frame: the segmented control owns its surface. A leading "" option is
      // content-narrow so the others share the track evenly.
      return (
        <ToolbarSegmentedControl
          dense
          value={String(value ?? "")}
          onChange={onChange}
          tooltipId={TOOLTIP_ID}
          options={(p.options ?? []).map((o) => {
            const v = String(o.value ?? "");
            const tip = o.hint ?? (typeof o.label === "string" ? o.label : v);
            return { value: v, label: o.label, tooltip: tip || "None", ariaLabel: tip || v, widthClass: v === "" ? "flex-none px-2" : undefined };
          })}
        />
      );
    case "codemirror":
      return (
        <div className="flex w-full flex-col gap-2">
          <Slot name="CodeView" value={String(value ?? "")} onChange={onChange} language={p.codeType ?? "html"} minHeight="120px" maxHeight="300px" placeholder={p.placeholder || `Enter ${p.codeType ?? "html"} code...`} />
        </div>
      );
    default:
      return <TextField p={p} />;
  }
}

export function ToolbarItemView(p: ToolbarItemViewProps) {
  return (
    <Chip label={p.labelHide ? undefined : p.label} adornment={p.adornment} labelWidth={p.labelWidth} passthrough={!!p.wrap} frame="bare">
      <Input {...p} />
    </Chip>
  );
}
