/**
 * Open / closed state of the inspector's accordions, keyed by section title.
 *
 *   <AccordionProvider forceOpen={!!searchQuery} resetKey={elementKey(h)}>…<ToolbarSection title="Size" filled>…</ToolbarSection></AccordionProvider>
 *
 * Two layers:
 * - A section that says whether the inspected element has values in it (`filled` true / false)
 *   follows the element: open when filled, closed when not. A toggle, a tab click or
 *   collapse-all overrides that until `resetKey` changes (another element is inspected); never
 *   persisted.
 * - Every other section (no `filled`) keeps the stored state, shared by every element and
 *   persisted as `accordion-state`. With no stored state it is open when it says so
 *   (`defaultOpen`), else only "Content" is.
 *
 * - `toggleAll` (the collapse-all button): if any top-level section is open, close them all,
 *   else open them all. Nested sections are not affected.
 * - `openOnly(titles)` (a tab click): open those, close every other registered section.
 * - `forceOpen` (an active search): every section shows open without touching either layer,
 *   so the next toggle after search does not keep the forced-open state.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { readJSON, writeJSON } from "../../primitives/storage";

const DEFAULT_OPEN_SECTION = "Content";
const KEY = "accordion-state";
const NONE: Record<string, boolean> = {};

type OpenMap = Record<string, boolean>;
interface SectionMeta {
  defaultOpen?: boolean;
  primary: boolean;
  filled?: boolean;
}

interface AccordionApi {
  isOpen(title: string, defaultOpen?: boolean, filled?: boolean): boolean;
  toggle(title: string, defaultOpen?: boolean, filled?: boolean): void;
  setOpen(title: string, open: boolean): void;
  toggleAll(): void;
  openOnly(titles: readonly string[]): void;
  /** `primary` = top level (affected by toggleAll). */
  register(title: string, defaultOpen: boolean | undefined, primary: boolean, filled?: boolean): void;
  unregister(title: string): void;
  /** Any top-level section open (the collapse-all icon). */
  anyOpen: boolean;
}

const Ctx = createContext<AccordionApi | null>(null);
export const useAccordion = () => useContext(Ctx);

export function AccordionProvider({ forceOpen = false, resetKey, children }: { forceOpen?: boolean; resetKey?: string; children?: ReactNode }) {
  const [stored, setStored] = useState<OpenMap>(() => readJSON(KEY, {}));
  // the per-element layer: overrides for `filled` sections, dropped when `resetKey` changes
  const [session, setSession] = useState<{ key?: string; open: OpenMap }>({ key: resetKey, open: NONE });
  // a new selection drops the overrides (also when it later returns to the same element)
  if (session.key !== resetKey) setSession({ key: resetKey, open: NONE });
  const picked = session.key === resetKey ? session.open : NONE;
  const sections = useRef(new Map<string, SectionMeta>());
  // bumped when the registered set changes, so `anyOpen` is never computed before registration
  const [version, setVersion] = useState(0);
  const register = useCallback((title: string, defaultOpen: boolean | undefined, primary: boolean, filled?: boolean) => {
    const prev = sections.current.get(title);
    if (prev && prev.defaultOpen === defaultOpen && prev.primary === primary && prev.filled === filled) return;
    sections.current.set(title, { defaultOpen, primary, filled });
    setVersion((v) => v + 1);
  }, []);
  const unregister = useCallback((title: string) => {
    if (sections.current.delete(title)) setVersion((v) => v + 1);
  }, []);

  const fallback = useCallback((title: string, hint?: boolean) => hint ?? sections.current.get(title)?.defaultOpen ?? title === DEFAULT_OPEN_SECTION, []);
  const updateStored = useCallback((fn: (prev: OpenMap) => OpenMap) => {
    setStored((prev) => {
      const next = fn(prev);
      if (next !== prev) writeJSON(KEY, next);
      return next;
    });
  }, []);
  const updatePicked = useCallback(
    (fn: (prev: OpenMap) => OpenMap) => setSession((s) => ({ key: resetKey, open: fn(s.key === resetKey ? s.open : NONE) })),
    [resetKey],
  );

  const api = useMemo<AccordionApi>(() => {
    const filledOf = (title: string, filled?: boolean) => filled ?? sections.current.get(title)?.filled;
    const openIn = (s: OpenMap, p: OpenMap, title: string, hint?: boolean, filled?: boolean) => {
      const f = filledOf(title, filled);
      if (f !== undefined) return title in p ? p[title]! : f;
      return title in s ? s[title]! : fallback(title, hint);
    };
    // write each title's open state to the layer that owns it
    const write = (entries: readonly (readonly [string, boolean])[]) => {
      const own = entries.filter(([t]) => filledOf(t) !== undefined);
      const shared = entries.filter(([t]) => filledOf(t) === undefined);
      if (own.length) updatePicked((p) => ({ ...p, ...Object.fromEntries(own) }));
      if (shared.length) updateStored((s) => (shared.every(([t, o]) => s[t] === o) ? s : { ...s, ...Object.fromEntries(shared) }));
    };
    let anyOpen = false;
    for (const [title, meta] of sections.current) if (meta.primary && openIn(stored, picked, title)) anyOpen = true;
    if (!sections.current.size) anyOpen = Object.values(stored).some(Boolean) || !(DEFAULT_OPEN_SECTION in stored);
    const primary = () => [...sections.current].filter(([, m]) => m.primary).map(([t]) => t);
    return {
      isOpen: (title, hint, filled) => forceOpen || openIn(stored, picked, title, hint, filled),
      toggle: (title, hint, filled) => {
        if (filledOf(title, filled) !== undefined) updatePicked((p) => ({ ...p, [title]: !openIn(NONE, p, title, hint, filled) }));
        else updateStored((s) => ({ ...s, [title]: !openIn(s, NONE, title, hint) }));
      },
      setOpen: (title, open) => write([[title, open]]),
      toggleAll: () => {
        const titles = primary();
        const open = !titles.some((t) => openIn(stored, picked, t));
        write(titles.map((t) => [t, open] as const));
      },
      openOnly: (titles) => write([...sections.current.keys()].map((t) => [t, titles.includes(t)] as const)),
      register,
      unregister,
      anyOpen,
    };
  }, [stored, picked, forceOpen, fallback, updateStored, updatePicked, register, unregister, version]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
