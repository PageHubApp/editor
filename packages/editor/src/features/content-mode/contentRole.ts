/**
 * Content mode (`role: "client"`) in the shell: structure slots are hidden and the inspector is
 * the client's. The authority is the engine's gate — commands report `can() === false` — so this
 * only removes UI that could never do anything.
 */
import type { Store } from "@pagehub/engine";
import { resolveComponents, type ComponentsMap } from "../../components";
import { DEFAULT_COMPONENTS } from "../../shell/defaults";
import { ContentInspector } from "./ContentInspector";

const isClientRole = (editor: Store): boolean => (editor as { role?: string }).role === "client";

/** Slots a client never sees (add panel, layers, code view). */
const CLIENT_HIDDEN: Partial<ComponentsMap> = { AddPanel: null, LayersPanel: null, CodeView: null };

/** The slot map: defaults (the client inspector in content mode), host overrides, then the hidden slots. */
export function roleComponents(editor: Store, overrides?: Partial<ComponentsMap>): ComponentsMap {
  if (!isClientRole(editor)) return resolveComponents(DEFAULT_COMPONENTS, overrides);
  return resolveComponents({ ...DEFAULT_COMPONENTS, Inspector: ContentInspector }, { ...overrides, ...CLIENT_HIDDEN });
}
