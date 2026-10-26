/**
 * Base for `{% name … %}…{% endname %}` tags: collects the body templates up to `end<name>`
 * (token.name, so one class serves every block tag) and offers `renderBody`. Subclasses read
 * their arguments from `this.tokenizer` after `super()`.
 */
import { Tag, type Context, type Emitter, type Liquid, type Parser, type TagToken, type Template, type TopLevelToken } from "liquidjs";

export abstract class BlockTag extends Tag {
  protected readonly body: Template[] = [];

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser?: Parser) {
    super(token, remainTokens, liquid);
    const end = `tag:end${token.name}`;
    const stream = (parser ?? liquid.parser)
      .parseStream(remainTokens)
      .on(end, () => stream.stop())
      .on("template", (t: Template) => this.body.push(t))
      .on("end", () => {
        throw new Error(`tag ${token.getText()} not closed`);
      });
    stream.start();
  }

  protected renderBody(ctx: Context, emitter: Emitter): unknown {
    return this.liquid.renderer.renderTemplates(this.body, ctx, emitter);
  }
}

/** Block tag whose body is never rendered or even evaluated (`schema`, `doc`): tokens are skipped raw. */
export class SilentBlockTag extends Tag {
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser?: Parser) {
    super(token, remainTokens, liquid);
    const stream = (parser ?? liquid.parser)
      .parseStream(remainTokens)
      .on("token", (arg) => {
        if ((arg as { name?: string }).name === `end${token.name}`) stream.stop();
      })
      .on("end", () => {
        throw new Error(`tag ${token.getText()} not closed`);
      });
    stream.start();
  }

  render(): void {}
}
