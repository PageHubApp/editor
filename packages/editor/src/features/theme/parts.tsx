/**
 * Shared row/section primitives for the Theme panel — the small, presentational building blocks
 * every design section reuses so each stays focused on its own tokens. Styling matches the rest
 * of the panel (uppercase section caps, 7rem label gutter, `range range-xs` sliders).
 */
import { useState, type ReactNode } from "react";
import { Icon } from "../../primitives/icons";

/** A static, always-open section with an uppercase caption and optional hint. */
export function Section({ title, hint, right, children }: { title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" data-theme-section={title.toLowerCase()}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base-content/70 text-[11px] font-semibold tracking-wide uppercase">{title}</h3>
        {right}
      </div>
      {hint && <p className="text-base-content/50 -mt-1 text-xs">{hint}</p>}
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

/** A collapsible section with a chevron — used by the heavier design sections. */
export function CollapsibleSection({ title, hint, defaultOpen = false, children }: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col gap-2" data-theme-section={title.toLowerCase()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-2 text-left"
      >
        <h3 className="text-base-content/70 group-hover:text-base-content text-[11px] font-semibold tracking-wide uppercase transition-colors">{title}</h3>
        <Icon name={open ? "chevron-down" : "chevron-right"} className="text-base-content/40 size-4 shrink-0" />
      </button>
      {open && (
        <>
          {hint && <p className="text-base-content/50 -mt-1 text-xs">{hint}</p>}
          <div className="flex flex-col gap-1.5">{children}</div>
        </>
      )}
    </section>
  );
}

/** A labelled range slider with a value readout (used for Density, Depth, Noise, type scale). */
export function SliderRow({ label, value, min, max, step, suffix, labelWidth = "w-28", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; labelWidth?: string; onChange(v: number): void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className={`text-base-content ${labelWidth} shrink-0 font-medium`}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="range range-xs flex-1" aria-label={label} />
      <span className="text-base-content/60 w-16 shrink-0 text-right tabular-nums">{suffix}</span>
    </label>
  );
}

/** A labelled native select (used for Shadow, Border, Underline, font weight). */
export function SelectRow({ label, value, options, labelWidth = "w-28", onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; labelWidth?: string; onChange(v: string): void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className={`text-base-content ${labelWidth} shrink-0 font-medium`}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-wrapper text-base-content h-8 min-w-0 flex-1 cursor-pointer bg-transparent px-1 text-xs" aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
