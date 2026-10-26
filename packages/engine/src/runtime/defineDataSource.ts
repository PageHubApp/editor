/**
 * `defineDataSource` — a named global (`products`, `customer`) whose rows come from the host.
 *
 * `query` runs host-side (credentials stay there); its result must be plain JSON, checked on every
 * call, because it crosses into the sandbox. `liquid.lazy` sources are queried only when the page (or a
 * section / partial it pulls in) mentions the global. `cache.ttl` (ms) memoizes by `cache.key(q)`
 * (default: the request path, query and params); a `visitorDependent` source is never cached here.
 */
import { EXTENSION, type Extension } from "../extensions/extension";
import { dataSourcesFacet } from "../extensions/facets";
import { RESERVED_NAMES } from "./objects";
import { assertPlainJson, type RenderMode, type RenderRequest, type SiteJson } from "./renderPage";
import type { JsonValue } from "./tags/schema";

export interface HostContext {
  site: SiteJson;
  request: RenderRequest;
  mode: RenderMode;
}
/** What `renderPage` needs of a data source: a global, and the query that fills it. */
export interface DataSourceDef {
  name: string;
  liquid: { global: string; lazy?: boolean };
  query(q: { request: RenderRequest; page: Record<string, JsonValue> }, ctx: HostContext): Promise<JsonValue>;
  visitorDependent?: boolean;
  schema?(ctx: HostContext): Promise<JsonValue>;
  preview?: { sampleRows?: number; sample?: JsonValue };
}
/** A `DataSourceDef` made by `defineDataSource`: it also registers itself as an extension. */
export interface DefinedDataSource extends DataSourceDef {
  readonly runtime: "dataSource";
  [EXTENSION](): Extension;
}

const GLOBAL = /^[a-z_][a-z0-9_]*$/i;

export function defineDataSource(def: {
  name: string;
  liquid: { global: string; lazy?: boolean };
  query: DataSourceDef["query"];
  schema?(ctx: HostContext): Promise<JsonValue>;
  preview?: { sampleRows?: number; sample?: JsonValue };
  cache?: { ttl: number; key?(q: Parameters<DataSourceDef["query"]>[0]): string };
  visitorDependent?: boolean;
}): DefinedDataSource {
  if (!def.name) throw new Error("a data source needs a name");
  if (!GLOBAL.test(def.liquid.global)) throw new Error(`data source "${def.name}": "${def.liquid.global}" is not a valid Liquid global`);
  if (RESERVED_NAMES.has(def.liquid.global)) throw new Error(`data source "${def.name}": "${def.liquid.global}" is a built-in object`);
  const memo = new Map<string, { at: number; value: JsonValue }>();
  const ttl = def.cache && !def.visitorDependent ? def.cache.ttl : 0;
  const keyOf = def.cache?.key ?? ((q) => JSON.stringify([q.request.path, q.request.query, q.request.params]));
  const source: DefinedDataSource = {
    runtime: "dataSource",
    name: def.name,
    liquid: def.liquid,
    visitorDependent: def.visitorDependent,
    schema: def.schema,
    preview: def.preview,
    async query(q, ctx) {
      const key = ttl ? keyOf(q) : "";
      const hit = ttl ? memo.get(key) : undefined;
      if (hit && Date.now() - hit.at < ttl) return hit.value;
      const value = await def.query(q, ctx);
      assertPlainJson(value, `data source "${def.name}"`);
      if (ttl) {
        if (memo.size >= 200) memo.clear();
        memo.set(key, { at: Date.now(), value });
      }
      return value;
    },
    [EXTENSION]: () => dataSourcesFacet.of(source),
  };
  return source;
}
