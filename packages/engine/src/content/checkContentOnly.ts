/**
 * Content-only check — the same test the in-editor gate (`contentMode`) and a
 * host server run on a client's save. Masking: in both versions the editable ranges are
 * masked, keyed by document order — the inner text of `data-editable="text"` elements,
 * `src` / `srcset` / `alt` values of `data-editable="image"`, `href` value and inner text of
 * `data-editable="link"`, and every `{% section %}` argument value. The masked texts must be
 * byte-identical (so structure, classes, other attributes, argument names and count are
 * frozen), and each changed value must be clean:
 *
 * - text: no Liquid tags, no Liquid outputs that weren't already there, and no HTML tags
 *   except ones already in the value or attribute-less inline formatting (`<b>`, `<em>`, …);
 * - attribute values: no Liquid, no `javascript:` / `vbscript:` / `data:text/html` URLs;
 * - section arguments: a string / number / `true` / `false` literal, of the setting's type
 *   when the section's schema is in `bundle`.
 *
 * Locks are honoured: nothing inside a `data-edit-lock="sealed"` element is editable.
 */
import { findAttribute, readTagArguments, type TagArgument, type TagWithArguments } from "../edit/ops";
import { NodeTypes, parseSource, type Range } from "../parse/parse";
import { buildTree, type TreeNode } from "../parse/tree";
import { EDITABLE_ATTRIBUTE, EDIT_ATTRIBUTES } from "../attributes/editAttributes";
import { readSchema, sectionSettingsFromArgs } from "../runtime/tags/schema";
import type { Environment } from "../parse/environment";
import type { Files, Path } from "../state/changes";

export type ContentCheck = { ok: true } | { ok: false; reason: string };

export interface ContentCheckOptions {
  /** Site files (by path); `sections/<name>.liquid` schemas type-check argument values. */
  bundle?: Files | Record<Path, string>;
  env?: Environment;
}

interface Slot {
  kind: "text" | "attr" | "arg";
  /** Attribute or argument name. */
  name: string;
  range: Range;
  section?: string;
  arg?: TagArgument;
}

const INLINE_TAGS = /^<\/?(b|strong|i|em|u|s|br|span|sub|sup|mark|small|code)\s*\/?>$/i;
const BAD_URL = /^\s*(javascript|vbscript):|^\s*data:text\/html/i;
const IMAGE_ATTRS = ["src", "srcset", "alt"];

function attrValueRange(n: TreeNode, name: string): Range | null {
  if (n.kind !== "element") return null;
  const a = findAttribute(n.node, name);
  return a && "attributePosition" in a ? { start: a.attributePosition.start, end: a.attributePosition.end } : null;
}

const attrValue = (src: string, n: TreeNode, name: string): string | undefined => {
  const r = attrValueRange(n, name);
  return r ? src.slice(r.start, r.end) : undefined;
};

