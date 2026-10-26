/**
 * `{% paginate list by 12 %}…{% endpaginate %}` — Shopify's tag. Inside the body, the
 * paginated path (e.g. `blog.articles`) holds only the current page's items, and the
 * `paginate` object exposes `current_page`, `pages`, `page_size`, `items`, `previous`,
 * `next` and `parts`. The page number comes from `request.query.page`; page links keep the
 * rest of the query string.
 *
 * Reads liquidjs tokenizer internals (`PropertyAccessToken.props`), which change between
 * versions — liquidjs is pinned and this tag has its own tests.
 */
import { Tag, evalToken, type Context, type Emitter, type Liquid, type Parser, type TagToken, type Template, type TopLevelToken } from "liquidjs";

interface PageLink {
  url: string;
  number: number;
}

type Token = Parameters<typeof evalToken>[0];

function pageUrl(ctx: Context, page: number): string {
  const path = String(ctx.getSync(["request", "path"]) ?? "");
  const query = (ctx.getSync(["request", "query"]) ?? {}) as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (k !== "page" && v != null) params.set(k, String(v));
  params.set("page", String(page));
  return `${path}?${params.toString()}`;
}

export class PaginateTag extends Tag {
  private readonly list: Token;
  private readonly size: Token;
  private readonly templates: Template[] = [];

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser?: Parser) {
    super(token, remainTokens, liquid);
    const list = this.tokenizer.readValue();
    this.tokenizer.skipBlank();
    const by = this.tokenizer.readIdentifier().content;
    this.tokenizer.skipBlank();
    const size = this.tokenizer.readValue();
    if (!list || by !== "by" || !size) throw new Error(`expected "paginate <list> by <size>": ${token.getText()}`);
    this.list = list as Token;
    this.size = size as Token;
    const p = parser ?? liquid.parser;
    const stream = p
      .parseStream(remainTokens)
      .on("tag:endpaginate", () => stream.stop())
      .on("template", (t: Template) => this.templates.push(t))
      .on("end", () => {
        throw new Error(`tag ${token.getText()} not closed`);
      });
    stream.start();
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const all = ((yield evalToken(this.list, ctx)) ?? []) as unknown[];
    const size = Math.max(1, Number(yield evalToken(this.size, ctx)) || 1);
    const pages = Math.max(1, Math.ceil(all.length / size));
    const requested = Number(ctx.getSync(["request", "query", "page"])) || 1;
    const current = Math.min(pages, Math.max(1, Math.floor(requested)));
    const items = Array.isArray(all) ? all.slice((current - 1) * size, current * size) : [];

    // Shadow the list's path (root.a.b) with this page's slice, copying each level.
    const path = ((this.list as unknown as { props?: Array<{ content: unknown }> }).props ?? []).map((p) => String(p.content));
    const scope: Record<string, unknown> = {};
    if (path.length) {
      let src: unknown = ctx.getSync([path[0]!]);
      let dst: Record<string, unknown> = scope;
      for (let i = 0; i < path.length - 1; i++) {
        const copy = { ...((src ?? {}) as Record<string, unknown>) };
        dst[path[i]!] = copy;
        dst = copy;
        src = (src as Record<string, unknown> | undefined)?.[path[i + 1]!];
      }
      dst[path.at(-1)!] = items;
    }
    const link = (n: number): PageLink => ({ url: pageUrl(ctx, n), number: n });
    ctx.push({
      ...scope,
      paginate: {
        current_page: current,
        current_offset: (current - 1) * size,
        pages,
        page_size: size,
        items: all.length,
        previous: current > 1 ? { title: "Previous", ...link(current - 1) } : null,
        next: current < pages ? { title: "Next", ...link(current + 1) } : null,
        parts: Array.from({ length: pages }, (_, i) => ({
          title: String(i + 1),
          url: pageUrl(ctx, i + 1),
          is_link: i + 1 !== current,
        })),
      },
    });
    try {
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    } finally {
      ctx.pop();
    }
  }
}
