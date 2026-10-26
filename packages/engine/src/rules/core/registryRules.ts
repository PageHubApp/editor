/** Rules that check names against what the site registers (`ctx.registry`); inert when no registry is supplied. */
import type { LiquidHtmlNode } from "../../parse/parse";
import { defineRule } from "../defineRule";

export const unknownTag = defineRule({
  meta: { id: "unknown-tag", severity: "error", description: "A Liquid tag that is not registered (including removed tags)." },
  create(ctx) {
    const known = ctx.registry.tags;
    if (!known) return {};
    const check = (node: LiquidHtmlNode) => {
      const name = (node as unknown as { name: string }).name;
      if (known.has(name)) return;
      ctx.report({
        node,
        message: ctx.registry.removedTags?.has(name) ? `{% ${name} %} was removed from this Liquid` : `unknown tag {% ${name} %}`,
      });
    };
    return { LiquidTag: check, LiquidRawTag: check };
  },
});

export const unknownFilter = defineRule({
  meta: { id: "unknown-filter", severity: "error", description: "A Liquid filter that is not registered." },
  create(ctx) {
    const known = ctx.registry.filters;
    if (!known) return {};
    return {
      LiquidFilter(node: LiquidHtmlNode & { name: string }) {
        if (!known.has(node.name)) ctx.report({ node, message: `unknown filter "${node.name}"` });
      },
    };
  },
});
