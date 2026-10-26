/**
 * One font row in the Theme panel: the same chip + `FontPicker` slot `FontInput` uses, but the
 * picker opens above the floating panel (`Z_FLOATING_EDITOR`) instead of behind it — an
 * AnchoredPopover at its default z sits under a floating panel. Value is a family name; picking
 * one stores it, the X clears it.
 *
 *   <ThemeFontRow label="Heading" value={heading} onChange={setHeading} />
 */
import { useRef, useState } from "react";
import { Slot } from "../../components";
import { PopoverChip } from "../../primitives/Chip";
import { Z_FLOATING_EDITOR } from "../../primitives/zIndex";

interface ThemeFontRowProps {
  label: string;
  labelWidth?: string;
  value: string;
  onChange(value: string): void;
}

export function ThemeFontRow({ label, labelWidth, value, onChange }: ThemeFontRowProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PopoverChip
        ref={trigger}
        label={label}
        labelWidth={labelWidth}
        open={open}
        onTriggerClick={() => setOpen((o) => !o)}
        onClear={() => (setOpen(false), onChange(""))}
        triggerAriaLabel={value ? "Change font" : "Pick font"}
        clearAriaLabel="Clear font"
        leading={<span className="text-xs font-semibold" style={{ fontFamily: `"${value}"` }}>Aa</span>}
        summary={value || "Pick font"}
      />
      {open && <Slot name="FontPicker" value={value} onChange={onChange} onClose={() => setOpen(false)} anchor={trigger.current} zIndex={Z_FLOATING_EDITOR} />}
    </>
  );
}
