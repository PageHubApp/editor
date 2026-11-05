/**
 * A collection's fields as things an owner can put into a repeated card. An element inside
 * `{% for item in collections.products %}` (or a loop over an `{% assign %}` of it) gets the
 * collection's schema as variables, named the way the owner named them ("Price", a number) and
 * written as `item.price`, even before the collection has any entries.
 *
 *   const loop = loopCollection(handle, list, source);  // { item: "item", collection: {…products} }
 *   withFields(variableCatalogue(…), loop);             // a "Products" group first, then the rest
 *   imageFields(loop);                                  // the photo fields a picture can show
 */
import type { NodeHandle, VariableGroup, VariableItem } from "@pagehub/engine";
import type { CollectionFieldInfo, CollectionFieldKind, CollectionInfo } from "@pagehub/engine/host";
import { readDataSource } from "../inspector/dataSourceModel";
import { collectionFor } from "../canvas/hostCollections";

/** The innermost loop around an element whose list is a collection the host knows. */
export interface LoopCollection {
  /** The loop variable (`item`). */
  item: string;
  collection: CollectionInfo;
}

/** A field kind in the owner's words. */
export const KIND_HINT: Readonly<Record<CollectionFieldKind, string>> = {
  text: "text",
  richText: "text",
  number: "number",
  boolean: "yes / no",
  date: "date",
  select: "choice",
  image: "photo",
  media: "file",
  url: "link",
  email: "email",
  color: "color",
  json: "data",
  ref: "entry",
  computed: "text",
};

const IMAGE_KINDS: ReadonlySet<CollectionFieldKind> = new Set(["image", "media"]);
const IDENT = /^[A-Za-z_][\w-]*$/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What a bare loop list (`featured`) is assigned from in `source`, first pipeline segment only. */
function assignedFrom(name: string, source: string): string | null {
  const m = new RegExp(`\\{%-?\\s*assign\\s+${esc(name)}\\s*=\\s*([^|%]+?)\\s*(?:\\||-?%\\})`).exec(source);
  return m ? m[1]!.trim() : null;
}

/** The innermost `{% for %}` around `h` that loops over one of `list` (the loop's own list, its managed assign, or an assign of it in `source`). */
export function loopCollection(h: NodeHandle | null, list: readonly CollectionInfo[], source = ""): LoopCollection | null {
  if (!h?.alive || !list.length) return null;
  for (let p: NodeHandle | null = h.kind === "liquid-block" && h.tag === "for" ? h : h.parent(); p; p = p.parent()) {
    if (p.kind !== "liquid-block" || p.tag !== "for") continue;
    const ds = readDataSource(p);
    if (!ds) continue;
    let collection = collectionFor(list, ds.base);
    if (!collection && IDENT.test(ds.base)) {
      const from = assignedFrom(ds.base, source);
      if (from) collection = collectionFor(list, from);
    }
    if (collection) return { item: ds.item, collection };
  }
  return null;
}

/** The collection's fields as variables: `item.price`, labelled "Price", hinted "number". */
export function fieldItems(loop: LoopCollection): VariableItem[] {
  return loop.collection.fields.map((f) => ({ expression: `${loop.item}.${f.key}`, label: f.label || f.key, hint: KIND_HINT[f.kind] ?? "text" }));
}

/** The catalogue with the loop's collection fields first (as a group named after the collection); other groups drop what it already lists. */
export function withFields(groups: readonly VariableGroup[], loop: LoopCollection | null): VariableGroup[] {
  if (!loop) return [...groups];
  const fields = fieldItems(loop);
  if (!fields.length) return [...groups];
  const taken = new Set(fields.map((f) => f.expression));
  const rest = groups.map((g) => ({ ...g, items: g.items.filter((i) => !taken.has(i.expression)) })).filter((g) => g.items.length);
  return [{ name: loop.collection.name, items: fields }, ...rest];
}

/** The photo / file fields a picture in the loop can show. */
export function imageFields(loop: LoopCollection | null): CollectionFieldInfo[] {
  return loop ? loop.collection.fields.filter((f) => IMAGE_KINDS.has(f.kind)) : [];
}

/** The path an output prints (`{{ item.price | money }}` → `item.price`), or null for anything else. */
export function outputPath(source: string): string | null {
  return /^\{\{-?\s*([A-Za-z_][\w-]*(?:\.[\w-]+)*)\s*(?:\|[^}]*)?-?\}\}$/.exec(source.trim())?.[1] ?? null;
}

/** The owner's name for an output (`{{ item.price }}` → "Price") when it prints one of the loop's fields. */
export function fieldLabel(loop: LoopCollection | null, source: string): string | null {
  const path = outputPath(source);
  if (!loop || !path) return null;
  return fieldItems(loop).find((f) => f.expression === path)?.label ?? null;
}
