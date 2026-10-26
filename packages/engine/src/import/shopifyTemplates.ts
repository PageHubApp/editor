/**
 * Shopify JSON template (`templates/index.json`) -> a page of `{% section %}` tags, for importing
 * a Shopify theme into a site. (Editing a Shopify theme in place keeps its JSON.)
 */
import { liquidString } from "../edit/ops";
import { coerceSetting, inputSettings, type JsonValue, type SectionSchema } from "../runtime/tags/schema";

export interface ShopifyTemplateSection {
  type: string;
  settings?: Record<string, JsonValue>;
  blocks?: unknown;
  block_order?: string[];
  disabled?: boolean;
}
export interface ShopifyTemplate {
  sections: Record<string, ShopifyTemplateSection>;
  order: string[];
  layout?: string | false;
}
export interface TemplateReportEntry { section: string; dropped: string[]; reason: string }

const SECTION_TYPE = /^[A-Za-z0-9_-]+$/;
const ARG_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** One setting value as a Liquid literal; `null` when it can't be written as one. */
function literal(value: unknown): string | null {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") {
    try {
      return liquidString(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function templateToPage(
  template: ShopifyTemplate,
  sectionsSchemas: Record<string, SectionSchema>,
): { source: string; report: TemplateReportEntry[] } {
  const lines: string[] = [];
  const report: TemplateReportEntry[] = [];
  for (const id of template.order ?? []) {
    const entry = template.sections?.[id];
    if (!entry) {
      report.push({ section: id, dropped: [], reason: "listed in order but missing from sections" });
      continue;
    }
    if (entry.disabled) {
      report.push({ section: id, dropped: [], reason: "section is disabled, skipped" });
      continue;
    }
    if (!SECTION_TYPE.test(entry.type)) {
      report.push({ section: id, dropped: [entry.type], reason: `section type "${entry.type}" is not a valid section name, skipped` });
      continue;
    }
    const schema = sectionsSchemas[entry.type];
    const byId = new Map((schema ? inputSettings(schema) : []).map((s) => [s.id, s]));
    const args: string[] = [];
    const dropped: string[] = [];
    const reasons: string[] = [];
    for (const [key, raw] of Object.entries(entry.settings ?? {})) {
      const setting = byId.get(key);
      if (!setting || !ARG_NAME.test(key)) {
        dropped.push(key);
        reasons.push(schema ? `"${key}" is not a setting of "${entry.type}"` : `no schema for "${entry.type}"`);
        continue;
      }
      const c = coerceSetting(setting, raw);
      const lit = c.ok ? literal(c.value) : null;
      if (lit === null) {
        dropped.push(key);
        reasons.push(c.ok ? `"${key}" can't be written as a Liquid literal` : `"${key}" is not a ${setting.type} value`);
        continue;
      }
      args.push(`${key}: ${lit}`);
    }
    const blockCount = entry.blocks && typeof entry.blocks === "object" ? Object.keys(entry.blocks).length : 0;
    if (blockCount > 0 || (entry.block_order?.length ?? 0) > 0) {
      dropped.push("blocks");
      reasons.push("theme blocks are not supported yet");
    }
    lines.push(`{% section '${entry.type}'${args.length ? ", " + args.join(", ") : ""} %}`);
    if (dropped.length) report.push({ section: id, dropped, reason: [...new Set(reasons)].join("; ") });
  }
  return { source: lines.join("\n") + (lines.length ? "\n" : ""), report };
}
