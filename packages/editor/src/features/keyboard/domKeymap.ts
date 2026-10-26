/**
 * The DOM end of the keymap: ONE `keydown` listener hands every key to the
 * engine's `runKey`. The engine decides — highest precedence first, the first binding whose
 * `when` passes and whose command can run — and prevents the event's default and stops its
 * propagation only when a command ran. A key nothing can handle is left alone, so the browser's
 * own ⌘C, ⌘V, zoom and text editing keep working.
 *
 * By default the listener is on `window`. With a `scope` element (what `<Editor>` passes: its own
 * root plus the overlays portalled into it) it hears only keys that start inside the scope, and
 * keys with no focus (`body`) only while it is the editor the user last pointed at or focused, so
 * two editors on one page never both react.
 *
 * The listener supplies the `when` context the DOM knows: `textEditing` (the target is a text
 * surface), `focus`, `pointerOver` (the sidebar / top bar / canvas under the pointer, for keys
 * that only apply there). The chrome field's flags (`paletteOpen`, `mediaManagerOpen`, …) are
 * mirrored onto the editor's UI context while attached.
 */
import { useEffect } from "react";
import type { Store } from "@pagehub/engine";
import { chromeOf, chromeUi, type ChromeState } from "../../shell/chromeState";
import { detectPlatform, type Platform } from "./platform";

/** Elements that take typed text: native fields, contentEditable, ProseMirror, CodeMirror, Monaco. */
const TEXT_SURFACE = 'textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="color"]), [contenteditable=""], [contenteditable="true"], .ProseMirror, .cm-editor, .cm-content, .monaco-editor';

export function isTextSurface(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el && typeof el.closest === "function" && !!el.closest(TEXT_SURFACE);
}

const PANEL = "#toolbar, [data-ph-panel]";
const TOPBAR = "[data-slot='TopBar']";

/** Which part of the editor an element sits in. */
function regionOf(el: Element | null): "panel" | "topbar" | "canvas" | null {
  if (!el?.closest) return null;
  if (el.closest(TOPBAR)) return "topbar";
  if (el.closest(PANEL)) return "panel";
  if (el.closest("[data-slot='Canvas']")) return "canvas";
  return null;
}

interface KeymapOptions {
  platform?: Platform;
  /** false while the editor is hidden: no key is handled. */
  active?: boolean;
  /** Where to listen (default `window`). */
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** Handle only keys from inside this element (see above). */
  scope?: Element;
}

/** The scoped keymap whose editor the user last pointed at or focused (receives focus-less keys). */
let lastActiveScope: Element | null = null;
/** Every attached scope; a lone editor hears focus-less keys before any pointer or focus. */
const scopes = new Set<Element>();
const FOCUSLESS = (t: EventTarget | null) => !t || t === document || t === document.body || t === document.documentElement;

/** Attach the keymap; returns the detach function. */
export function attachKeymap(editor: Store, opts: KeymapOptions = {}): () => void {
  const scope = opts.scope;
  const target = scope ?? opts.target ?? window;
  const platform = opts.platform ?? detectPlatform();
  let pointerOver: ReturnType<typeof regionOf> = null;
  const onOver = (e: Event) => void (pointerOver = regionOf(e.target as Element | null));
  const onKey = (e: KeyboardEvent) => {
    if (opts.active === false || e.defaultPrevented || e.isComposing) return;
    const focus = isTextSurface(e.target) ? "input" : regionOf(e.target as Element | null) === "panel" ? "panel" : "canvas";
    editor.press(e, { platform, ui: { textEditing: isTextSurface(e.target), focus, pointerOver } });
  };
  // the chrome field's flags ride on the host's UI context, so commands run from the palette see them too
  const syncUi = (c: ChromeState) => void (editor.ui = { ...editor.ui, ...chromeUi(c) });
  syncUi(chromeOf(editor.state));
  const unsubscribe = editor.subscribe((s) => chromeOf(s), syncUi);
  const onWindowKey = (e: KeyboardEvent) => void (FOCUSLESS(e.target) && (lastActiveScope === scope || (lastActiveScope === null && scopes.size === 1)) && onKey(e));
  const markActive = () => void (lastActiveScope = scope ?? null);
  target.addEventListener("keydown", onKey as EventListener);
  target.addEventListener("pointerover", onOver);
  if (scope) {
    scopes.add(scope);
    window.addEventListener("keydown", onWindowKey as EventListener);
    scope.addEventListener("pointerdown", markActive, true);
    scope.addEventListener("focusin", markActive);
  }
  return () => {
    unsubscribe();
    if (scope) {
      scopes.delete(scope);
      window.removeEventListener("keydown", onWindowKey as EventListener);
      scope.removeEventListener("pointerdown", markActive, true);
      scope.removeEventListener("focusin", markActive);
      if (lastActiveScope === scope) lastActiveScope = null;
    }
    target.removeEventListener("keydown", onKey as EventListener);
    target.removeEventListener("pointerover", onOver);
  };
}

/** Attach the keymap for the lifetime of the component. */
export function useKeymap(editor: Store, opts: Omit<KeymapOptions, "target" | "scope"> & { scope?: Element | null } = {}): void {
  const { platform, active, scope } = opts;
  // scope === null: the scope element isn't mounted yet, so nothing is attached (never the global fallback)
  useEffect(() => (scope === null ? undefined : attachKeymap(editor, { platform, active, scope })), [editor, platform, active, scope]);
}
