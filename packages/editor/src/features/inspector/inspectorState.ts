/**
 * The inspector's session state and host configuration.
 *
 * `inspectorField` (effect-only, never an undo step): the applied search query, rows added this
 * session per element (`added`), the row whose popover is requested open, and the partial being
 * edited in the component editor. Written with `inspector.set`. The search popup itself is the
 * chrome's `sidebarSearch` (`sidebar.search`, ⌘F over the sidebar).
 *
 * `inspectorConfig({...})` is what a host contributes: which tabs a type shows
 * (`inspectorTabs`, keyed by inspector kind), and the empty state's options.
 *
 *   createEditor({ extensions: [htmlKit(), tailwindKit(), editorKit(), inspectorConfig({ inspectorTabs: { text: ["component", "design"] } })] })
 */
import { defineCommand, defineFacet, StateEffect, StateField, effectsOf, type Extension, type NodeHandle } from "@pagehub/engine";
import type { ReactNode } from "react";
import { classAdd, classMove, classRemoveLinked } from "../../state/classLayers";
import { REPEAT_FOR_EACH_KIT } from "../menus/repeatForEach";

export interface InspectorUi {
  /** Applied search (kept when the popup closes). */
  query: string;
  /** Element key → row ids added this session, in click order. */
  added: Readonly<Record<string, readonly string[]>>;
  /** `elementKey:rowId` whose popover is requested open (auto-open after "+", header click). */
  openRow: string | null;
  /** The partial open in the component editor (its nodes are not "linked instances" there). */
  componentEditor: string | null;
}

const DEFAULT_INSPECTOR: InspectorUi = { query: "", added: {}, openRow: null, componentEditor: null };

export const setInspector = StateEffect.define<Partial<InspectorUi>>("inspector.set");

export const inspectorField = StateField.define<InspectorUi>({
  name: "inspector",
  create: () => DEFAULT_INSPECTOR,
  update(value, tr) {
    const patches = effectsOf(tr, setInspector);
    return patches.length ? patches.reduce<InspectorUi>((v, p) => ({ ...v, ...p }), value) : value;
  },
});

const inspectorSet = defineCommand<Partial<InspectorUi>>({
  id: "inspector.set",
  title: "Set inspector state",
  run(ctx, args) {
    if (!ctx.state.hasField(inspectorField) || !args) return false;
    ctx.dispatch?.(ctx.tr.effect(setInspector, args));
    return true;
  },
});

/** Host options. Later contributions override earlier ones key by key. */
interface InspectorConfig {
  /** Component type → the tab ids it shows (`features.inspectorTabs`). */
  inspectorTabs?: Readonly<Record<string, readonly string[]>>;
  /**
   * Section ids the inspector may show (`typography`, `background`, …; the Component tab's own sections always show).
   * A tab left with no section disappears. Absent: every section. The email profile keeps what inboxes support.
   */
  sections?: readonly string[];
  /** Empty state: "Add Blocks" (default true). */
  blocks?: boolean;
  /** Empty state: "Reusable components" (default true). */
  reusable?: boolean;
  /** Empty state: the AI card (shown when given). */
  aiCard?: ReactNode;
  /** Empty state: the "close sidebar" link. */
  closable?: boolean;
}

export const inspectorConfigFacet = defineFacet<InspectorConfig, InspectorConfig>({
  id: "inspectorConfig",
  combine: (values) => Object.assign({}, ...values),
});

export const inspectorConfig = (c: InspectorConfig): Extension => inspectorConfigFacet.of(c);

const KIT: Extension = [inspectorField, inspectorSet, REPEAT_FOR_EACH_KIT, classRemoveLinked, classMove, classAdd];

/** The inspector's state field and `inspector.set`, the class chips' `classes.move` / `classes.removeLinked`, and the "Repeat for each…" context-menu command. */
export function inspectorKit(): Extension {
  return KIT;
}

const keys = new WeakMap<object, string>();
let next = 0;

/** A stable key for an element handle within this session. */
export function elementKey(h: NodeHandle): string {
  let k = keys.get(h);
  if (k === undefined) keys.set(h, (k = `e${++next}`));
  return k;
}
