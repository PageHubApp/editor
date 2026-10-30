/**
 * `defineTag` — a Liquid tag as an extension value.
 *
 * One definition registers on both sides: the liquidjs engine (the class is generated here from
 * `render`, arguments checked against `args`) and the parser environment (`parseLike` copies a
 * built-in parser shape, so a block tag parses as a block in lint and the editor).
 *
 *   kind "tag"    `{% name a: 1 %}`                       render gets { args }
 *   kind "block"  `{% name a: 1 %}…{% endname %}`         render also gets `body(scope?)` → rendered body text
 *   kind "raw"    `{% name %}…{% endname %}`              body is not parsed; render gets `raw` text
 *
 * `render` yields strings to write. What it yields is trusted markup: escape visitor data with
 * `ctx.escape`. Built-ins bring their own liquidjs class through `liquid` instead of `render`.
 */
import { Hash, Tag, type Context, type Emitter, type Liquid, type Parser, type TagToken, type TopLevelToken } from "liquidjs";
import { EXTENSION, type Extension } from "../extensions/extension";
import { parserTagsFacet } from "../extensions/facets";
import type { ParseLike } from "../parse/environment";
import type { Schema } from "../schema/t";
import { escapeHtml } from "./escape";
import { tagsFacet } from "./facets";
import { BlockTag } from "./tags/blockTag";
import type { FormHandler } from "./tags/form";
import type { JsonValue } from "./tags/schema";
import type { PageMeta } from "./tags/seo";

/** What a tag's `render` can read from the page being rendered. */
export interface TagRenderContext {
  /** A variable from the render scope (`["page", "title"]`). */
  get(path: string[]): unknown;
  escape(value: unknown): string;
}
/** Renders the tag's body (Liquid) to text; `scope` adds variables visible inside it. */
export type BodyRenderer = (scope?: Record<string, unknown>) => Promise<string>;

export interface TagInput<A> {
  args: A;
  body?: BodyRenderer;
  raw?: string;
}

/** What the renderer gives built-in tag classes. */
export interface TagHost {
  /** Site files with this render's overrides applied. */
  files(path: string): string | undefined;
  formHandler: FormHandler;
  resolveSetting?(type: string, handle: string): JsonValue | Promise<JsonValue>;
  /** This render's `{% javascript %}` blocks, added to the page once by the renderer. */
  scripts?: Set<string>;
  /** This render's `{% seo %}` calls, read by the host after the render. */
  pageMeta?: PageMeta;
}

export interface TagDef<A = any> {
  readonly runtime: "tag";
  readonly name: string;
  readonly kind: "block" | "tag" | "raw";
  readonly parseLike: ParseLike;
  readonly args: Schema<A>;
  readonly describe: string;
  render?(ctx: TagRenderContext, input: TagInput<A>): AsyncGenerator<string> | Generator<string>;
  /** Built-ins only: the liquidjs class, instead of one generated from `render`. */
  liquid?(host: TagHost): TagClass;
  /** Built-ins only: the parser already knows this tag, so no parser registration is made. */
  readonly parserNative?: boolean;
  [EXTENSION](): Extension;
}

const NAME = /^[a-z_][a-z0-9_]*$/i;

export function defineTag<A>(def: Omit<TagDef<A>, "runtime" | typeof EXTENSION>): TagDef<A> {
  if (!NAME.test(def.name)) throw new Error(`tag name "${def.name}" is not a valid identifier`);
  if (!def.render === !def.liquid) throw new Error(`tag "${def.name}": give exactly one of render or liquid`);
  if (def.kind === "raw" && def.parseLike !== "raw") throw new Error(`tag "${def.name}": a raw tag must parse like "raw"`);
  if (def.kind === "tag" && def.parseLike === "form") throw new Error(`tag "${def.name}": parseLike "form" is for block tags`);
  const tag: TagDef<A> = {
    ...def,
    runtime: "tag",
    [EXTENSION]: () => (tag.parserNative ? tagsFacet.of(tag) : [tagsFacet.of(tag), parserTagsFacet.of({ name: tag.name, parseLike: tag.parseLike })]),
  };
  return tag;
}

const isGenerator = (v: unknown): v is Generator<unknown, unknown, unknown> => typeof (v as Generator)?.next === "function" && typeof (v as Generator)[Symbol.iterator] === "function";

/** Runs a liquidjs generator to completion, awaiting each yielded promise and running each yielded generator. */
async function drive<T>(gen: Generator<unknown, T, unknown>): Promise<T> {
  let r = gen.next();
  while (!r.done) r = gen.next(isGenerator(r.value) ? await drive(r.value) : await r.value);
  return r.value;
}

const nilToUndefined = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

function* run(def: TagDef, ctx: Context, emitter: Emitter, hash: Hash, input: Omit<TagInput<unknown>, "args">): Generator<unknown, void, unknown> {
  const given = nilToUndefined((yield hash.render(ctx)) as Record<string, unknown>);
  const checked = def.args.check(given);
  if (!checked.ok) throw new Error(`tag "${def.name}": ${checked.error}`);
  const rctx: TagRenderContext = { get: (path) => ctx.getSync(path), escape: escapeHtml };
  const it = def.render!(rctx, { ...input, args: checked.value });
  for (;;) {
    let r = it.next();
    if (typeof (r as Promise<unknown>).then === "function") r = (yield r) as IteratorResult<string>;
    if ((r as IteratorResult<string>).done) break;
    emitter.write((r as IteratorResult<string>).value);
  }
}

/** A registered liquidjs tag class (liquidjs does not export this type by name). */
export type TagClass = Liquid["tags"][string];

/** The liquidjs class for a `render`-based definition. */
export function tagClass(def: TagDef, host: TagHost): TagClass {
  if (def.liquid) return def.liquid(host);
  if (def.kind === "block") {
    return class extends BlockTag {
      private readonly hash: Hash;
      constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid, parser?: Parser) {
        super(token, remain, liquid, parser);
        this.hash = new Hash(this.tokenizer.remaining());
      }
      *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
        const body: BodyRenderer = async (scope) => {
          if (scope) ctx.push(scope);
          try {
            return String(await drive(this.liquid.renderer.renderTemplates(this.body, ctx) as Generator<unknown, string, unknown>));
          } finally {
            if (scope) ctx.pop();
          }
        };
        yield* run(def, ctx, emitter, this.hash, { body });
      }
    } as unknown as TagClass;
  }
  if (def.kind === "raw") {
    return class extends Tag {
      private readonly hash: Hash;
      private readonly text: string[] = [];
      constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid, parser?: Parser) {
        super(token, remain, liquid);
        this.hash = new Hash(this.tokenizer.remaining());
        const stream = (parser ?? liquid.parser)
          .parseStream(remain)
          .on("token", (arg) => {
            const t = arg as { name?: string; getText(): string };
            if (t.name === `end${token.name}`) stream.stop();
            else this.text.push(t.getText());
          })
          .on("end", () => {
            throw new Error(`tag ${token.getText()} not closed`);
          });
        stream.start();
      }
      *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
        yield* run(def, ctx, emitter, this.hash, { raw: this.text.join("") });
      }
    } as unknown as TagClass;
  }
  return class extends Tag {
    private readonly hash: Hash;
    constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
      super(token, remain, liquid);
      this.hash = new Hash(this.tokenizer.remaining());
    }
    *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
      yield* run(def, ctx, emitter, this.hash, {});
    }
  } as unknown as TagClass;
}
