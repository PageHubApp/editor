/**
 * Does any of these property-map keys hold a non-base breakpoint override on the inspected
 * element? False when indicator density is `off`. Reads the `class` attribute through the core;
 * the map supplies each key's class group.
 */
import { classGroupsFacet } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass } from "../../../react/bindings";
import { useUi } from "../../../react/useUi";
import { hasAnyOverride } from "./overrides";
import { classBinding } from "../../inspector/propertyBinding";

export function useSectionHasAnyOverride(props: readonly string[]): boolean {
  const { classes } = useInspectedClass();
  const density = useUi((u) => u.density);
  const defs = useEditorState((s) => s.facet(classGroupsFacet));
  if (density === "off" || !props.length) return false;
  return hasAnyOverride(classes, props.map((p) => defs.get(classBinding(p).group)).filter((g) => g !== undefined));
}
