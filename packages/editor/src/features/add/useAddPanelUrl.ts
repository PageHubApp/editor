/**
 * Mirror the Add panel's state to the host's URL binding (`addPanelUrlFacet`), if it gave one:
 * the URL opens the panel on mount, state changes write back (a search edit replaces the
 * history entry, anything else pushes), and a URL change from outside (Back) is applied.
 * Without a binding this does nothing — the editor stays URL-free.
 */
import { useEffect, useRef } from "react";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { addPanelUrlFacet } from "./addPanelHost";
import { addPanelOf, type AddPanelState } from "./addPanelState";

const keyOf = (p: AddPanelState) => JSON.stringify([p.open, p.open && p.tab, p.open && p.category, p.open && p.sub, p.open && p.style, p.open && p.query]);
const withoutQuery = (p: AddPanelState) => JSON.stringify([p.open, p.tab, p.category, p.sub, p.style]);

export function useAddPanelUrl(): void {
  const store = useEditorStore();
  const run = useRunCommand();
  const binding = useEditorState((s) => s.facet(addPanelUrlFacet));
  const panel = useEditorState(addPanelOf);
  const seen = useRef<{ key: string; panel: AddPanelState } | null>(null);

  useEffect(() => {
    if (!binding) return;
    const remember = () => {
      const p = addPanelOf(store.state);
      seen.current = { key: keyOf(p), panel: p };
    };
    const apply = () => {
      const url = binding.read();
      if (url) run("insert.open", url);
      else run("insert.close");
      remember();
    };
    remember();
    if (binding.read()) apply();
    return binding.subscribe?.(apply);
  }, [binding, store, run]);

  useEffect(() => {
    if (!binding || !seen.current) return;
    const key = keyOf(panel);
    if (key === seen.current.key) return;
    const prev = seen.current.panel;
    seen.current = { key, panel };
    binding.write(panel, prev.open && panel.open && withoutQuery(prev) === withoutQuery(panel) ? "replace" : "push");
  }, [binding, panel]);
}
