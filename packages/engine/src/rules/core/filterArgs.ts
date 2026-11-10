/**
 * A built-in filter's literal arguments against its argument schema (`FILTER_ARGS` in runtime/builtins): the same
 * check the renderer makes before it runs the filter, so `where: 'featured', [1]` or `image_url: width: 'big'` is
 * refused at write time instead of failing the page at render. Only literals are checked; a variable's value is
 * known at render time. An argument count that doesn't fit is checked too: the count is in the source.
 */
import type { LiquidHtmlNode, Range } from "../../parse/parse";
import { BUILTIN_FILTER_DEFS } from "../../runtime/builtins";
import type { Schema } from "../../schema/t";
import { defineRule } from "../defineRule";

type ArgNode = { type: string; name?: string; value?: unknown; position: Range };
type FilterNode = LiquidHtmlNode & { name: string; args: ArgNode[] };

const DEFS = new Map(BUILTIN_FILTER_DEFS.map((f) => [f.name, f]));
const UNKNOWN = Symbol("not a literal");

/** A literal argument's value as the renderer sees it (`nil` counts as absent), or UNKNOWN for anything else. */
function literal(n: ArgNode): unknown {
  if (n.type === "String") return n.value;
  if (n.type === "Number") return Number(n.value);
  if (n.type === "LiquidLiteral") return n.value ?? undefined;
  return UNKNOWN;
}

export const filterLiteralArgs = defineRule({
  meta: { id: "filter-literal-args", severity: "error", description: "A built-in filter's literal arguments must fit its argument types." },
  create: (ctx) => ({
    LiquidFilter(node: FilterNode) {
      const def = DEFS.get(node.name);
      if (!def) return;
      const last = def.args.at(-1);
      const hash = last?.type === "hash" ? last : undefined;
      const positional: readonly Schema<any>[] = hash ? def.args.slice(0, -1) : def.args;
      const pos = node.args.filter((a) => a.type !== "NamedArgument");
      const named = node.args.filter((a) => a.type === "NamedArgument");
      const fail = (range: Range, error: string) => ctx.report({ range, message: `filter "${def.name}" ${error}` });

      if (pos.length > positional.length) return fail(node.position, `takes ${positional.length} argument(s), got ${pos.length}`);
      positional.forEach((schema, i) => {
        const arg = pos[i];
        const value = arg ? literal(arg) : undefined;
        if (value === UNKNOWN) return;
        const r = schema.check(value);
        if (!r.ok) fail(arg?.position ?? node.position, `argument ${i + 1}: ${r.error}`);
      });
      if (named.length && !hash) return fail(named[0]!.position, `takes no options (got ${named.map((a) => a.name).join(", ")})`);
      for (const arg of named) {
        const schema = hash!.spec.shape![arg.name!];
        if (!schema) {
          fail(arg.position, `option unknown key ${arg.name}`);
          continue;
        }
        const value = literal(arg.value as ArgNode);
        if (value === UNKNOWN || value === undefined) continue;
        const r = schema.check(value);
        if (!r.ok) fail(arg.position, `option ${arg.name}: ${r.error}`);
      }
    },
  }),
});
