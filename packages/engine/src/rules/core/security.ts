/**
 * Rules that keep stored source well-formed for the editor and the renderer. A site's own JavaScript (`<script>`,
 * `on*` handlers, `javascript:` URLs) is the owner's and is kept (docs/action-items/specs/site-js-allowed.md): the
 * editor canvas runs it nowhere, and the site runs it on its own origin. `noInlineJs` is not in the shipped rules; it is
 * for PageHub's own catalogs (library blocks, templates) and for listing a page's scripts.
 */
import { removeSplices } from "../../edit/ops";
import { EDITABLE_ATTRIBUTE, EDIT_ATTRIBUTES, isEditAttribute, validateEditAttribute } from "../../attributes/editAttributes";
import { NodeTypes, elementName, type ElementNode, type LiquidHtmlNode } from "../../parse/parse";
import { HTML_SETTING_TYPES, inputSettings, readSchema } from "../../runtime/tags/schema";
import { defineRule } from "../defineRule";
import { attrsOf, removeWithLeadingSpace } from "../util";

const URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href"]);
const JSON_SCRIPT_TYPES = new Set(["application/ld+json", "application/json"]);

const NAMED_REFS: Record<string, string> = { colon: ":", tab: "\t", newline: "\n" };
const refChar = (n: number) => (Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");

/**
 * Browsers decode character references in an attribute (`java&#115;cript:`, `javascript&colon;`) and ignore whitespace
 * and control characters inside a scheme (`java\tscript:`).
 */
const unsafeUrl = (prefix: string): boolean => {
  const v = prefix
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => refChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d: string) => refChar(parseInt(d, 10)))
    .replace(/&(colon|tab|newline);/gi, (_m, name: string) => NAMED_REFS[name.toLowerCase()]!)
    .replace(/[\u0000- ]/g, "")
    .toLowerCase();
  return v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("data:text/html");
};

/**
 * The JavaScript one element carries: the element itself when it is a `<script>` that isn't JSON data (`attr: null`),
 * and each `on*` attribute and `javascript:` / `vbscript:` / `data:text/html` URL (`attr`: its index in `attrs`).
 * `value` is the attribute's static text (a dynamic `type` counts as script). Shared by `noInlineJs` and the import report.
 */
export function jsIn(tag: string, attrs: ReadonlyArray<{ name: string; value: string; dynamic?: boolean; starts?: readonly string[] }>): Array<{ attr: number | null; message: string }> {
  const out: Array<{ attr: number | null; message: string }> = [];
  const t = tag.toLowerCase();
  if (t === "script") {
    const type = attrs.find((a) => a.name === "type");
    if (!type || type.dynamic || !JSON_SCRIPT_TYPES.has(type.value.trim().toLowerCase())) {
      const src = attrs.find((a) => a.name === "src");
      out.push({ attr: null, message: src ? `<script src="${src.value}">` : "inline <script>" });
    }
  }
  attrs.forEach((a, i) => {
    if (a.name.startsWith("on")) out.push({ attr: i, message: `inline event handler ${a.name} on <${t}>` });
    else if (URL_ATTRS.has(a.name) && (unsafeUrl(a.value) || a.starts?.some(unsafeUrl))) out.push({ attr: i, message: `script URL in ${a.name} on <${t}>` });
  });
  return out;
}

/**
 * Every piece of JavaScript in a file (`jsIn`). Its sanitize fix removes them. Not a shipped rule: PageHub's own
 * catalogs (library blocks, templates, AI sections) add it; a site keeps its JS.
 */
export const noInlineJs = defineRule({
  meta: { id: "no-inline-js", severity: "error", fixKind: "sanitize", description: "No on* attributes, <script> (except JSON), or javascript:/vbscript:/data:text/html URLs (PageHub catalogs only; sites may carry JS)." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      const attrs = attrsOf(el);
      for (const f of jsIn(elementName(el), attrs.map((a) => ({ name: a.name, value: a.name.startsWith("on") || a.name === "type" ? a.value : a.prefix, dynamic: a.dynamic, starts: a.starts })))) {
        const a = f.attr === null ? null : attrs[f.attr]!;
        if (!a) ctx.report({ node: el, message: f.message, fix: removeSplices(ctx.source, el) });
        else ctx.report({ range: a.range, message: f.message, fix: [removeWithLeadingSpace(ctx.source, a.range)] });
      }
    },
  }),
});

export const noLiquidTagInScript = defineRule({
  meta: { id: "no-liquid-tag-in-script", severity: "error", description: "No {% %} inside <script> or <style>; outputs only in JSON scripts and {% style %}." },
  create: (ctx) => ({
    HtmlRawNode(el: Extract<ElementNode, { type: NodeTypes.HtmlRawNode }>) {
      const name = elementName(el).toLowerCase();
      if (name !== "script" && name !== "style") return;
      const body = el.body.position;
      const text = ctx.source.slice(body.start, body.end);
      for (const m of text.matchAll(/\{%-?[\s\S]*?-?%\}/g)) {
        ctx.report({ range: { start: body.start + m.index!, end: body.start + m.index! + m[0].length }, message: `Liquid tag inside <${name}>` });
      }
    },
  }),
});

export const rawOnlyTrusted = defineRule({
  meta: { id: "raw-only-trusted", severity: "error", description: "| raw only directly after a trusted-HTML filter, or on a section setting of a trusted-HTML type." },
  create(ctx) {
    let htmlSettings: Set<string> | undefined;
    const settingIds = () => (htmlSettings ??= new Set(inputSettings(readSchema(ctx.source).schema ?? { name: "" }).filter((s) => HTML_SETTING_TYPES.has(s.type)).map((s) => s.id)));
    return {
      LiquidVariableOutput(node: LiquidHtmlNode & { markup: { expression: any; filters: Array<{ name: string; position: { start: number; end: number } }> } | string }) {
        const m = node.markup;
        if (typeof m === "string") return;
        m.filters.forEach((f, i) => {
          if (f.name !== "raw") return;
          const prev = m.filters[i - 1];
          const e = m.expression;
          const trustedSetting =
            !prev && e?.type === NodeTypes.VariableLookup && e.name === "section" && e.lookups.length === 2 &&
            e.lookups[0].value === "settings" && settingIds().has(e.lookups[1].value);
          if ((prev && ctx.trustedFilters.has(prev.name)) || trustedSetting) return;
          ctx.report({
            range: f.position,
            message: prev ? `| raw after "${prev.name}", which does not return trusted HTML` : "| raw on a value that is not a trusted-HTML section setting",
            suggestions: [{ desc: "Remove | raw (output is escaped)", splices: [{ from: f.position.start, to: f.position.end, insert: "" }] }],
          });
        });
      },
    };
  },
});

export const editorAttrValue = defineRule({
  meta: { id: "editor-attr-value", severity: "error", fixKind: "sanitize", description: "data-edit-* and data-editable attributes must carry valid values; data-edit-src is never stored." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      for (const a of attrsOf(el)) {
        if (!isEditAttribute(a.name) && a.name !== EDITABLE_ATTRIBUTE) continue;
        if (a.dynamic) {
          ctx.report({ range: a.range, message: `${a.name} must be static` });
          continue;
        }
        const problem = validateEditAttribute(a.name, a.value);
        if (!problem) continue;
        ctx.report({
          range: a.range,
          message: problem,
          ...(a.name === EDIT_ATTRIBUTES.src ? { fix: [removeWithLeadingSpace(ctx.source, a.range)] } : {}),
        });
      }
    },
  }),
});
