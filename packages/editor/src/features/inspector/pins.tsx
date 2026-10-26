/**
 * Pinned inspector sections: up to 10 section ids, persisted in `inspector-pinned-sections`,
 * shared by every element type. A pinned section's body lives in the Pinned dock.
 *
 *   <PinsProvider>…<SectionPinButton sectionId="size" hidden={searching} />…</PinsProvider>
 *
 * Not pinnable: component, modifiers, advanced-settings, import-export, ai-context, permissions
 * (and the element's own component-tab sections).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { MAX_PINS, UNPINNABLE } from "./rows/inspectorRows";
import { Icon } from "../../primitives/icons";
import { readJSON, writeJSON } from "../../primitives/storage";
import { tooltip } from "../../primitives/tooltip";
import { InspectorIcon } from "./inspectorIcons";

const KEY = "inspector-pinned-sections";

interface PinsApi {
  pins: readonly string[];
  isPinned(id: string): boolean;
  togglePin(id: string): void;
}

const canPin = (id: string): boolean => !UNPINNABLE.has(id) && !id.startsWith("component:");

const Ctx = createContext<PinsApi | null>(null);

export function PinsProvider({ children }: { children?: ReactNode }) {
  const [pins, setPins] = useState<readonly string[]>(() => readJSON<string[]>(KEY, []).filter(canPin));
  const togglePin = useCallback((id: string) => {
    if (!canPin(id)) return;
    setPins((cur) => {
      const next = cur.includes(id) ? cur.filter((p) => p !== id) : cur.length >= MAX_PINS ? cur : [...cur, id];
      if (next !== cur) writeJSON(KEY, next);
      return next;
    });
  }, []);
  const api = useMemo<PinsApi>(() => ({ pins, isPinned: (id) => pins.includes(id), togglePin }), [pins, togglePin]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePins(): PinsApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("usePins() must be used inside <PinsProvider>");
  return api;
}

/** Header pin toggle: visible on hover or focus; hidden while searching and on unpinnable sections. */
export function SectionPinButton({ sectionId, hidden = false }: { sectionId: string; hidden?: boolean }) {
  const { isPinned, togglePin } = usePins();
  if (hidden || !canPin(sectionId)) return null;
  const pinned = isPinned(sectionId);
  const label = pinned ? "Unpin from sidebar" : "Pin to sidebar";
  return (
    <button
      type="button"
      data-pin={sectionId}
      className="text-sidebar-foreground/70 hover:text-sidebar-foreground inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded p-0 leading-none opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        togglePin(sectionId);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={label}
      aria-pressed={pinned}
      {...tooltip(label, "left")}
      data-tooltip-offset={8}
    >
      {pinned ? <InspectorIcon name="pinned" className="size-3" /> : <Icon name="pin" className="size-3" />}
    </button>
  );
}
