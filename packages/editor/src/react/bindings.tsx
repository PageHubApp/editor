/**
 * React bindings to the core. Every connector reads through `useEditorState(select, equals?)`
 * — a `useSyncExternalStore` over `store.subscribe(select, …, equals)`, so a component
 * re-renders only when *its* slice changes — and acts only through `useRunCommand()`.
 */
import { createContext, useCallback, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Command, EditorState, NodeHandle, Store } from "@pagehub/engine";

const StoreContext = createContext<Store | null>(null);

export function EditorStoreProvider({ store, children }: { store: Store; children?: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The core instance `<Editor>` was given. Throws outside `<Editor>`. */
export function useEditorStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useEditorStore() must be used inside <Editor> (or <EditorStoreProvider>)");
  return store;
}

type Eq<T> = (a: T, b: T) => boolean;

/** A slice of the editor state; re-renders only when `equals(previous, next)` is false. */
export function useEditorState<T>(select: (s: EditorState) => T, equals: Eq<T> = Object.is): T {
  const store = useEditorStore();
  const latest = useRef({ select, equals });
  latest.current = { select, equals };
  const cache = useRef<{ state: EditorState; select: (s: EditorState) => T; value: T } | null>(null);

  const subscribe = useCallback(
    (notify: () => void) => store.subscribe((s) => latest.current.select(s), notify, (a, b) => latest.current.equals(a, b)),
    [store],
  );
  const getSnapshot = (): T => {
    const c = cache.current;
    if (c && c.state === store.state && c.select === select) return c.value;
    const value = select(store.state);
    if (c && equals(c.value, value)) {
      cache.current = { state: store.state, select, value: c.value };
      return c.value;
    }
    cache.current = { state: store.state, select, value };
    return value;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** `run(command | id, args)` → whether it applied. The only way a control changes anything. */
export function useRunCommand(): <A>(cmd: Command<A> | string, args?: A) => boolean {
  const store = useEditorStore();
  return useCallback(<A,>(cmd: Command<A> | string, args?: A) => store.run(cmd, args), [store]);
}

/** The element the controls read and write: the primary selection. */
export function useInspectedHandle(): NodeHandle | null {
  return useEditorState((s) => s.selection.primary);
}

/** The inspected element's `class` attribute (one string, so equality is cheap). */
export function useInspectedClass(): { handle: NodeHandle | null; classes: readonly string[] } {
  const handle = useInspectedHandle();
  const cls = useEditorState(() => (handle?.alive ? (handle.attr("class") ?? "") : ""));
  return { handle, classes: cls.split(/\s+/).filter(Boolean) };
}
