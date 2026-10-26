/**
 * Group-bound sub-field rows for the bundle / effects controls — a labelled value field or
 * colour swatch bound straight to a class GROUP id (not a property-map key), so a bundle item can
 * target a group that has no top-level inspector row of its own (`whitespace`, `decoration-color`,
 * …). Reads / writes flow through the same engine seam the connector `UniversalInput` / `ColorInput`
 * use (`readClass` / `classes.set`), at the active view / dark scope.
 *
 *   <GroupValueRow group="ring-width" label="Width" prefix="ring" options={[...]} />
 *   <GroupColorRow group="border-color" label="Color" />
 */
import { useRef, useState } from "react";
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { themeColorsFacet } from "@pagehub/engine/host";
import { Slot } from "../../../components";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { uiScopeEq, useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import { Chip } from "../../../primitives/Chip";
import { ColorChip } from "../../pickers/ColorChip";
import { colorPrefix, refToCss, refToToken, tokenToRef } from "../../pickers/colorValue";
import type { ValueType } from "../../toolbar/universal/universalValue";
import { GroupUniversalField } from "../../toolbar/UniversalInput";

interface GroupValueRowProps {
  group: string;
  label: string;
  /** Class prefix for arbitrary values (`ring`, `translate-x`); default: the group id. */
  prefix?: string;
  options?: readonly string[];
  allowedTypes?: readonly ValueType[];
}

/** A labelled universal value field bound to a class group (same chrome as the connector `UniversalInput`). */
export function GroupValueRow({ group, label, prefix, options, allowedTypes }: GroupValueRowProps) {
  return (
    <Chip label={label} frame="bordered">
      <GroupUniversalField group={group} prefix={prefix} options={options} allowedTypes={allowedTypes} ariaLabel={label} />
    </Chip>
  );
}

/** Read / write seam for a colour bound to a class GROUP (the group variant of `useColorBinding`). */
export function useGroupColorBinding(group: string) {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const theme = useEditorState((s) => s.facet(themeColorsFacet));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const prefix = colorPrefix(group);
  const palette = theme.light();
  const value = tokenToRef(prefix, readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "", palette);
  const write = (ref: string) => void run("classes.set", { group, token: refToToken(prefix, ref) || null, scopes: writeScopes(ui), at: handle });
  return { value, css: refToCss(value, palette), write };
}

/** A labelled colour swatch row bound to a class group (same chrome as the connector `ColorInput`). */
export function GroupColorRow({ group, label }: { group: string; label: string }) {
  const binding = useGroupColorBinding(group);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!binding) return null;
  const { value, css, write } = binding;
  return (
    <>
      <ColorChip
        ref={trigger}
        label={label}
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
