/** Accessibility and document-outline warnings. */
import { elementName, type ElementNode, type LiquidHtmlNode } from "../../parse/parse";
import { defineRule } from "../defineRule";
import { attrOf } from "../util";

/** A heading counts as static when no Liquid control flow wraps it (it renders exactly once). */
const isStatic = (ancestors: readonly LiquidHtmlNode[]) => !ancestors.some((a) => a.type === "LiquidBranch" || (a.type === "LiquidTag" && "children" in a));

export const imgAlt = defineRule({
  meta: { id: "img-alt", severity: "warning", description: "<img> needs an alt attribute (alt=\"\" is fine for decoration)." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      if (elementName(el).toLowerCase() !== "img" || attrOf(el, "alt")) return;
      const at = el.position.start + 1 + elementName(el).length;
      ctx.report({ node: el, message: "<img> without alt", suggestions: [{ desc: 'Add alt=""', splices: [{ from: at, to: at, insert: ' alt=""' }] }] });
    },
  }),
});

const NO_LABEL_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

export const inputLabel = defineRule({
  meta: { id: "input-label", severity: "warning", description: "input / select / textarea needs a label, aria-label or aria-labelledby." },
  create(ctx) {
    const labelFor = new Set<string>();
    const pending: Array<{ el: ElementNode; id: string | undefined }> = [];
    return {
      Element(el: ElementNode) {
        const tag = elementName(el).toLowerCase();
        if (tag === "label") {
          const f = attrOf(el, "for");
          if (f) labelFor.add(f.value.trim());
          return;
        }
        if (tag !== "input" && tag !== "select" && tag !== "textarea") return;
        const type = attrOf(el, "type");
        if (tag === "input" && type && (type.dynamic || NO_LABEL_TYPES.has(type.value.trim().toLowerCase()))) return;
        if (attrOf(el, "aria-label") || attrOf(el, "aria-labelledby")) return;
        if (ctx.ancestors.some((a) => a.type === "HtmlElement" && elementName(a as ElementNode).toLowerCase() === "label")) return;
        const id = attrOf(el, "id");
        if (id?.dynamic) return; // can't match a dynamic id statically
        pending.push({ el, id: id?.value.trim() });
      },
      "Program:exit"() {
        for (const { el, id } of pending) {
          if (id && labelFor.has(id)) continue;
          ctx.report({ node: el, message: `<${elementName(el)}> has no label` });
        }
      },
    };
  },
});

const headingLevel = (el: ElementNode): number => {
  const m = /^h([1-6])$/.exec(elementName(el).toLowerCase());
  return m ? Number(m[1]) : 0;
};

export const headingOrder = defineRule({
  meta: { id: "heading-order", severity: "warning", description: "Heading level must not jump by more than one (static headings only)." },
  create(ctx) {
    let prev = 0;
    return {
      Element(el: ElementNode) {
        const level = headingLevel(el);
        if (!level || !isStatic(ctx.ancestors)) return;
        if (prev && level > prev + 1) ctx.report({ node: el, message: `<h${level}> follows <h${prev}>` });
        prev = level;
      },
    };
  },
});

export const singleH1 = defineRule<{ pageFile?: (path: string) => boolean } | undefined>({
  meta: { id: "single-h1", severity: "warning", description: "More than one static <h1> in a page file." },
  create(ctx) {
    const isPage = ctx.options?.pageFile ?? ((p: string) => !/^(sections|snippets|blocks)\//.test(p));
    if (!isPage(ctx.path)) return {};
    let seen = 0;
    return {
      Element(el: ElementNode) {
        if (headingLevel(el) !== 1 || !isStatic(ctx.ancestors)) return;
        if (++seen > 1) ctx.report({ node: el, message: "more than one <h1> on the page" });
      },
    };
  },
});
