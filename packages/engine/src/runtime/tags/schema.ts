/**
 * Section schema reader: Shopify's `{% schema %}` JSON, exactly.
 * Pure functions, shared by the `section` tag (runtime), lint and the editor.
 */
import type { Environment } from "../../parse/environment";
import type { TagArgument } from "../../edit/ops";
import type { Range } from "../../parse/parse";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type SchemaInputType =
  | "checkbox" | "number" | "radio" | "range" | "select" | "text" | "textarea"
  | "article" | "article_list" | "blog" | "collection" | "collection_list" | "color" | "color_background"
  | "color_palette" | "color_scheme" | "color_scheme_group" | "font_picker" | "html" | "image_picker"
  | "inline_richtext" | "link_list" | "liquid" | "metaobject" | "metaobject_list" | "page" | "product"
  | "product_list" | "richtext" | "text_alignment" | "url" | "video" | "video_url";

export type SchemaSetting =
  | { type: "header"; content: string; info?: string }
  | { type: "paragraph"; content: string }
  | {
      type: SchemaInputType; id: string; label: string; default?: JsonValue; info?: string;
      placeholder?: string; options?: Array<{ value: string; label: string; group?: string }>;
      min?: number; max?: number; step?: number; unit?: string; limit?: number;
      metaobject_type?: string; accept?: Array<"youtube" | "vimeo">;
    };

export interface SectionSchema {
  name: string; tag?: string; class?: string; limit?: number;
  settings?: SchemaSetting[]; blocks?: unknown[]; max_blocks?: number;
  presets?: Array<{ name: string; settings?: Record<string, JsonValue> }>;
  default?: JsonValue; locales?: Record<string, JsonValue>; enabled_on?: JsonValue; disabled_on?: JsonValue;
}

export const SCHEMA_INPUT_TYPES: ReadonlySet<string> = new Set<SchemaInputType>([
  "checkbox", "number", "radio", "range", "select", "text", "textarea", "article", "article_list", "blog",
  "collection", "collection_list", "color", "color_background", "color_palette", "color_scheme",
  "color_scheme_group", "font_picker", "html", "image_picker", "inline_richtext", "link_list", "liquid",
  "metaobject", "metaobject_list", "page", "product", "product_list", "richtext", "text_alignment", "url",
  "video", "video_url",
]);

/** Setting types whose value is a handle resolved by a data source (`*_list`: comma-separated handles). */
export const RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "product", "collection", "page", "blog", "article", "metaobject",
  "product_list", "collection_list", "article_list", "metaobject_list",
]);
export const RESOURCE_LIST_TYPES: ReadonlySet<string> = new Set(["product_list", "collection_list", "article_list", "metaobject_list"]);

const NUMBER_TYPES = new Set(["number", "range"]);
/** Types the schema marks as trusted HTML (`| raw` is allowed on them). */
export const HTML_SETTING_TYPES: ReadonlySet<string> = new Set(["richtext", "html", "inline_richtext"]);
const THEME_ONLY = new Set(["color_palette", "color_scheme_group"]);
const MAX_LIST_LIMIT = 50;

const SCHEMA_BLOCK = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;

