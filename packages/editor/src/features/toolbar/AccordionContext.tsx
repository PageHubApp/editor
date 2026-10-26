/**
 * Open / closed state of the inspector's accordions, keyed by section title and shared by every
 * element type; persisted as `accordion-state`. A section with no stored state is open when it
 * says so (`defaultOpen`), else only "Content" is.
 *
 *   <AccordionProvider forceOpen={!!searchQuery}>…<ToolbarSection title="Size">…</ToolbarSection></AccordionProvider>
 *
 * - `toggleAll` (the collapse-all button): if any top-level section is open, close them all,
 *   else open them all. Nested sections are not affected.
 * - `openOnly(titles)` (a tab click): open those, close every other registered section.
 * - `forceOpen` (an active search): every section shows open without touching the stored state,
 *   so the next toggle after search does not persist the forced-open state.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { readJSON, writeJSON } from "../../primitives/storage";

const DEFAULT_OPEN_SECTION = "Content";
const KEY = "accordion-state";

interface AccordionApi {
  isOpen(title: string, defaultOpen?: boolean): boolean;
  toggle(title: string, defaultOpen?: boolean): void;
  setOpen(title: string, open: boolean): void;
  toggleAll(): void;
  openOnly(titles: readonly string[]): void;
  /** `primary` = top level (affected by toggleAll). */
  register(title: string, defaultOpen: boolean | undefined, primary: boolean): void;
  unregister(title: string): void;
  /** Any top-level section open (the collapse-all icon). */
  anyOpen: boolean;
}

const Ctx = createContext<AccordionApi | null>(null);
export const useAccordion = () => useContext(Ctx);

export function AccordionProvider({ forceOpen = false, children }: { forceOpen?: boolean; children?: ReactNode }) {
  const [stored, setStored] = useState<Record<string, boolean>>(() => readJSON(KEY, {}));
  const sections = useRef(new Map<string, { defaultOpen?: boolean; primary: boolean }>());
  // bumped when the registered set changes, so `anyOpen` is never computed before registration
  const [version, setVersion] = useState(0);
  const register = useCallback((title: string, defaultOpen: boolean | undefined, primary: boolean) => {
    const prev = sections.current.get(title);
    if (prev && prev.defaultOpen === defaultOpen && prev.primary === primary) return;
    sections.current.set(title, { defaultOpen, primary });
    setVersion((v) => v + 1);
  }, []);
  const unregister = useCallback((title: string) => {
    if (sections.current.delete(title)) setVersion((v) => v + 1);
  }, []);

  const fallback = useCallback((title: string, hint?: boolean) => hint ?? sections.current.get(title)?.defaultOpen ?? title === DEFAULT_OPEN_SECTION, []);
  const update = useCallback((fn: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    setStored((prev) => {
      const next = fn(prev);
      if (next !== prev) writeJSON(KEY, next);
      return next;
    });
  }, []);

  const api = useMemo<AccordionApi>(() => {
    const openIn = (s: Record<string, boolean>, title: string, hint?: boolean) => (title in s ? s[title]! : fallback(title, hint));
    let anyOpen = false;
    for (const [title, meta] of sections.current) if (meta.primary && openIn(stored, title)) anyOpen = true;
    if (!sections.current.size) anyOpen = Object.values(stored).some(Boolean) || !(DEFAULT_OPEN_SECTION in stored);
    return {
      isOpen: (title, hint) => forceOpen || openIn(stored, title, hint),
      toggle: (title, hint) => update((p) => ({ ...p, [title]: !openIn(p, title, hint) })),
      setOpen: (title, open) => update((p) => (p[title] === open ? p : { ...p, [title]: open })),
      toggleAll: () =>
        update((p) => {
          const primary = [...sections.current].filter(([, m]) => m.primary).map(([t]) => t);
          const open = !primary.some((t) => openIn(p, t));
          return { ...p, ...Object.fromEntries(primary.map((t) => [t, open])) };
        }),
      openOnly: (titles) => update(() => Object.fromEntries([...sections.current.keys()].map((t) => [t, titles.includes(t)]))),
      register,
      unregister,
      anyOpen,
    };
  }, [stored, forceOpen, fallback, update, register, unregister, version]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
