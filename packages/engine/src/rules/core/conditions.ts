/**
 * Conditions that read one way and render another. In Liquid `blank` matches `false` and nil as well as empty, so
 * `x == blank or x == true` is also true when `x` is false: a sold-out product (`inStock: false`) rendered its
 * "Add to cart" button next to "Sold out". The meaning the author wanted, "unknown or true", is `x != false`.
 */
import type { LiquidHtmlNode, Range } from "../../parse/parse";
import { defineRule } from "../defineRule";

type ConditionNode = LiquidHtmlNode & { name: string | null; blockStartPosition?: Range };

const PATH = String.raw`[A-Za-z_][\w.\-]*(?:\[[^\]]*\][\w.\-]*)*`;
const BLANK_OR_TRUE = new RegExp(
  String.raw`(${PATH})\s*==\s*blank\s+or\s+\1\s*==\s*true\b|(${PATH})\s*==\s*true\s+or\s+\2\s*==\s*blank\b`,
  "g",
);
const OPENERS = new Set(["if", "unless", "elsif"]);

export const noBlankOrTrue = defineRule({
  meta: {
    id: "no-blank-or-true",
    severity: "error",
    description: "`x == blank or x == true` is also true when x is false (blank matches false); write `x != false`.",
  },
  create: (ctx) => {
    const seen = new Set<number>();
    const check = (node: ConditionNode) => {
      if (!node.name || !OPENERS.has(node.name)) return;
      const at = node.blockStartPosition ?? node.position;
      const text = ctx.source.slice(at.start, at.end);
      for (const m of text.matchAll(BLANK_OR_TRUE)) {
        const start = at.start + m.index!;
        if (seen.has(start)) continue;
        seen.add(start);
        const path = m[1] ?? m[2]!;
        const range = { start, end: start + m[0].length };
        ctx.report({
          range,
          message: `"${path} == blank" is also true when ${path} is false, so this condition is true for false too. Write "${path} != false"`,
          fix: [{ from: range.start, to: range.end, insert: `${path} != false` }],
        });
      }
    };
    return { LiquidTag: check, LiquidBranch: check };
  },
});
