/**
 * Action gating for the HTML-first model: a per-action "only fire if…" condition is a Liquid
 * `{% if … %}` that wraps that action's defining attributes inside the element's open tag —
 *
 *   <button class="btn" {% if customer %}data-cart="add"{% endif %}>
 *
 * so the attributes (and therefore the behaviour) are present only when the condition holds. This
 * module is the seam: it reads a gate, reads an attribute whether it is direct or gated, and
 * toggles an action's attributes between direct and wrapped — rewriting the open tag in one edit.
 */
import type { NodeHandle, Store } from "@pagehub/engine";
import { ACTION_SPECS } from "./actionSpecs";

interface AttrItem {
  kind: "attr";
  name: string;
  raw: string;
}
interface GateItem {
  kind: "gate";
  cond: string;
  attrs: AttrItem[];
}
type Item = AttrItem | GateItem;

interface OpenTag {
  /** `<button` (tag open + name). */
  head: string;
  items: Item[];
  /** `>` or `/>`. */
  close: string;
  /** Absolute range of the open tag in the file. */
  from: number;
  to: number;
}

/** The attribute names that define an action type (its flag attrs + its detail fields). */
function actionAttrNames(type: string): Set<string> {
  const spec = ACTION_SPECS[type];
  return new Set<string>(spec ? [...spec.attrs.map(([n]) => n), ...spec.fields.map((f) => f.attr)] : []);
}

/** Read one attribute token at `i` (returns the raw text and the attribute name), or null. */
function readAttr(src: string, i: number): { raw: string; name: string; end: number } | null {
  const m = /^([^\s=/>]+)/.exec(src.slice(i));
  if (!m) return null;
  const name = m[1]!;
  let j = i + name.length;
  // optional = value
  const rest = src.slice(j);
  const eq = /^\s*=\s*/.exec(rest);
  if (eq) {
    j += eq[0].length;
    const c = src[j];
    if (c === '"' || c === "'") {
      const close = src.indexOf(c, j + 1);
      j = close === -1 ? src.length : close + 1;
    } else {
      const vm = /^[^\s>]+/.exec(src.slice(j));
      j += vm ? vm[0].length : 0;
    }
  }
  return { raw: src.slice(i, j), name, end: j };
}

/** Parse an element's open tag into its head, attribute / gate items and close. */
function parseOpenTag(handle: NodeHandle, source: string): OpenTag | null {
  if (!handle.alive || handle.kind !== "element") return null;
  const n = handle.node();
  if (n.kind !== "element") return null;
  const from = n.openTag.start;
  const to = n.openTag.end;
  const src = source.slice(from, to);
  const hm = /^<[a-zA-Z][\w-]*/.exec(src);
  if (!hm) return null;
  const head = hm[0];
  const items: Item[] = [];
  let i = head.length;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === ">" || (c === "/" && src[i + 1] === ">")) break;
    if (src.startsWith("{%", i)) {
      // a Liquid tag: an `{% if … %}…{% endif %}` gate, or an opaque tag we leave inline as an attr-like token
      const ifm = /^\{%-?\s*if\s+([\s\S]*?)\s*-?%\}/.exec(src.slice(i));
      const end = src.indexOf("%}", i);
      if (ifm) {
        const innerStart = i + ifm[0].length;
        const endif = src.indexOf("{% endif %}", innerStart);
        const close2 = endif === -1 ? src.indexOf("{%-", innerStart) : endif;
        if (endif !== -1) {
          const inner = src.slice(innerStart, endif);
          const attrs: AttrItem[] = [];
          let k = 0;
          while (k < inner.length) {
            if (/\s/.test(inner[k]!)) {
              k++;
              continue;
            }
            const a = readAttr(inner, k);
            if (!a) break;
            attrs.push({ kind: "attr", name: a.name, raw: a.raw });
            k = a.end;
          }
          items.push({ kind: "gate", cond: ifm[1]!.trim(), attrs });
          i = endif + "{% endif %}".length;
          continue;
        }
        void close2;
      }
      // unknown liquid: skip to %} and keep as a passthrough attr token
      if (end !== -1) {
        items.push({ kind: "attr", name: "", raw: src.slice(i, end + 2) });
        i = end + 2;
        continue;
      }
      break;
    }
    const a = readAttr(src, i);
    if (!a) break;
    items.push({ kind: "attr", name: a.name, raw: a.raw });
    i = a.end;
  }
  const close = src.slice(i);
  return { head, items, close: close || ">", from, to };
}