/** Find and parse the `{% schema %}` block. `env` is accepted for parity with the parser-backed readers; the block is raw text. */
export function readSchema(source: string, _opts: { env?: Environment } = {}): { schema: SectionSchema | null; range: Range | null; errors: string[] } {
  const m = SCHEMA_BLOCK.exec(source);
  if (!m) return { schema: null, range: null, errors: [] };
  const start = m.index + m[0].indexOf(m[1]!);
  const range: Range = { start, end: start + m[1]!.length };
  try {
    const parsed: unknown = JSON.parse(m[1]!);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { schema: null, range, errors: ["schema must be a JSON object"] };
    return { schema: parsed as SectionSchema, range, errors: [] };
  } catch (e) {
    return { schema: null, range, errors: [`schema is not valid JSON: ${(e as Error).message}`] };
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Required attributes per type (Shopify's verified list). Returns human-readable problems, empty when valid. */
export function validateSchema(schema: SectionSchema): string[] {
  const errors: string[] = [];
  if (typeof schema.name !== "string" || !schema.name) errors.push('schema needs a "name"');
  const settings = schema.settings ?? [];
  if (!Array.isArray(settings)) return [...errors, '"settings" must be an array'];
  const ids = new Set<string>();
  settings.forEach((raw, i) => {
    const s = raw as unknown as Record<string, unknown>;
    const at = `settings[${i}]`;
    if (!isObj(s) || typeof s.type !== "string") return void errors.push(`${at}: "type" is required`);
    const type = s.type;
    if (type === "header" || type === "paragraph") {
      if (typeof s.content !== "string" || !s.content) errors.push(`${at}: ${type} needs "content"`);
      return;
    }
    if (!SCHEMA_INPUT_TYPES.has(type)) return void errors.push(`${at}: unknown setting type "${type}"`);
    if (THEME_ONLY.has(type)) errors.push(`${at}: "${type}" is only valid in theme settings, not a section`);
    if (typeof s.id !== "string" || !s.id) errors.push(`${at}: "id" is required`);
    else if (ids.has(s.id)) errors.push(`${at}: duplicate id "${s.id}"`);
    else ids.add(s.id);
    if (typeof s.label !== "string" || !s.label) errors.push(`${at}: "label" is required`);
    if ((type === "select" || type === "radio") && !(Array.isArray(s.options) && s.options.length)) errors.push(`${at}: ${type} needs "options"`);
    if (type === "range") {
      if (typeof s.min !== "number") errors.push(`${at}: range needs "min"`);
      if (typeof s.max !== "number") errors.push(`${at}: range needs "max"`);
    }
    if (type === "video_url" && !(Array.isArray(s.accept) && s.accept.length)) errors.push(`${at}: video_url needs "accept"`);
    if (type === "font_picker" && s.default == null) errors.push(`${at}: font_picker needs "default"`);
    if ((type === "metaobject" || type === "metaobject_list") && typeof s.metaobject_type !== "string") errors.push(`${at}: ${type} needs "metaobject_type"`);
    if (type.endsWith("_list") && typeof s.limit === "number" && s.limit > MAX_LIST_LIMIT) errors.push(`${at}: "limit" is at most ${MAX_LIST_LIMIT}`);
  });
  return errors;
}

export function inputSettings(schema: SectionSchema): Array<Extract<SchemaSetting, { id: string }>> {
  return (schema.settings ?? []).filter((s): s is Extract<SchemaSetting, { id: string }> => typeof (s as { id?: unknown }).id === "string");
}

/** Coerce one raw literal to a setting's type. `ok: false` = wrong literal type. */
export function coerceSetting(setting: Extract<SchemaSetting, { id: string }>, raw: unknown): { ok: true; value: JsonValue } | { ok: false } {
  if (setting.type === "checkbox") return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false };
  if (NUMBER_TYPES.has(setting.type)) return typeof raw === "number" && Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false };
  return typeof raw === "string" ? { ok: true, value: raw } : { ok: false };
}

/** Schema defaults; a checkbox without a default is `false`, everything else is absent. */
export function settingDefaults(schema: SectionSchema): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const s of inputSettings(schema)) {
    if (s.default !== undefined) out[s.id] = s.default;
    else if (s.type === "checkbox") out[s.id] = false;
  }
  return out;
}

function literalOf(arg: TagArgument): { ok: true; value: unknown } | { ok: false } {
  const src = arg.source.trim();
  if (arg.type === "String") return { ok: true, value: src.slice(1, -1) };
  if (arg.type === "Number") return { ok: true, value: Number(src) };
  if (arg.type === "LiquidLiteral" && (src === "true" || src === "false")) return { ok: true, value: src === "true" };
  return { ok: false };
}

/** Section tag arguments (source form) → setting values. Pure; used by lint and the editor panel. */
export function sectionSettingsFromArgs(
  schema: SectionSchema,
  args: TagArgument[],
): { values: Record<string, JsonValue>; issues: Array<{ rule: "section-unknown-setting" | "section-setting-type"; arg: string }> } {
  const values = settingDefaults(schema);
  const issues: Array<{ rule: "section-unknown-setting" | "section-setting-type"; arg: string }> = [];
  const byId = new Map(inputSettings(schema).map((s) => [s.id, s]));
  for (const arg of args) {
    const setting = byId.get(arg.name);
    if (!setting) {
      issues.push({ rule: "section-unknown-setting", arg: arg.name });
      continue;
    }
    const lit = literalOf(arg);
    const c = lit.ok ? coerceSetting(setting, lit.value) : ({ ok: false } as const);
    if (c.ok) values[arg.name] = c.value;
    else issues.push({ rule: "section-setting-type", arg: arg.name });
  }
  return { values, issues };
}
