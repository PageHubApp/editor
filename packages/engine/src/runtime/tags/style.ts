/** `{% style %}…{% endstyle %}` — body (Liquid-rendered) inside a `<style>` element. */
import { type Context, type Emitter } from "liquidjs";
import { BlockTag } from "./blockTag";

export class StyleTag extends BlockTag {
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    emitter.write("<style>");
    yield this.renderBody(ctx, emitter);
    emitter.write("</style>");
  }
}
