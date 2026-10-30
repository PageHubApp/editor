/**
 * `createRenderer` — the sandboxed Liquid renderer, built from extension values.
 *
 * Everything non-negotiable comes from `createEngine` (escape on, own properties only, strict
 * filters, limits, UTC, no `include` / `layout` / `block`). This adds the registrations: the
 * built-in tags and filters, plus every `defineTag` / `defineFilter` value in `extensions`
 * (a name that is already taken is an error). Partials and sections come from `files`
 * (`partials/<name>.liquid`, `sections/<name>.liquid`).
 *
 * `render(path, data, { overrides })`: override text replaces the file of the same path for that
 * one render, whether it is the entry, a section or a partial; it never leaks into another render.
 * That is why each render builds its own engine (tag classes are cheap; the parse cache is not shared).
 *
 * The wall-clock cap is `timeoutMs` (default `limits.renderLimit`): liquidjs checks it between
 * nodes, and a render stuck awaiting the host is raced against it. Either rejects with `RenderTimeoutError`.
 */
import { Liquid, type FilterImplOptions } from "liquidjs";
import { Configuration, ConfigError, type RuntimeExtension } from "../extensions/extension";
import { dataSourcesFacet } from "../extensions/facets";
import { createEngine, DEFAULT_LIMITS, REMOVED_TAGS, type RenderLimits } from "../liquid/engine";
import { createParserEnvironment, type Environment, type ParserTag } from "../parse/environment";
import { BUILTIN_FILTER_DEFS, BUILTIN_TAGS } from "./builtins";
import { type DefinedDataSource } from "./defineDataSource";
import { checkFilterArgs, type FilterDef } from "./defineFilter";
import { tagClass, type TagClass, type TagDef, type TagHost } from "./defineTag";
import { filtersFacet, tagsFacet } from "./facets";
import { adaptFilter } from "./filters/builtinFilters";
import type { HostProviders } from "./filters/types";
import type { FormHandler } from "./tags/form";
import { withPageScripts } from "./tags/javascript";
import type { PageMeta } from "./tags/seo";
import type { Path } from "../state/changes";
import type { RenderMode } from "./renderPage";

export class RenderTimeoutError extends Error {
  override name = "RenderTimeoutError";
  constructor(readonly timeoutMs: number) {
    super(`render exceeded ${timeoutMs} ms`);
  }
}

export interface RendererOptions {
  /** `defineTag` / `defineFilter` / `defineDataSource` values (nested arrays allowed), after the built-ins. */
  extensions?: readonly RuntimeExtension[];
  /** Site files by path; `undefined` when the file does not exist. */
  files: (path: Path) => string | undefined;
  limits?: Partial<RenderLimits>;
  timezoneOffset?: number | string;
  /** Providers behind `image_url`, `file_url`, `icon`; a filter without its provider is not registered. */
  host?: HostProviders;
  /** Receives `{% form %}` submissions. Default: reject them, so a missing handler never silently accepts data. */
  formHandler?: FormHandler;
  /** Resolves `product` / `collection` / … section settings to plain objects. */
  resolveSetting?: TagHost["resolveSetting"];
}

export interface RenderCall {
  timeoutMs?: number;
  mode?: RenderMode;
  /** Text replacing `files(path)` for this render only. */
  overrides?: Record<Path, string>;
  /** CSP nonce for the `<script>` that carries the page's `{% javascript %}` blocks. */
  nonce?: string;
  /** Filled with what this render's `{% seo %}` calls set. */
  pageMeta?: PageMeta;
}

export interface Renderer {
  render(path: Path, data: Record<string, unknown>, opts?: RenderCall): Promise<string>;
  readFile(path: Path): string | undefined;
  /**
   * The global variables a file reads, as path segments (`request.query.category` → `["request","query","category"]`),
   * from liquidjs's static analysis. Names bound inside the file (`assign`, `for`, `capture`) are not globals.
   * It follows no `{% render %}` / `{% section %}`: analyse those files themselves.
   */
  variables(path: Path, opts?: { overrides?: Record<Path, string> }): Promise<string[][]>;
  /** The same tag registrations, for parse and lint. */
  readonly parserEnvironment: Environment;
  readonly tags: ReadonlyMap<string, TagDef>;
  readonly filters: ReadonlyMap<string, FilterDef>;
  readonly dataSources: ReadonlyMap<string, DefinedDataSource>;
}

const NO_FORM_HANDLER: FormHandler = () => ({ ok: false, errors: [{ message: "This form is not set up to receive submissions." }] });

type AnyDef = TagDef | FilterDef | DefinedDataSource;
function flatten(list: readonly unknown[], out: AnyDef[] = []): AnyDef[] {
  for (const e of list) {
    if (Array.isArray(e)) flatten(e, out);
    else if (e && typeof e === "object" && ["tag", "filter", "dataSource"].includes((e as AnyDef).runtime)) out.push(e as AnyDef);
    else throw new ConfigError(`${JSON.stringify((e as { name?: string })?.name ?? typeof e)} is not a runtime extension (defineTag, defineFilter or defineDataSource)`);
  }
  return out;
}

function register<T extends { name: string }>(what: string, into: Map<string, T>, items: T[], taken: (name: string) => boolean): void {
  for (const item of items) {
    if (into.has(item.name) || taken(item.name)) throw new ConfigError(`${what} "${item.name}" is already defined`);
    into.set(item.name, item);
  }
}

