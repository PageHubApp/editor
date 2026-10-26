/**
 * `{% map lat: 33.8, lng: -118.3, zoom: 13 %}…pins and routes…{% endmap %}` — block tag.
 * Emits `<div data-map="<json config>">` around the body; the site runtime's lazy `map` chunk
 * reads the config and the body's pin / route elements. Arguments are the config, verbatim, except `class`, which goes on the map element.
 */
import { Hash, type Context, type Emitter, type Liquid, type Parser, type TagToken, type TopLevelToken } from "liquidjs";
import { BlockTag } from "./blockTag";
import { attrString } from "../escape";

export class MapTag extends BlockTag {
  private readonly hash: Hash;

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser?: Parser) {
    super(token, remainTokens, liquid, parser);
    this.hash = new Hash(this.tokenizer.remaining());
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const { class: cls, ...config } = (yield this.hash.render(ctx)) as Record<string, unknown>;
    emitter.write(`<div${attrString({ class: cls, "data-map": JSON.stringify(config) })}>`);
    yield this.renderBody(ctx, emitter);
    emitter.write("</div>");
  }
}