/** Editable slots of a source, in document order. */
function slotsOf(src: string, env?: Environment): Slot[] {
  const out: Slot[] = [];
  const visit = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (n.kind === "content") {
        if (n.type === NodeTypes.LiquidTag && (n.node as { name?: string }).name === "section") {
          const section = /^\{%-?\s*section\s+(['"])([^'"]*)\1/.exec(src.slice(n.range.start, n.range.end))?.[2];
          for (const arg of readTagArguments(src, n.node as unknown as TagWithArguments)) out.push({ kind: "arg", name: arg.name, range: arg.range, section, arg });
        }
        continue;
      }
      if (n.kind === "liquid-block") {
        for (const b of n.branches) visit(b.children);
        continue;
      }
      if (attrValue(src, n, EDIT_ATTRIBUTES.lock)?.trim() === "sealed") continue;
      const editable = attrValue(src, n, EDITABLE_ATTRIBUTE);
      const inner = (): void => {
        if (n.closeTag) out.push({ kind: "text", name: "#text", range: { start: n.openTag.end, end: n.closeTag.start } });
      };
      if (editable === "text") {
        inner();
        continue;
      }
      if (editable === "link") {
        const r = attrValueRange(n, "href");
        if (r) out.push({ kind: "attr", name: "href", range: r });
        inner();
        continue;
      }
      if (editable === "image") {
        for (const name of IMAGE_ATTRS) {
          const r = attrValueRange(n, name);
          if (r) out.push({ kind: "attr", name, range: r });
        }
      }
      visit(n.children);
    }
  };
  visit(buildTree(parseSource(src, "strict", { env })));
  return out;
}

function masked(src: string, slots: Slot[]): string {
  let out = "";
  let pos = 0;
  for (const s of slots) {
    out += src.slice(pos, s.range.start) + `\u0000${s.kind}:${s.name}\u0000`;
    pos = s.range.end;
  }
  return out + src.slice(pos);
}

const outputs = (s: string): string[] => s.match(/\{\{[\s\S]*?\}\}/g) ?? [];
const tags = (s: string): string[] => s.match(/<[^>]*>/g) ?? [];

function cleanText(prev: string, next: string): string | null {
  if (/\{%/.test(next)) return "Liquid tags are not allowed in editable text";
  const had = outputs(prev);
  for (const o of outputs(next)) {
    const i = had.indexOf(o);
    if (i < 0) return `new Liquid output ${o} in editable text`;
    had.splice(i, 1);
  }
  const prevTags = new Set(tags(prev));
  for (const t of tags(next)) if (!prevTags.has(t) && !INLINE_TAGS.test(t)) return `markup ${t} is not allowed in editable text`;
  return null;
}

function cleanAttr(name: string, next: string): string | null {
  if (/\{\{|\{%/.test(next)) return `Liquid is not allowed in ${name}`;
  if ((name === "href" || name === "src" || name === "srcset") && BAD_URL.test(next)) return `unsafe URL in ${name}`;
  return null;
}

function cleanArg(slot: Slot, bundle: ContentCheckOptions["bundle"]): string | null {
  const arg = slot.arg!;
  const literal = arg.type === "String" || arg.type === "Number" || (arg.type === "LiquidLiteral" && (arg.source === "true" || arg.source === "false"));
  if (!literal) return `section argument ${arg.name} must be a string, number, true or false literal`;
  if (!bundle || !slot.section) return null;
  const file = bundle instanceof Map ? bundle.get(`sections/${slot.section}.liquid`) : (bundle as Record<Path, string>)[`sections/${slot.section}.liquid`];
  const schema = file ? readSchema(file).schema : null;
  if (!schema) return null;
  const issue = sectionSettingsFromArgs(schema, [arg]).issues[0];
  return issue?.rule === "section-setting-type" ? `section argument ${arg.name} has the wrong type for its setting` : null;
}

/** True when `next` differs from `prev` only in editable values, each of them clean. */
export function checkContentOnly(prev: string, next: string, opts: ContentCheckOptions = {}): ContentCheck {
  if (prev === next) return { ok: true };
  let nextSlots: Slot[];
  try {
    nextSlots = slotsOf(next, opts.env);
  } catch (e) {
    return { ok: false, reason: `not well-formed: ${(e as Error).message}` };
  }
  const prevSlots = slotsOf(prev, opts.env);
  if (masked(prev, prevSlots) !== masked(next, nextSlots)) return { ok: false, reason: "only editable content may change (structure, classes and other attributes are frozen)" };
  for (let i = 0; i < nextSlots.length; i++) {
    const a = prevSlots[i]!;
    const b = nextSlots[i]!;
    const before = prev.slice(a.range.start, a.range.end);
    const after = next.slice(b.range.start, b.range.end);
    if (before === after) continue;
    const reason = b.kind === "text" ? cleanText(before, after) : b.kind === "attr" ? cleanAttr(b.name, after) : cleanArg(b, opts.bundle);
    if (reason) return { ok: false, reason };
  }
  return { ok: true };
}

/** The same check over whole sites: no file may be added or removed. */
export function checkContentChanges(prev: Files | Record<Path, string>, next: Files | Record<Path, string>, opts: Omit<ContentCheckOptions, "bundle"> = {}): ContentCheck {
  const p = prev instanceof Map ? prev : new Map(Object.entries(prev));
  const n = next instanceof Map ? next : new Map(Object.entries(next));
  for (const path of new Set([...p.keys(), ...n.keys()])) {
    const a = p.get(path);
    const b = n.get(path);
    if (a === b) continue;
    if (a === undefined || b === undefined) return { ok: false, reason: `${path}: files may not be added or removed` };
    const r = checkContentOnly(a, b, { ...opts, bundle: n });
    if (!r.ok) return { ok: false, reason: `${path}: ${r.reason}` };
  }
  return { ok: true };
}
