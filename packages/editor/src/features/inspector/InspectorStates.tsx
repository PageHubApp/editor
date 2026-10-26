/**
 * The inspector's non-tab states, wired to commands:
 *
 * - `EmptyInspector` — nothing selected. Page mode offers Add Blocks (`insert.open` blocks),
 *   Add Components (`insert.open` components), Reusable components (`component.new`) and the
 *   host's AI card; the component editor (the board open, or a partial being edited) offers "New reusable component" while the site has no
 *   partials, else "Select something to edit". "close sidebar" runs `sidebar.close`. Options
 *   come from `inspectorConfig`.
 * - `LinkedInstance` — an element inside a partial (`partials/*`, `sections/*`) outside the
 *   component editor: "Linked instance of <name>" with Edit Linked Instance (opens the
 *   partial isolated on the component board, `component.edit`; without the board kit, in
 *   place), Style Only Mode, Content Only
 *   Mode and Unlink Component. Unlink runs `component.unlink` on the canvas page's
 *   `{% render %}` tag for the partial. `component.styleOnly` / `component.contentOnly` are not
 *   defined (an instance is a tag with no markup of its own — see componentCommands.ts), so
 *   those rows stay disabled unless a host contributes them.
 */
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { InspectorEmptyState, LinkedInstanceBar, type LinkedAction } from "./InspectorChrome";
import { inspectorConfigFacet } from "./inspectorState";
import { useInspectorActions, useInspectorUi } from "./useInspectorSession";
import { includeTagFor } from "@pagehub/engine/canvas";
import { boardOf } from "../board/boardState";
import { canvasPage } from "../canvas/canvasState";

const PARTIAL = /^(?:partials|sections)\/(.+)\.liquid$/;

/** The partial name when `h` lives in one that isn't open in the component editor. */
export function linkedPartial(h: NodeHandle, componentEditor: string | null): string | null {
  const m = PARTIAL.exec(h.path);
  return m && componentEditor !== h.path ? m[1]! : null;
}

export function EmptyInspector() {
  const store = useEditorStore();
  const config = useEditorState((s) => s.facet(inspectorConfigFacet));
  const editing = useInspectorUi((i) => i.componentEditor);
  const board = useEditorState((s) => boardOf(s).open);
  const hasComponents = useEditorState((s) => [...s.files.keys()].some((p) => PARTIAL.test(p)));
  return (
    <InspectorEmptyState
      mode={editing || board ? "canvas" : "page"}
      blocks={config.blocks ?? true}
      reusable={config.reusable ?? true}
      hasComponents={hasComponents}
      aiCard={config.aiCard}
      closable={!!config.closable}
      onAddBlocks={() => store.run("insert.open", { tab: "blocks" })}
      onAddComponents={() => store.run("insert.open", { tab: "components" })}
      onNewReusable={() => store.run("component.new")}
      onClose={() => store.run("sidebar.close")}
    />
  );
}

export function LinkedInstance({ handle, name }: { handle: NodeHandle; name: string }) {
  const store = useEditorStore();
  const { set } = useInspectorActions();
  const tag = useEditorState((s) => {
    const page = canvasPage(s);
    return page ? includeTagFor({ state: s, registry: store.registry }, page, handle.path) : null;
  });
  const can = useEditorState(() => ({
    style: store.can("component.styleOnly", { at: handle }),
    content: store.can("component.contentOnly", { at: handle }),
    unlink: !!tag && store.can("component.unlink", { at: tag }),
  }), (a, b) => a.style === b.style && a.content === b.content && a.unlink === b.unlink);
  const actions: LinkedAction[] = [
    { id: "edit", title: "Edit Linked Instance", description: "Change the main component", icon: "box-model", variant: "primary", run: () => void (store.run("component.edit", { path: handle.path }) || set({ componentEditor: handle.path })) },
    { id: "style", title: "Style Only Mode", description: "Keep the content linked; style this instance", icon: "brush", disabled: !can.style, run: () => store.run("component.styleOnly", { at: handle }) },
    { id: "content", title: "Content Only Mode", description: "Keep the style linked; edit this instance's content", icon: "forms", disabled: !can.content, run: () => store.run("component.contentOnly", { at: handle }) },
    { id: "unlink", title: "Unlink Component", description: "Turn this instance into regular elements", icon: "unlink", variant: "destructive", disabled: !can.unlink, run: () => tag && store.run("component.unlink", { at: tag }) },
  ];
  return <LinkedInstanceBar name={name} actions={actions} />;
}
