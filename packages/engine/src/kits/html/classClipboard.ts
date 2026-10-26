/**
 * "Copy classes" / "Paste classes": the selected element's `class` attribute, copied as text and
 * pasted onto another element, replacing its classes (one attribute write = one undo step).
 * The clipboard is its own slot, separate from the node clipboard, and survives a reload
 * (`localStorage["ph-canvas-class-clipboard"]`, as today's editor kept it). The context menu
 * rows sit between Copy and Paste, and after Paste (`2_clipboard@1.5` / `@2.5`).
 */
import { contributes } from "../../commands/contributes";
import { defineCommand } from "../../commands/defineCommand";
import { defineFacet } from "../../extensions/extension";
import { copyable, removable } from "./access";
import { edit, primary } from "./commandEdit";

export const CLASS_CLIPBOARD_KEY = "ph-canvas-class-clipboard";

export interface ClassClipboard {
  read(): string | null;
  write(classes: string): void;
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** A class clipboard cached in memory and mirrored to `storage` (default `localStorage`, when the host has one). */
export function storedClassClipboard(storage?: KeyValueStorage): ClassClipboard {
  const store = (): KeyValueStorage | null => {
    try {
      return storage ?? (globalThis as { localStorage?: KeyValueStorage }).localStorage ?? null;
    } catch {
      return null; // storage blocked
    }
  };
  let cached: string | null = null;
  return {
    read() {
      try {
        const raw = store()?.getItem(CLASS_CLIPBOARD_KEY);
        const stored = raw ? (JSON.parse(raw) as { className?: unknown }).className : null;
        return typeof stored === "string" ? stored : cached;
      } catch {
        return cached;
      }
    },
    write(classes) {
      cached = classes;
      try {
        store()?.setItem(CLASS_CLIPBOARD_KEY, JSON.stringify({ className: classes }));
      } catch {
        /* quota / blocked: the in-memory copy still works */
      }
    },
  };
}

/** The default class clipboard, shared by every editor in the process. */
export const sharedClassClipboard = storedClassClipboard();

export const classClipboardFacet = defineFacet<ClassClipboard, ClassClipboard>({ id: "classClipboard", combine: (values) => values[0] ?? sharedClassClipboard });

const classesOf = (value: string | null | undefined): string => (value ?? "").trim();

export const copyClasses = defineCommand({
  id: "classes.copy",
  title: "Copy classes",
  run(ctx) {
    const h = copyable(ctx);
    if (!h || h.kind !== "element") return false;
    const classes = classesOf(h.attr("class"));
    if (!classes) return false;
    if (ctx.dispatch) ctx.state.facet(classClipboardFacet).write(classes);
    return true;
  },
});

export const pasteClasses = defineCommand({
  id: "classes.paste",
  title: "Paste classes",
  run(ctx) {
    const h = primary(ctx);
    if (ctx.ui.textEditing || !h || h.kind !== "element" || !removable(h)) return false;
    const classes = classesOf(ctx.state.facet(classClipboardFacet).read());
    if (!classes || classes.includes('"') || classes === classesOf(h.attr("class"))) return false;
    return edit(ctx, (tr) => void tr.setAttr(h, "class", classes));
  },
});

export const CLASS_CLIPBOARD = [
  copyClasses,
  pasteClasses,
  contributes({
    menus: {
      "canvas/context": [
        { command: "classes.copy", group: "2_clipboard@1.5" },
        { command: "classes.paste", group: "2_clipboard@2.5" },
      ],
    },
    palette: [
      { command: "classes.copy", group: "Edit" },
      { command: "classes.paste", group: "Edit" },
    ],
  }),
] as const;