export function createRenderer(opts: RendererOptions): Renderer {
  const defs = flatten(opts.extensions ?? []);
  const core = new Liquid();
  const coreTags = new Set([...Object.keys(core.tags), ...REMOVED_TAGS]);
  const coreFilters = new Set(Object.keys(core.filters));

  const tags = new Map<string, TagDef>();
  const filters = new Map<string, FilterDef>();
  const dataSources = new Map<string, DefinedDataSource>();
  for (const b of BUILTIN_TAGS) tags.set(b.name, b);
  for (const f of BUILTIN_FILTER_DEFS) filters.set(f.name, f);
  register("tag", tags, defs.filter((d): d is TagDef => d.runtime === "tag"), (n) => coreTags.has(n));
  register("filter", filters, defs.filter((d): d is FilterDef => d.runtime === "filter"), (n) => coreFilters.has(n));
  register("data source", dataSources, defs.filter((d): d is DefinedDataSource => d.runtime === "dataSource"), () => false);
  const globals = new Map<string, string>();
  for (const d of dataSources.values()) {
    if (globals.has(d.liquid.global)) throw new ConfigError(`data sources "${globals.get(d.liquid.global)}" and "${d.name}" both define the global "${d.liquid.global}"`);
    globals.set(d.liquid.global, d.name);
  }

  const parserTags: ParserTag[] = [...tags.values()].filter((t) => !t.parserNative).map((t) => ({ name: t.name, parseLike: t.parseLike }));
  const parserEnvironment = createParserEnvironment(parserTags);
  const host = opts.host ?? {};
  const filterImpls = (): Record<string, FilterImplOptions> => {
    const out: Record<string, FilterImplOptions> = {};
    for (const f of filters.values()) if (!f.host || host[f.host]) out[f.name] = adaptFilter(f, host, (args) => checkFilterArgs(f, args));
    return out;
  };

  const readFile = (path: Path) => opts.files(path);
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };

  /** One engine per call: tag classes close over `files`, so an override never leaks into another call. */
  const build = (overrides: Record<Path, string>, renderLimit: number) => {
    const files = (p: Path) => (Object.hasOwn(overrides, p) ? overrides[p] : opts.files(p));
    const scripts = new Set<string>();
    const pageMeta: PageMeta = { fields: {} };
    const tagHost: TagHost = { files, formHandler: opts.formHandler ?? NO_FORM_HANDLER, resolveSetting: opts.resolveSetting, scripts, pageMeta };
    const partials = new Proxy({} as Record<string, string>, {
      has: (_t, k) => typeof k === "string" && files(`partials/${k}.liquid`) !== undefined,
      get: (_t, k) => (typeof k === "string" ? files(`partials/${k}.liquid`) : undefined),
    });
    const classes: Record<string, TagClass> = {};
    for (const d of tags.values()) classes[d.name] = tagClass(d, tagHost);
    const engine = createEngine({ partials, limits: { ...limits, renderLimit }, timezoneOffset: opts.timezoneOffset, filters: filterImpls(), tags: classes });
    return { engine, files, scripts, pageMeta };
  };

  return {
    readFile,
    parserEnvironment,
    tags,
    filters,
    dataSources,
    async variables(path, call = {}) {
      const { engine, files } = build(call.overrides ?? {}, limits.renderLimit);
      const source = files(path);
      if (source === undefined) throw new Error(`file not found: ${path}`);
      return (await engine.globalVariableSegments(engine.parse(source))).map((segments) => segments.map(String));
    },
    async render(path, data, call = {}) {
      const timeoutMs = call.timeoutMs ?? limits.renderLimit;
      const { engine, files, scripts, pageMeta } = build(call.overrides ?? {}, timeoutMs);
      const source = files(path);
      if (source === undefined) throw new Error(`file not found: ${path}`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RenderTimeoutError(timeoutMs)), timeoutMs);
      });
      try {
        // Pass `data` as GLOBALS too, not just the local scope: `{% render %}` isolates the parent's
        // local scope but inherits globals, so a partial's `{{ company.name }}` / `{{ site.* }}` /
        // `{{ page.* }}` resolve without every `{% render %}` call forwarding them explicitly.
        const html = await Promise.race([engine.parseAndRender(source, data, { globals: data }), deadline]);
        if (call.pageMeta) Object.assign(call.pageMeta, pageMeta);
        return withPageScripts(html, scripts, call.nonce);
      } catch (e) {
        if (e instanceof Error && /render limit/i.test(e.message)) throw new RenderTimeoutError(timeoutMs);
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** A renderer from a resolved configuration: its tag / filter / data-source facets, plus every plugin's lazy runtime half. */
export async function createRendererFromConfiguration(config: Configuration, opts: Omit<RendererOptions, "extensions"> & { extensions?: readonly RuntimeExtension[] }): Promise<Renderer> {
  const lazy = await config.loadRuntimes();
  const seen = new Set<unknown>();
  const unique = (list: readonly unknown[]) => list.filter((x) => !seen.has(x) && seen.add(x));
  return createRenderer({
    ...opts,
    extensions: unique([
      ...(opts.extensions ?? []),
      ...config.facet(tagsFacet).values(),
      ...config.facet(filtersFacet).values(),
      ...config.facet(dataSourcesFacet).values(),
      ...lazy,
    ]),
  });
}
