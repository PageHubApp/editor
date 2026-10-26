import type { NodeHandle } from "@pagehub/engine";
import { iconFilterOf, isIconImage, type IconFilterRef } from "@pagehub/engine/kits";

/** The `{{ 'set/Name' | icon }}` output of a converted icon (`<span>` form, engine `html.icon`), or null for any other node. */
export function filterIconOf(handle: NodeHandle): IconFilterRef | null {
  try {
    return handle.alive && handle.kind === "element" ? iconFilterOf(handle.node()) : null;
  } catch {
    return null;
  }
}

/** True for an icon in its image form (`<span><img class="size-full object-contain"></span>`). */
export function isImageIcon(handle: NodeHandle): boolean {
  try {
    return handle.alive && handle.kind === "element" && isIconImage(handle.node());
  } catch {
    return false;
  }
}

/**
 * Attributes read off a node (`handle.attr` returns the source text as written, already escaped) written back as
 * `name="value"` pairs. Never re-escaped: escaping source text turns `[&>svg]:w-full` into `[&amp;&gt;svg]:…`.
 */
export function rawAttrs(carry: Record<string, string | null | undefined>): string {
  return Object.entries(carry)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
}

/** The converter's filter form of an icon, carrying the span's own class / id / name (the inverse of `iconImageSource`). */
export function iconFilterSource(carry: Record<string, string | null | undefined>, ref: string): string {
  const cls = [...new Set([...(carry.class ?? "").split(/\s+/), "[&>svg]:w-full", "[&>svg]:h-full"].filter(Boolean))].join(" ");
  return `<span ${rawAttrs({ ...carry, class: cls })} aria-hidden="true">{{ ${JSON.stringify(ref)} | icon }}</span>`;
}
