/**
 * Colour controls for a colour property (`background`, `color`, `borderColor`…). All read the
 * class group for the current view and write each pick as one `classes.set`:
 *
 * - `useColorBinding(prop)` — the shared read/write seam (value ref, CSS, writer, palette).
 * - `ColorInput` — the self-framing row: a swatch chip that opens the floating `ColorPicker` slot.
 * - `ColorPanelControl` — just the picker body, for a popover row whose chip is the swatch.
 *
 *   <ColorInput prop="background" label="Background" />
 */
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { themeColorsFacet, type ThemeColors } from "@pagehub/engine/host";
import { useRef, useState } from "react";
import { Slot } from "../../components";
import { useEditorState, useInspectedClass, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { writeScopes } from "../../state/uiState";
import { ColorChip } from "./ColorChip";
import { ColorPanelBody } from "./ColorPanelBody";
import { colorPrefix, refToCss, refToToken, tokenToRef } from "./colorValue";
import { usePaletteTokens } from "../theme/usePaletteTokens";
import { classBinding } from "../inspector/propertyBinding";
import { BreakpointChip } from "../toolbar/breakpoint-chip/BreakpointChip";

interface ColorBinding {
  /** The stored colour ref (`palette:primary`, `#fff`, …), or "" when unset. */
  value: string;
  /** The ref as CSS, for a swatch. */
  css: string;
  /** Write a ref ("" clears the group). */
  write(ref: string): void;
  theme: ThemeColors;
}

/** Read / write seam for a colour property, shared by the chip row and the popover panel. */
export function useColorBinding(prop: string): ColorBinding | null {
  const { group, state } = classBinding(prop);
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const theme = useEditorState((s) => s.facet(themeColorsFacet));
  const ui = useUi((u) => u, (a, b) => a.view === b.view && a.dark === b.dark && a.multiScope === b.multiScope);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const prefix = colorPrefix(group);
  const palette = theme.light();
  const value = tokenToRef(prefix, readClass(classes, def, { view: ui.view, dark: ui.dark, state }).value ?? "", palette);
  const write = (ref: string) => void run("classes.set", { group, token: refToToken(prefix, ref) || null, scopes: writeScopes(ui, state), at: handle });
  return { value, css: refToCss(value, palette), write, theme };
}

interface ColorInputProps {
  prop: string;
  label?: string;
  labelHide?: boolean;
  labelWidth?: string;
}

export function ColorInput({ prop, label, labelHide, labelWidth }: ColorInputProps) {
  const binding = useColorBinding(prop);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!binding) return null;
  const { value, css, write } = binding;
  return (
    <>
      <ColorChip
        ref={trigger}
        label={labelHide ? undefined : label}
        labelWidth={labelWidth}
        adornment={<BreakpointChip prop={prop} label={label} />}
        value={value}
        fill={css}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onClear={() => {
          setOpen(false);
          write("");
        }}
      />
      {open && <Slot name="ColorPicker" value={value} onChange={write} onClose={() => setOpen(false)} anchor={trigger.current} />}
    </>
  );
}

/** The colour picker body bound to a property, for a popover row whose chip carries the swatch. */
export function ColorPanelControl({ prop }: { prop: string }) {
  const palette = usePaletteTokens();
  const binding = useColorBinding(prop);
  if (!binding) return null;
  return <ColorPanelBody value={binding.value} onChange={binding.write} onClear={() => binding.write("")} theme={palette.theme} crud={palette} />;
}
