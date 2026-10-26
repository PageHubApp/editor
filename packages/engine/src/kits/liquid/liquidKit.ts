/**
 * `liquidKit()`: Liquid control flow and site tags as elements, the wrap / argument
 * commands, the component commands (`component.convert` / `component.unlink`), the parser environment for the built-in block tags (`{% map %}` …), and the Liquid
 * rules. `unknown-tag` / `unknown-filter` / `raw-only-trusted` read the configured tags and
 * filters (the editor builds their registry from `tagsFacet` / `filtersFacet`).
 */
import { defineCommand, type CommandContext } from "../../commands/defineCommand";
import { defineElement } from "../../elements/defineElement";
import { arg } from "../../elements/bindings";
import { BLOCK_COMMANDS, build, liquidTarget, removeArgSplice } from "./blockCommands";
import { COMPONENT_COMMANDS } from "./componentCommands";
import { SCRIPT_COMMANDS } from "./scriptCommands";
import type { NodeHandle } from "../../state/handles";
import { parserTagsFacet } from "../../extensions/facets";
import type { Extension } from "../../extensions/extension";
import { builtinParserTags } from "../../runtime/tags/builtinTags";
import { noLiquidTagInScript, rawOnlyTrusted } from "../../rules/core/security";
import { sectionLiteralArgs, sectionSettingType, sectionUnknownSetting } from "../../rules/core/sections";
import { unknownFilter, unknownTag } from "../../rules/core/registryRules";
import { noDanglingClose, noDanglingOpen, noLiquidInAttrList, noTagInAttrValue, staticAttrName, staticTagName } from "../../rules/core/structural";
import { t } from "../../schema/t";
import type { TreeNode } from "../../parse/tree";
import { isSafeExpression } from "../../schema/t";
import { typeSpec } from "../../elements/inspectorSpec";

const liquid = (name: string) => ({ tag: "liquid" as const, name });
const s = () => t.string().optional();

export const forElement = defineElement({ name: "liquid.for", match: liquid("for"), props: {}, describe: "{% for item in list %} — repeats its body per item; `{% else %}` renders when the list is empty." });
export const ifElement = defineElement({ name: "liquid.if", match: liquid("if"), props: {}, describe: "{% if condition %} with optional {% elsif %} / {% else %} branches." });
export const unlessElement = defineElement({ name: "liquid.unless", match: liquid("unless"), props: {}, describe: "{% unless condition %} — renders its body when the condition is false." });
export const caseElement = defineElement({ name: "liquid.case", match: liquid("case"), props: {}, describe: "{% case value %} with {% when %} / {% else %} branches." });
export const renderElement = defineElement({ name: "liquid.render", match: liquid("render"), props: {}, describe: "{% render 'partial' %} — includes partials/<name>.liquid with its own scope." });
export const sectionElement = defineElement({
  name: "liquid.section",
  match: liquid("section"),
  props: {},
  describe: "{% section 'name', setting: value %} — a section partial; its {% schema %} declares the settings, the arguments hold their values.",
});
export const formTagElement = defineElement({ inspector: typeSpec("form"), name: "liquid.form", match: liquid("form"), props: { class: arg("class", s()), id: arg("id", s()) }, describe: "{% form 'type' %} — a site form the host handles." });
export const mapElement = defineElement({ inspector: typeSpec("map"),
  name: "liquid.map",
  match: liquid("map"),
  props: {
    lat: arg("lat", t.number().optional()),
    lng: arg("lng", t.number().optional()),
    zoom: arg("zoom", t.number().optional()),
    mode: arg("mode", t.enum(["interactive", "static", "background"]).optional()),
    tiles: arg("tiles", t.enum(["osm"]).optional()),
    grayscale: arg("grayscale", t.boolean().optional()),
    title: arg("title", s()),
  },
  describe: "{% map lat: 1, lng: 2, zoom: 12, tiles: 'osm', grayscale: true %} — an interactive map with pin and route children.",
});
export const paginateElement = defineElement({ name: "liquid.paginate", match: liquid("paginate"), props: {}, describe: "{% paginate list by n %} — pages a list; exposes `paginate`." });
export const rawElement = defineElement({
  name: "liquid.raw",
  match: (n: TreeNode) => (n.kind === "liquid-block" && n.tag === "raw") || (n.kind === "content" && n.type === "LiquidRawTag" && (n.node as { name?: string }).name === "raw"),
  props: {},
  describe: "{% raw %} — its body is output as written, not run as Liquid.",
});
export const captureElement = defineElement({ name: "liquid.capture", match: liquid("capture"), props: {}, describe: "{% capture name %} — renders its body into a variable." });

