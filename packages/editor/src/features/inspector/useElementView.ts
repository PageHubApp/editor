/**
 * The inspected element as the inspector's rules see it (`ElementView`): its component type,
 * component-tab titles and hidden keys from its definition (`element.inspectorFor(tag)`), and a
 * has-value test per row — a token of the row's class groups (under `hover:` for hover rows),
 * its attribute, its Liquid argument, or (Conditions / Data source) a Liquid wrapper around it. Recomputed when its file changes.
 */
import { useMemo } from "react";
import { groupTest, splitClass, type ClassGroup, type NodeHandle } from "@pagehub/engine";
import { classGroupsFacet } from "@pagehub/engine/kits";
import { useEditorState } from "../../react/bindings";
import type { RowDef } from "./rows/inspectorRows";
import { wrapperOf, WRAPPER_ROWS } from "../liquid/markup";
import type { ElementView } from "./rowRules";

const POSITIONED = new Set(["relative", "absolute", "fixed", "sticky"]);

function rowHasValue(row: RowDef, h: NodeHandle, groups: ReadonlyMap<string, ClassGroup>): boolean {
  if (!h.alive) return false;
  if (row.groups.length && h.kind === "element") {
    const tests = row.groups.map((id) => groups.get(id)).filter((g): g is ClassGroup => !!g).map(groupTest);
    const hover = row.entry.variant === "hover";
    return h.classes().some((c) => {
      const [prefix, base] = splitClass(c);
      return hover === prefix.split(":").includes("hover") && tests.some((t) => t(base));
    });
  }
  if (WRAPPER_ROWS[row.id] && h.kind === "element") return !!wrapperOf(h, WRAPPER_ROWS[row.id]!);
  if (row.attr && h.kind === "element") return h.attr(row.attr) !== undefined;
  if (row.arg) return h.args().some((a) => a.name === row.arg);
  return false;
}

export function elementView(h: NodeHandle, groups: ReadonlyMap<string, ClassGroup>): ElementView {
  const spec = h.element.inspectorFor?.(h.tag) ?? {};
  const classes = h.kind === "element" ? h.classes() : [];
  return {
    ...(spec.type ? { type: spec.type } : {}),
    tag: h.tag,
    hidden: new Set(spec.hide ?? []),
    componentTitles: spec.sections ?? [],
    positioned: classes.some((c) => POSITIONED.has(splitClass(c)[1])),
    items: !!spec.items && !!h.parent(),
    hasValue: (row) => rowHasValue(row, h, groups),
  };
}

/** The view of `handle`, or null when nothing is inspected. */
export function useElementView(handle: NodeHandle | null): ElementView | null {
  // the whole file: a wrapper around the element changes outside its own text
  const source = useEditorState((s) => (handle?.alive ? s.files.get(handle.path) : ""));
  const groups = useEditorState((s) => s.facet(classGroupsFacet));
  // `source` invalidates the memo when the file changes
  return useMemo(() => (handle?.alive ? elementView(handle, groups) : null), [handle, source, groups]);
}
