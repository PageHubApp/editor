/**
 * The built-in tags as data + a liquidjs registration map.
 *
 * Each entry carries the metadata `defineTag` needs — `name`, `kind`, `parseLike`,
 * `describe` — so `defineTag` can wrap these classes without touching them: `defineTag({ ...meta,
 * args, render })` keeps the liquidjs class as the implementation behind a `render` adapter,
 * and `meta.parseLike` feeds `createParserEnvironment`. `builtinTags(opts)` returns the map
 * `createEngine({ tags })` takes; `paginate` stays registered by `createEngine` itself.
 */
import type { TagClass } from "../defineTag";
import type { ParserTag, ParseLike } from "../../parse/environment";
import { SilentBlockTag } from "./blockTag";
import { createFormTag, type FormHandler } from "./form";
import { MapTag } from "./map";
import { createJavascriptTag } from "./javascript";
import { createSectionTag, type SectionTagOptions } from "./section";
import { StyleTag } from "./style";

export interface BuiltinTagMeta {
  name: string;
  kind: "block" | "tag" | "raw";
  parseLike: ParseLike;
  describe: string;
}

export const BUILTIN_TAG_META: readonly BuiltinTagMeta[] = [
  { name: "paginate", kind: "block", parseLike: "form", describe: "Split a list into pages: {% paginate list by 12 %}; exposes the paginate object." },
  { name: "form", kind: "block", parseLike: "form", describe: "A form that posts to the host form handler; exposes form.posted_successfully?, form.errors, form.values." },
  { name: "section", kind: "tag", parseLike: "section", describe: "Render sections/<name>.liquid with settings given as named literal arguments." },
  { name: "schema", kind: "raw", parseLike: "raw", describe: "A section's settings schema (JSON). Renders nothing." },
  { name: "doc", kind: "raw", parseLike: "raw", describe: "Documentation for a snippet. Renders nothing." },
  { name: "style", kind: "block", parseLike: "form", describe: "CSS wrapped in a <style> element; the body is rendered as Liquid." },
  { name: "map", kind: "block", parseLike: "form", describe: "An interactive map: {% map lat: 1, lng: 2, zoom: 12, tiles: 'osm' %} with child pins (<address data-pin=\"lat,lng\">) and routes (<span data-route=\"lat,lng; lat,lng\">). Also mode (interactive, static, background), grayscale, title." },
  { name: "javascript", kind: "raw", parseLike: "raw", describe: "A section's or partial's own JavaScript (raw, no Liquid inside). Added once per page, in one <script> at the end of <body>." },
];

/** Built-ins the parser already understands; every other built-in (`map`) is registered on the parser side too. */
export const PARSER_NATIVE_TAGS: ReadonlySet<string> = new Set(["paginate", "form", "section", "schema", "doc", "style"]);

/** Parser-environment registrations for every built-in that the parser does not know natively. */
export function builtinParserTags(): ParserTag[] {
  return BUILTIN_TAG_META.filter((t) => !PARSER_NATIVE_TAGS.has(t.name)).map((t) => ({ name: t.name, parseLike: t.parseLike }));
}

export interface BuiltinTagOptions extends SectionTagOptions {
  formHandler: FormHandler;
  /** Collects this render's `{% javascript %}` blocks (see `withPageScripts`). Default: collected and dropped. */
  scripts?: Set<string>;
}

/** liquidjs registrations: pass as `createEngine({ tags: builtinTags({ files, formHandler }) })`. */
export function builtinTags(opts: BuiltinTagOptions): Record<string, TagClass> {
  return {
    form: createFormTag(opts.formHandler) as unknown as TagClass,
    section: createSectionTag(opts) as unknown as TagClass,
    schema: SilentBlockTag as unknown as TagClass,
    doc: SilentBlockTag as unknown as TagClass,
    style: StyleTag as unknown as TagClass,
    map: MapTag as unknown as TagClass,
    javascript: createJavascriptTag(opts.scripts ?? new Set()),
  };
}
