/**
 * `{% pagehub_badge %}` — a "Made with PageHub" link for a footer, in the site's own text colour.
 * `class:` replaces the default classes. The link carries `data-pagehub-badge`: a host that requires the badge
 * (a free plan) looks for it in the output and adds its own floating badge when the page has none.
 */
import { Hash, Tag, type Context, type Emitter, type Liquid, type Parser, type TagToken, type TopLevelToken } from "liquidjs";
import type { TagClass } from "../defineTag";
import { attrString } from "../escape";

export const PAGEHUB_BADGE_ATTR = "data-pagehub-badge";
export const PAGEHUB_BADGE_HREF = "https://pagehub.dev/?ref=badge";
export const PAGEHUB_BADGE_LABEL = "Made with PageHub";

const DEFAULT_CLASS = "text-sm hover:underline";

export class PagehubBadgeTag extends Tag {
  private readonly hash: Hash;

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, _parser?: Parser) {
    super(token, remainTokens, liquid);
    this.hash = new Hash(this.tokenizer.remaining());
    for (const key of Object.keys(this.hash.hash)) {
      if (key !== "class") throw new Error(`pagehub_badge: unknown argument "${key}" (use class)`);
    }
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const { class: cls } = (yield this.hash.render(ctx)) as { class?: unknown };
    const attrs = { class: String(cls ?? "").trim() || DEFAULT_CLASS, href: PAGEHUB_BADGE_HREF, target: "_blank", rel: "noopener", [PAGEHUB_BADGE_ATTR]: true };
    emitter.write(`<a${attrString(attrs)}>${PAGEHUB_BADGE_LABEL}</a>`);
  }
}

export const PagehubBadge = PagehubBadgeTag as unknown as TagClass;