const serialize = (t: OpenTag): string => {
  const parts = t.items.map((it) => (it.kind === "attr" ? it.raw : `{% if ${it.cond} %}${it.attrs.map((a) => a.raw).join(" ")}{% endif %}`));
  return `${t.head}${parts.length ? " " + parts.join(" ") : ""}${t.close.startsWith(">") || t.close.startsWith("/") ? t.close : ">"}`;
};

/** The gate wrapping action `type`'s attributes, if any, with its condition. */
export function readActionGate(store: Store, handle: NodeHandle, type: string): { condition: string } | null {
  const src = store.state.files.get(handle.path);
  const tag = src != null ? parseOpenTag(handle, src) : null;
  if (!tag) return null;
  const names = actionAttrNames(type);
  for (const it of tag.items) if (it.kind === "gate" && it.attrs.some((a) => names.has(a.name))) return { condition: it.cond };
  return null;
}

/** An attribute's value, direct or inside any gate (for gated-action detection). Returns "" / null the same way `handle.attr` does. */
function gatedAttr(store: Store, handle: NodeHandle, name: string): string | null {
  const direct = handle.alive && handle.kind === "element" ? handle.attr(name) : undefined;
  if (direct !== undefined) return direct;
  const src = store.state.files.get(handle.path);
  const tag = src != null ? parseOpenTag(handle, src) : null;
  if (!tag) return null;
  for (const it of tag.items) {
    if (it.kind !== "gate") continue;
    const a = it.attrs.find((x) => x.name === name);
    if (a) return attrValue(a.raw);
  }
  return null;
}

/** A reader like `handle.attr` that also sees attributes inside a gate (for `detectActiveActions`). */
export const gateReader = (store: Store, handle: NodeHandle) => (name: string): string | null => gatedAttr(store, handle, name);

const attrValue = (raw: string): string => {
  const m = /=\s*(['"])([\s\S]*?)\1/.exec(raw);
  if (m) return m[2]!;
  const u = /=\s*([^\s]+)/.exec(raw);
  return u ? u[1]! : "";
};

/**
 * Gate (or re-gate) action `type` behind `condition`, or ungate it (`condition` null / empty).
 * Collects the action's attributes from wherever they sit (direct or an existing gate) and moves
 * them into one `{% if condition %}…{% endif %}`, or back out as direct attributes. One edit.
 */
export function setActionGate(store: Store, handle: NodeHandle, type: string, condition: string | null): boolean {
  const src = store.state.files.get(handle.path);
  const tag = src != null ? parseOpenTag(handle, src) : null;
  if (!tag) return false;
  const cond = condition?.trim() ?? "";
  // Keep the `{% if %}` tag well-formed. Comparison operators (`<`, `>`) are fine inside it.
  if (/\{%|%\}|\{\{|\}\}/.test(cond)) return false;
  const names = actionAttrNames(type);
  const collected: AttrItem[] = [];
  const rest: Item[] = [];
  for (const it of tag.items) {
    if (it.kind === "attr" && names.has(it.name)) {
      collected.push(it);
    } else if (it.kind === "gate" && it.attrs.some((a) => names.has(a.name))) {
      // this action's existing gate: take its action attrs; keep any others gated as they were
      collected.push(...it.attrs.filter((a) => names.has(a.name)));
      const keep = it.attrs.filter((a) => !names.has(a.name));
      if (keep.length) rest.push({ kind: "gate", cond: it.cond, attrs: keep });
    } else {
      rest.push(it);
    }
  }
  if (!collected.length) return false;
  const items: Item[] = cond ? [...rest, { kind: "gate", cond, attrs: collected }] : [...rest, ...collected];
  const next = serialize({ ...tag, items });
  return store.dispatch((tr) => tr.replace({ path: handle.path, from: tag.from, to: tag.to }, next));
}
