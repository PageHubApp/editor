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
/** The badge's mark: 14px, `currentColor`, decorative. */
export const PAGEHUB_BADGE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;

const DEFAULT_CLASS = "inline-flex items-center gap-1 text-sm hover:underline";

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
    emitter.write(`<a${attrString(attrs)}>${PAGEHUB_BADGE_ICON}${PAGEHUB_BADGE_LABEL}</a>`);
  }
}

export const PagehubBadge = PagehubBadgeTag as unknown as TagClass;
