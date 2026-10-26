/**
 * `{% section 'hero', headline: "…", show_badge: true %}` — renders `sections/<name>.liquid`
 * in an isolated scope: the section sees the render's data (`site`, `page`, `request`, …) but not
 * the page's `assign`s, and its own assigns do not leak back. `section.settings` is the schema's
 * defaults overlaid with the tag's arguments, coerced per type; an argument of the wrong type or
 * with no matching setting is ignored here (lint reports it). Resource-typed settings resolve through
 * the host's `resolveSetting`.
 */
import { Hash, Tag, evalToken, type Context, type Emitter, type Liquid, type Parser, type TagToken, type Template, type TopLevelToken } from "liquidjs";
import {
  RESOURCE_LIST_TYPES, RESOURCE_TYPES, coerceSetting, inputSettings, readSchema, settingDefaults,
  type JsonValue, type SectionSchema,
} from "./schema";

export interface SectionTagOptions {
  /** Site files by path; `sections/<name>.liquid` is read from here. */
  files: (path: string) => string | undefined;
  /** Resolve a resource setting (`product`, `collection`, …) to a plain object; null when unknown. */
  resolveSetting?: (type: string, handle: string) => JsonValue | Promise<JsonValue>;
}

type Token = Parameters<typeof evalToken>[0];
interface Parsed {
  templates: Template[];
  schema: SectionSchema | null;
}
const MAX_CACHE = 200;
const NAME = /^[A-Za-z0-9_-]+$/;

export function createSectionTag(opts: SectionTagOptions): typeof Tag {
  const cache = new Map<string, Parsed>();

  return class SectionTag extends Tag {
    private readonly nameToken: Token;
    private readonly hash: Hash;

    constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser?: Parser) {
      super(token, remainTokens, liquid);
      const name = this.tokenizer.readValue();
      if (!name) throw new Error(`expected "section '<name>'": ${token.getText()}`);
      this.nameToken = name as Token;
      this.hash = new Hash(this.tokenizer.remaining());
    }

    *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
      const name = String(yield evalToken(this.nameToken, ctx));
      if (!NAME.test(name)) throw new Error(`invalid section name "${name}"`);
      const path = `sections/${name}.liquid`;
      const source = opts.files(path);
      if (source === undefined) throw new Error(`section "${name}" not found (${path})`);
      let parsed = cache.get(source);
      if (!parsed) {
        parsed = { templates: this.liquid.parse(source), schema: readSchema(source).schema };
        if (cache.size >= MAX_CACHE) cache.clear();
        cache.set(source, parsed);
      }
      const args = (yield this.hash.render(ctx)) as Record<string, unknown>;
      const settings: Record<string, JsonValue> = parsed.schema ? settingDefaults(parsed.schema) : {};
      for (const s of parsed.schema ? inputSettings(parsed.schema) : []) {
        if (!(s.id in args)) continue;
        const c = coerceSetting(s, args[s.id]);
        if (c.ok) settings[s.id] = c.value;
      }
      for (const s of parsed.schema ? inputSettings(parsed.schema) : []) {
        if (!RESOURCE_TYPES.has(s.type)) continue;
        const raw = settings[s.id];
        if (typeof raw !== "string" || !raw) {
          settings[s.id] = RESOURCE_LIST_TYPES.has(s.type) ? [] : null;
          continue;
        }
        const resolve = async (h: string): Promise<JsonValue> => (opts.resolveSetting ? ((await opts.resolveSetting(s.type, h)) ?? null) : null);
        if (RESOURCE_LIST_TYPES.has(s.type)) {
          const handles = raw.split(",").map((h) => h.trim()).filter(Boolean).slice(0, s.limit ?? 50);
          const items = (yield Promise.all(handles.map(resolve))) as JsonValue[];
          settings[s.id] = items.filter((v) => v !== null);
        } else {
          settings[s.id] = (yield resolve(raw)) as JsonValue;
        }
      }
      const sub = ctx.spawn(ctx.environments);
      sub.push({ section: { id: name, settings } });
      yield this.liquid.renderer.renderTemplates(parsed.templates, sub, emitter);
    }
  };
}