export const LIQUID_ELEMENTS = [forElement, ifElement, unlessElement, caseElement, renderElement, sectionElement, formTagElement, mapElement, paginateElement, rawElement, captureElement] as const;

/** A Liquid expression fragment that can't break out of its tag. */

function wrapWith(ctx: CommandContext, open: string, close: string, at?: NodeHandle): boolean {
  const h = at ?? ctx.selection.primary;
  if (!h?.alive) return false;
  return build(ctx, (tr) => void tr.wrap(h, open, close));
}

export const wrapIf = defineCommand<{ condition: string; at?: NodeHandle }>({
  id: "liquid.wrapIf",
  title: "Show only if…",
  run: (ctx, args) => !!args && isSafeExpression(args.condition) && wrapWith(ctx, `{% if ${args.condition.trim()} %}`, "{% endif %}", args.at),
});

export const wrapFor = defineCommand<{ item: string; collection: string; at?: NodeHandle }>({
  id: "liquid.wrapFor",
  title: "Repeat for each…",
  run: (ctx, args) => !!args && /^[a-z_][a-z0-9_]*$/i.test(args.item ?? "") && isSafeExpression(args.collection) && wrapWith(ctx, `{% for ${args.item} in ${args.collection.trim()} %}`, "{% endfor %}", args.at),
});

/**
 * Set a Liquid tag argument; `value` is source text (a literal or an expression). An empty
 * value removes the argument and its separator. `at` defaults to the primary selection.
 */
export const setArg = defineCommand<{ name: string; value: string; at?: NodeHandle }>({
  id: "liquid.setArg",
  title: "Set argument",
  run(ctx, args) {
    const h = liquidTarget(ctx, args?.at);
    if (!h || !args || !/^[a-z_][\w-]*$/i.test(args.name ?? "")) return false;
    if (args.value === "") {
      const s = removeArgSplice(ctx.tr.text(h.path), h, args.name);
      return !!s && build(ctx, (tr) => void tr.replace({ path: h.path, from: s.from, to: s.to }, ""));
    }
    if (!isSafeExpression(args.value) || h.args().find((a) => a.name === args.name)?.source === args.value) return false;
    return build(ctx, (tr) => void tr.setTagArg(h, args.name, args.value));
  },
});

export const LIQUID_COMMANDS = [wrapIf, wrapFor, setArg, ...BLOCK_COMMANDS, ...COMPONENT_COMMANDS, ...SCRIPT_COMMANDS] as const;

export const LIQUID_RULES = [
  noLiquidInAttrList, noTagInAttrValue, noDanglingOpen, noDanglingClose, staticAttrName, staticTagName,
  unknownTag, unknownFilter, noLiquidTagInScript, rawOnlyTrusted, sectionLiteralArgs, sectionSettingType, sectionUnknownSetting,
] as const;

const DEFAULT: Extension = [LIQUID_ELEMENTS, LIQUID_COMMANDS, LIQUID_RULES, builtinParserTags().map((p) => parserTagsFacet.of(p))];

/** Same value on every call, so listing the kit twice registers it once. */
export function liquidKit(): Extension {
  return DEFAULT;
}
