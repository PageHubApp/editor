/**
 * The Icon element's source form, the one the converter writes for a standalone icon:
 *
 *   <span class="fill-current inline-flex items-center justify-center w-6 h-6 [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbPlant2" | icon }}</span>
 *
 * A `<span>` whose only child is a `{{ '<set>/<Name>' | icon }}` output. `iconFilterOf` reads that form off a
 * tree node (the element's `match`, the inspector's picker); `withIconRef` rewrites the ref in the node's text.
 */
import { NodeTypes } from "../../parse/parse";
import type { TreeNode } from "../../parse/tree";

export interface IconFilterRef {
  /** The `<set>/<Name>` ref, unquoted. */
  ref: string;
  /** Source range of the quoted string literal (quotes included). */
  start: number;
  end: number;
}

/** The icon ref of a `<span>{{ 'set/Name' | icon }}</span>`, or null for any other node. */
export function iconFilterOf(n: TreeNode): IconFilterRef | null {
  if (n.kind !== "element" || n.tag !== "span" || n.children.length !== 1) return null;
  const out = n.children[0]!;
  if (out.kind !== "content" || out.type !== NodeTypes.LiquidVariableOutput) return null;
  const markup = (out.node as { markup?: unknown }).markup;
  if (!markup || typeof markup === "string") return null;
  const { expression, filters } = markup as { expression: { type: string; value?: string; position: { start: number; end: number } }; filters: { name: string }[] };
  if (expression.type !== NodeTypes.String || filters[0]?.name !== "icon" || !expression.value) return null;
  return { ref: expression.value, start: expression.position.start, end: expression.position.end };
}

/**
 * The image form of an icon (`ref-image` in the converter, the Image button in the editor): a `<span>` holding only a
 * full-size `<img class="size-full object-contain">`. Still an Icon, so the picker can swap back to a filter icon.
 */
export function isIconImage(n: TreeNode): boolean {
  if (n.kind !== "element" || n.tag !== "span" || n.children.length !== 1) return false;
  const img = n.children[0]!;
  if (img.kind !== "element" || img.tag !== "img") return false;
  const open = (img.node as { source: string }).source.slice(img.openTag.start, img.openTag.end);
  const tokens = (/\bclass\s*=\s*["']([^"']*)["']/.exec(open)?.[1] ?? "").split(/\s+/);
  return tokens.includes("size-full") && tokens.includes("object-contain");
}

/** `text` (the element's source, starting at `from`) with the icon's string literal swapped for `ref`, keeping its quote style and every filter argument. */
export function withIconRef(text: string, from: number, icon: IconFilterRef, ref: string): string {
  const raw = text.slice(icon.start - from, icon.end - from);
  const quote = raw[0] === "'" ? "'" : '"';
  return text.slice(0, icon.start - from) + quote + ref + quote + text.slice(icon.end - from);
}
