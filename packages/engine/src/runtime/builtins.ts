/**
 * The built-in tags and filters as `defineTag` / `defineFilter` values. Behaviour is not
 * restated here: each wraps the existing implementation (`builtinTags`, `BUILTIN_FILTERS`) and
 * adds its argument schema. For tags the schema documents the arguments (docs, lint, inspector
 * forms); the liquidjs class keeps parsing them. For filters the schema is enforced.
 */
import { PaginateTag } from "../liquid/tags/paginate";
import { t } from "../schema/t";
import { defineFilter, type FilterDef } from "./defineFilter";
import { defineTag, type TagClass, type TagDef, type TagHost } from "./defineTag";
import { BUILTIN_FILTERS } from "./filters/builtinFilters";
import { BUILTIN_TAG_META, PARSER_NATIVE_TAGS, builtinTags } from "./tags/builtinTags";

const TAG_ARGS = {
  paginate: t.hash({}).describe("`paginate <list> by <n>`; the page number comes from the request's `page` query value"),
  form: t.hash({ class: t.string().optional(), id: t.string().optional(), action: t.string().optional() }),
  section: t.hash({}).describe("`section '<name>'` plus one named argument per setting in the section's schema"),
  schema: t.hash({}),
  doc: t.hash({}),
  style: t.hash({}),
  javascript: t.hash({}),
  map: t.hash({
    lat: t.number().min(-90).max(90).describe("Centre latitude"),
    lng: t.number().min(-180).max(180).describe("Centre longitude"),
    zoom: t.int().min(1).max(20).optional().describe("Initial zoom (default 13)"),
    tiles: t.string().optional().describe("Tile URL template; default OpenStreetMap"),
    attribution: t.string().optional(),
  }),
} as const;

const classes = new WeakMap<TagHost, Record<string, TagClass>>();
const builtinClasses = (host: TagHost): Record<string, TagClass> => {
  let c = classes.get(host);
  if (!c) classes.set(host, (c = { ...builtinTags(host), paginate: PaginateTag as unknown as TagClass }));
  return c;
};

export const BUILTIN_TAGS: readonly TagDef[] = BUILTIN_TAG_META.map((meta) =>
  defineTag({
    ...meta,
    args: TAG_ARGS[meta.name as keyof typeof TAG_ARGS],
    parserNative: PARSER_NATIVE_TAGS.has(meta.name),
    liquid: (host) => builtinClasses(host)[meta.name]!,
  }),
);

const str = () => t.string().optional();
const FILTER_ARGS: Record<string, FilterDef["args"]> = {
  handleize: [],
  pluralize: [t.string(), t.string()],
  data_items: [str()],
  where: [t.string(), str()],
  facets: [t.string()],
  time_tag: [str(), t.hash({ format: str(), class: str(), id: str(), datetime: str() })],
  link_to: [t.string(), t.hash({ title: str(), class: str(), id: str(), target: str(), rel: str() })],
  money: [t.hash({ currency: str(), lang: str() })],
  money_with_currency: [t.hash({ currency: str(), lang: str() })],
  default_pagination: [t.hash({ previous: str(), next: str() })],
  default_errors: [],
  image_tag: [
    t.hash({
      alt: str(), class: str(), id: str(), width: t.number().optional(), height: t.number().optional(), loading: str(), decoding: str(),
      sizes: str(), srcset: str(), fetchpriority: str(), style: str(),
    }),
  ],
  image_url: [t.hash({ width: t.number().optional(), height: t.number().optional(), crop: str(), format: str() })],
  file_url: [],
  asset_url: [],
  icon: [],
};

export const BUILTIN_FILTER_DEFS: readonly FilterDef[] = BUILTIN_FILTERS.map((f) => {
  const args = FILTER_ARGS[f.name];
  if (!args) throw new Error(`built-in filter "${f.name}" has no argument schema`);
  return defineFilter({ ...f, args });
});
