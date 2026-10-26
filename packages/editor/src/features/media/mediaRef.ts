/**
 * An image `src` in the converter's forms, read as a media reference:
 *
 *   {{ '08d10d2c-…' | image_url }}            library file   → { kind: "media", id }
 *   {{ item.image | image_url: width: 800 }}  bound value    → { kind: "bound", path: "item.image" }
 *   https://… / /path                          plain URL      → { kind: "url" }
 *   anything else with Liquid                  expression     → { kind: "expression" }
 *
 * The filter arguments (`: width: 800`) are kept, so a rewrite keeps the size the converter chose.
 *
 *   mediaSrc("abc", ": width: 800") // "{{ 'abc' | image_url: width: 800 }}"
 */
export type MediaRef =
  | { kind: "empty" }
  | { kind: "media"; id: string; args: string }
  | { kind: "bound"; path: string; args: string }
  | { kind: "url"; url: string }
  | { kind: "expression"; raw: string };

const MEDIA = /^\{\{\s*'([^']+)'\s*\|\s*image_url(\s*:[^}]*?)?\s*\}\}$/;
const BOUND = /^\{\{\s*([A-Za-z_][\w.-]*)\s*\|\s*image_url(\s*:[^}]*?)?\s*\}\}$/;
const BARE = /^\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}$/;

export function parseMediaSrc(src: string): MediaRef {
  const s = src.trim();
  if (!s) return { kind: "empty" };
  let m = MEDIA.exec(s);
  if (m) return { kind: "media", id: m[1]!, args: (m[2] ?? "").trim() };
  m = BOUND.exec(s) ?? BARE.exec(s);
  if (m) return { kind: "bound", path: m[1]!, args: (m[2] ?? "").trim() };
  if (s.includes("{{") || s.includes("{%")) return { kind: "expression", raw: s };
  return { kind: "url", url: s };
}

/** A library file as the converter writes it. */
export const mediaSrc = (id: string, args = ""): string => `{{ '${id.replace(/'/g, "")}' | image_url${args ? (args.startsWith(":") ? args : `: ${args}`) : ""} }}`;

/** A bound value (`item.image`) as the converter writes it. */
export const boundSrc = (path: string, args = ""): string => `{{ ${path} | image_url${args ? (args.startsWith(":") ? args : `: ${args}`) : ""} }}`;
