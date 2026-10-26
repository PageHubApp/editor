/**
 * What a host plugs into the Add panel. The editor is URL-free by default; a host that wants the
 * panel's state in the address bar (so a link opens it, and Back closes or steps back) provides
 * `addPanelUrlFacet.of(locationBinding({ prefix }))` — or its own router binding. The AI button
 * on the tab strip's right is the host's too (`addPanelAiFacet`).
 */
import type { ComponentType } from "react";
import { defineFacet } from "@pagehub/engine";
import type { AddPanelState, AddTab } from "./addPanelState";

export interface AddPanelUrlBinding {
  /** The panel the URL stands for (open, with its tab / category / sub / style / query); null = no panel in the URL. */
  read(): Partial<AddPanelState> | null;
  /** Mirror the state. `push` for open / close / navigation (Back steps back), `replace` for search edits. */
  write(state: AddPanelState, history: "push" | "replace"): void;
  /** The URL changed behind the editor's back (Back / Forward): call `onChange`; returns the unsubscribe. */
  subscribe?(onChange: () => void): () => void;
}

export const addPanelUrlFacet = defineFacet<AddPanelUrlBinding, AddPanelUrlBinding | null>({ id: "addPanelUrl", combine: (values) => values.at(-1) ?? null });

/** The host's AI button, shown right of the Components / Blocks tabs. */
export const addPanelAiFacet = defineFacet<ComponentType, ComponentType | null>({ id: "addPanelAi", combine: (values) => values.at(-1) ?? null });

const TABS: readonly AddTab[] = ["components", "blocks"];

/**
 * Query parameters on `window.location`: `<prefix>panel` (the open tab), `cat`, `sub`, `sty`, `q`
 * — only those that are set; a closed panel has none.
 */
export function locationBinding({ prefix = "", win = window }: { prefix?: string; win?: Window } = {}): AddPanelUrlBinding {
  const key = (name: string) => `${prefix}${name}`;
  return {
    read() {
      const params = new URL(win.location.href).searchParams;
      const tab = params.get(key("panel"));
      if (!TABS.includes(tab as AddTab)) return null;
      return { open: true, tab: tab as AddTab, category: params.get(key("cat")), sub: params.get(key("sub")), style: params.get(key("sty")), query: params.get(key("q")) ?? "" };
    },
    write(state, history) {
      const url = new URL(win.location.href);
      const set = (name: string, value: string | null | false) => (value ? url.searchParams.set(key(name), value) : url.searchParams.delete(key(name)));
      set("panel", state.open && state.tab);
      set("cat", state.open && state.category);
      set("sub", state.open && state.sub);
      set("sty", state.open && state.style);
      set("q", state.open && state.query);
      win.history[history === "push" ? "pushState" : "replaceState"](win.history.state, "", url);
    },
    subscribe(onChange) {
      win.addEventListener("popstate", onChange);
      return () => win.removeEventListener("popstate", onChange);
    },
  };
}
