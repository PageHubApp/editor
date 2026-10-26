/**
 * One palette row in the Theme panel: the shared `ColorChip` + `ColorPicker` slot (the same
 * picker the inspector's colour rows open), wired to a theme token instead of an element class.
 * The chip always shows a swatch — the stored override, or the token's live value
 * (`var(--color-<name>)`) when there is none. A pick stores the concrete colour; the X removes
 * the override and falls back to the token default.
 *
 *   <ThemeColorRow name="primary" label="Primary" value={stored} onChange={write} />
 */
import { useRef, useState } from "react";
import { Slot } from "../../components";
import { ColorChip } from "../pickers/ColorChip";
import { hexOf, refToCss } from "../pickers/colorValue";

interface ThemeColorRowProps {
  name: string;
  label: string;
  /** The stored concrete colour, or null for "no override". */
  value: string | null;
  /** The concrete colour to store, or null to clear the override. */
  onChange(value: string | null): void;
}

const HEX_OR_FN = /^(#|rgba?\(|hsla?\(|oklch\(|oklab\()/i;

export function ThemeColorRow({ name, label, value, onChange }: ThemeColorRowProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The picker reads/writes a "ref"; a stored colour is already a valid ref, else the token itself.
  const ref = value && HEX_OR_FN.test(value) ? (hexOf(value) || value) : `palette:${name}`;
  const css = value || `var(--color-${name})`;
  const write = (next: string) => {
    if (next === "" || next === `palette:${name}`) return onChange(null);
    onChange(refToCss(next) || null); // plain colours pass through; other palette refs resolve to var()
  };
  return (
    <>
      <ColorChip
        ref={trigger}
        label={label}
        labelWidth="w-28"
        value={ref}
        fill={css}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onClear={() => {
          setOpen(false);
          onChange(null);
        }}
      />
      {open && <Slot name="ColorPicker" value={ref} onChange={write} onClose={() => setOpen(false)} anchor={trigger.current} />}
    </>
  );
}
