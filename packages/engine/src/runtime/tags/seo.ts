/**
 * `{% seo item: item, title: t, description: d, image: i %}` — the page's head, set from Liquid. Renders nothing.
 *
 * A detail page serves one URL per collection row, but its stored SEO is one record. Written inside the loop that reads
 * the row, `item:` names that row so the stored SEO's `{{item.*}}` bindings resolve against it; the other arguments set
 * a head field directly and win over the stored SEO. Values are expressions (no filters: `assign` first). Blank values
 * are ignored; the last call wins per field. The host reads the result from `PageMeta` after the render.
 */
import { Hash, Tag, type Context, type Liquid, type Parser, type TagToken, type TopLevelToken } from "liquidjs";
import type { TagClass } from "../defineTag";

export const SEO_FIELDS = ["title", "description", "image", "og_title", "og_description", "canonical"] as const;
export type SeoField = (typeof SEO_FIELDS)[number];

/** What a render's `{% seo %}` calls set. */
export interface PageMeta {
  item?: Record<string, unknown>;
  fields: Partial<Record<SeoField, string>>;
}

const KNOWN = new Set<string>(["item", ...SEO_FIELDS]);

export function createSeoTag(meta: PageMeta): TagClass {
  return class SeoTag extends Tag {
    private readonly hash: Hash;

    constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, _parser?: Parser) {
      super(token, remainTokens, liquid);
      this.hash = new Hash(this.tokenizer.remaining());
      for (const key of Object.keys(this.hash.hash)) {
        if (!KNOWN.has(key)) throw new Error(`seo: unknown argument "${key}" (use item, ${SEO_FIELDS.join(", ")})`);
      }
    }

    *render(ctx: Context): Generator<unknown, void, unknown> {
      const args = (yield this.hash.render(ctx)) as Record<string, unknown>;
      for (const [key, value] of Object.entries(args)) {
        if (key === "item") {
          if (value && typeof value === "object" && !Array.isArray(value)) meta.item = value as Record<string, unknown>;
          continue;
        }
        const text = value == null ? "" : String(value).trim();
        if (text) meta.fields[key as SeoField] = text;
      }
    }
  } as unknown as TagClass;
}
