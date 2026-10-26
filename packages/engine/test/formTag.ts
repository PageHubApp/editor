/**
 * Test-only fill for `{% form 'name', class: "…" %}…{% endform %}`, so the sample page
 * renders. The shipped `form` tag (with a host-supplied action resolver) is a later task.
 */
import { Tag, Hash, evalToken, type Context, type Emitter, type Liquid, type Parser, type TagToken, type Template, type TopLevelToken } from "liquidjs";

const attr = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export class TestFormTag extends Tag {
  private readonly formName;
  private readonly hash: Hash;
  private readonly templates: Template[] = [];

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser?: Parser) {
    super(token, remainTokens, liquid);
    this.formName = this.tokenizer.readValue();
    this.hash = new Hash(this.tokenizer.remaining());
    const stream = (parser ?? liquid.parser)
      .parseStream(remainTokens)
      .on("tag:endform", () => stream.stop())
      .on("template", (t: Template) => this.templates.push(t))
      .on("end", () => {
        throw new Error(`tag ${token.getText()} not closed`);
      });
    stream.start();
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const name = yield evalToken(this.formName as never, ctx);
    const opts = (yield this.hash.render(ctx)) as Record<string, unknown>;
    const cls = opts.class ? ` class="${attr(opts.class)}"` : "";
    emitter.write(`<form method="post" action="/forms/${encodeURIComponent(String(name))}"${cls}>`);
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    emitter.write("</form>");
  }
}
