/**
 * Size and font family of the selected text, written as classes on ONE inline `<span>` (the
 * `inlineEl` mark): `<span class="text-xl font-['Open_Sans']">`. A preset replaces both; an
 * empty class list removes the span.
 */
import type { Editor as TipTap } from "@tiptap/core";
import { classOfSrc } from "./schema";

export const SIZE_CLASS = /^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/;
export const FAMILY_CLASS = /^font-\['[^']+'\]$/;

export const familyClass = (family: string): string => `font-['${family.replace(/ /g, "_")}']`;
export const familyOf = (classes: readonly string[]): string | null => {
  const c = classes.find((x) => FAMILY_CLASS.test(x));
  return c ? c.slice(7, -2).replace(/_/g, " ") : null;
};

export const inlineClasses = (ed: TipTap): string[] => (classOfSrc(ed.getAttributes("inlineEl").src as string | undefined)?.split(/\s+/).filter(Boolean) ?? []);

/** Write `classes` on the selection. `silent` is a preview: the document changes, but nothing is committed to source. */
export function setInlineClasses(ed: TipTap, classes: readonly string[], silent = false): void {
  const chain = silent ? ed.chain().setMeta("preventUpdate", true) : ed.chain().focus();
  if (!classes.length) chain.unsetMark("inlineEl").run();
  else chain.setMark("inlineEl", { tag: "span", src: `<span class="${classes.join(" ")}">` }).run();
}
