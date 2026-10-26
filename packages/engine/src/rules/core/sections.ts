/** Rules for `{% section %}` arguments (section settings live in the page file). */
import { readTagArguments, type Splice } from "../../edit/ops";
import { NodeTypes, type LiquidHtmlNode } from "../../parse/parse";
import { readSchema, sectionSettingsFromArgs } from "../../runtime/tags/schema";
import { defineRule, type RuleContext } from "../defineRule";

type SectionTag = LiquidHtmlNode & { name: string; markup: { name?: { type: string; value?: string } } };
const isLiteralType = (type: string, source: string) =>
  type === "String" || type === "Number" || (type === "LiquidLiteral" && (source.trim() === "true" || source.trim() === "false"));

/** The schema of the section a `{% section 'name' %}` tag renders, from the bundle. */
function schemaFor(ctx: RuleContext, tag: SectionTag) {
  const n = tag.markup?.name;
  if (!n || n.type !== NodeTypes.String || typeof n.value !== "string") return null;
  const src = ctx.file(`sections/${n.value}.liquid`);
  return src === undefined ? null : readSchema(src).schema;
}

export const sectionLiteralArgs = defineRule({
  meta: { id: "section-literal-args", severity: "error", description: "A {% section %} argument must be a string, number, true or false literal." },
  create: (ctx) => ({
    LiquidTag(node: SectionTag) {
      if (node.name !== "section") return;
      for (const arg of readTagArguments(ctx.source, node)) {
        if (!isLiteralType(arg.type, arg.source)) ctx.report({ range: arg.range, message: `section argument "${arg.name}" must be a string, number, true or false literal` });
      }
    },
  }),
});

export const sectionSettingType = defineRule({
  meta: { id: "section-setting-type", severity: "error", needs: ["bundle"], description: "A {% section %} argument literal must match the type of its schema setting." },
  create: (ctx) => ({
    LiquidTag(node: SectionTag) {
      if (node.name !== "section") return;
      const schema = schemaFor(ctx, node);
      if (!schema) return;
      const args = readTagArguments(ctx.source, node).filter((a) => isLiteralType(a.type, a.source));
      for (const issue of sectionSettingsFromArgs(schema, args).issues) {
        if (issue.rule !== "section-setting-type") continue;
        const arg = args.find((a) => a.name === issue.arg)!;
        ctx.report({ range: arg.range, message: `section argument "${arg.name}" has the wrong type for its setting` });
      }
    },
  }),
});

export const sectionUnknownSetting = defineRule({
  meta: { id: "section-unknown-setting", severity: "warning", needs: ["bundle"], description: "A {% section %} argument with no setting id in the section's schema." },
  create: (ctx) => ({
    LiquidTag(node: SectionTag) {
      if (node.name !== "section") return;
      const schema = schemaFor(ctx, node);
      if (!schema) return;
      const args = readTagArguments(ctx.source, node);
      for (const issue of sectionSettingsFromArgs(schema, args).issues) {
        if (issue.rule !== "section-unknown-setting") continue;
        const arg = args.find((a) => a.name === issue.arg)!;
        // The argument is `name: value`; its name starts after the preceding comma.
        let from = arg.range.start;
        while (from > node.position.start && ctx.source[from] !== ",") from--;
        const splices: Splice[] = ctx.source[from] === "," ? [{ from, to: arg.range.end, insert: "" }] : [];
        ctx.report({
          range: arg.range,
          message: `"${arg.name}" is not a setting of this section`,
          ...(splices.length ? { suggestions: [{ desc: `Remove the "${arg.name}" argument`, splices }] } : {}),
        });
      }
    },
  }),
});
