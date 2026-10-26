/**
 * The state keys a site already uses — every key its `data-state-*` attributes write or read —
 * for the key fields' completions (conditions, state bindings, modifiers).
 *
 *   const keys = useStateKeys(); // ["cart:open", "cart:count", "url:q", "store:filter", …]
 */
import { useMemo } from "react";
import { useEditorState } from "../../../react/bindings";

const ATTR = /data-(?:state-(set|toggle|clear|step|bind|show|text|class|in-view)|compute-key)="([^"]*)"/g;

/** The runtime's `splitKey`: `"store:filter:all"` → `"store:filter"`; a `local:` / `url:` / `ls:` prefix is never the split. */
export function keyOf(s: string): string {
  const p = /^(?:local:|url:|ls:)/.exec(s)?.[0] ?? "";
  const i = s.lastIndexOf(":");
  return i < p.length ? s.trim() : s.slice(0, i).trim();
}

/** Keys out of one attribute value, by the attribute's grammar. */
function keysIn(kind: string | undefined, value: string): string[] {
  const v = value.replace(/&amp;/g, "&");
  if (!kind) return [v];
  if (kind === "set" || kind === "step") return v.split(";").map(keyOf);
  if (kind === "toggle") return v.split(";").map((one) => (/:[^:]*\|/.test(one) ? keyOf(one) : one));
  if (kind === "clear" || kind === "bind" || kind === "text") return v.split(";");
  if (kind === "in-view") return [v.split("=")[0] ?? ""];
  const exprs = kind === "class" ? v.split(";").map((e) => e.split("=>")[0] ?? "") : [v];
  return exprs.flatMap((e) => e.split(/\|\||&&/)).map((a) => a.trim().replace(/^!/, "").replace(/(!=|>=|<=|=|>|<).*$/, ""));
}

/** Every distinct state key in the site's files, sorted. */
export function stateKeysOf(files: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const src of files)
    for (const m of src.matchAll(ATTR))
      for (const k of keysIn(m[1], m[2]!)) {
        const key = k.trim();
        if (key && !key.includes("{{") && !key.includes("{%")) out.add(key);
      }
  return [...out].sort();
}

export function useStateKeys(): string[] {
  const files = useEditorState((s) => s.files);
  return useMemo(() => stateKeysOf(files.values()), [files]);
}
